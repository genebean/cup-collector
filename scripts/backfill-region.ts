#!/usr/bin/env ts-node
// Backfill missing `region` on cups where a same-series variant already has region set.
// MUST be run inside the Nix dev shell: enter with `nix develop` first.
//
// Problem this fixes: the duplicate-detection algorithm buckets cups by
//   series | country_code | scope | region | item_type | baseName(name)
// so "Atlanta" (region="Georgia") and "Atlanta 2" (region="") land in different
// buckets and are never flagged as potential duplicates, even though both are
// correct on the map. This script finds those mismatched siblings and fills in
// the empty region from the record that already has it.
//
// Usage:
//   backfill-region [--dry-run] [--prod]
//
//   --dry-run   Print what would change without writing anything.
//   --prod      Load app/.env.prod instead of app/.env.local (targets production).
//
// Credentials are read from the env file:
//   POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD

import PocketBase from "pocketbase";

// Mirrors the baseName() function in src/lib/duplicate-detection.ts.
// Must stay in sync: strips trailing " 2", " 3", " 10", etc.
function baseName(name: string): string {
  return name.replace(/\s+\d+$/, "").trim();
}

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

const knownFlags = new Set(["--dry-run", "--prod", "--help"]);
const unknownFlags = args.filter(a => a.startsWith("-") && !knownFlags.has(a));

if (args.includes("--help") || unknownFlags.length > 0) {
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag(s): ${unknownFlags.join(", ")}\n`);
  }
  console.log("Usage: backfill-region [--dry-run] [--prod] [--help]");
  console.log("");
  console.log("  --dry-run   Print what would change without writing anything.");
  console.log("  --prod      Load app/.env.prod instead of app/.env.local (targets production).");
  console.log("  --help      Show this message.");
  process.exit(unknownFlags.length > 0 ? 1 : 0);
}

const POCKETBASE_URL   = process.env.POCKETBASE_URL            || "http://localhost:8090";
const ADMIN_EMAIL      = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD   = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are not set.\n" +
    "Set them in your environment or in app/.env.local."
  );
  process.exit(1);
}

interface Cup {
  id: string;
  name: string;
  series: string;
  country_code: string;
  scope: string;
  region: string;
  item_type: string;
}

async function main() {
  console.log(`\nCup Collector — Region Backfill${isDryRun ? " (DRY RUN — no changes will be written)" : ""}`);
  console.log(`PocketBase: ${POCKETBASE_URL}\n`);

  const pb = new PocketBase(POCKETBASE_URL);
  try {
    await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  } catch (err: unknown) {
    if ((err as Record<string, unknown>)?.status === 0) {
      console.error(`PocketBase is not running at ${POCKETBASE_URL}.`);
      console.error("Start it first: pb-serve");
    } else {
      console.error("Could not authenticate with PocketBase:", err);
    }
    process.exit(1);
  }

  // Fetch every cup — getFullList handles pagination automatically.
  const cups = await pb.collection("cups").getFullList<Cup>({
    fields: "id,name,series,country_code,scope,region,item_type",
  });
  console.log(`Fetched ${cups.length} cups.\n`);

  // Group by series | country_code | scope | item_type | baseName(name),
  // deliberately leaving region OUT of the key so that variants that differ
  // only in region end up in the same bucket.
  const buckets = new Map<string, Cup[]>();
  for (const cup of cups) {
    const scope    = cup.scope     || "city";
    const itemType = cup.item_type || "mug";
    const key = `${cup.series}|${cup.country_code}|${scope}|${itemType}|${baseName(cup.name)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(cup);
    buckets.set(key, bucket);
  }

  // For each bucket, find cups missing a region when at least one sibling has one.
  const toUpdate: Array<{ cup: Cup; region: string }> = [];

  for (const members of buckets.values()) {
    // Collect all non-empty regions present in the bucket.
    const regions = [...new Set(members.map(c => c.region).filter(Boolean))];
    if (regions.length === 0) continue; // No region data in this bucket — nothing to backfill.

    // More than one distinct region would be ambiguous — skip and warn.
    if (regions.length > 1) {
      const names = members.map(c => `"${c.name}"`).join(", ");
      console.warn(
        `  SKIP — ambiguous regions [${regions.map(r => `"${r}"`).join(", ")}] ` +
        `for ${names} (${members[0].series})`
      );
      continue;
    }

    const correctRegion = regions[0];
    for (const cup of members) {
      if (!cup.region) {
        toUpdate.push({ cup, region: correctRegion });
      }
    }
  }

  if (toUpdate.length === 0) {
    console.log("No cups found with a missing region that can be backfilled. Nothing to do.");
    return;
  }

  console.log(`Found ${toUpdate.length} cup(s) to update:\n`);
  for (const { cup, region } of toUpdate) {
    console.log(`  ${cup.name} (${cup.series}) — region: "" → "${region}"  [id: ${cup.id}]`);
  }

  if (isDryRun) {
    console.log("\nDry run complete. Run without --dry-run to apply changes.");
    return;
  }

  console.log("\nApplying updates…");
  let updated = 0;
  let errors = 0;
  for (const { cup, region } of toUpdate) {
    try {
      await pb.collection("cups").update(cup.id, { region });
      console.log(`  Updated: ${cup.name} (${cup.series})`);
      updated++;
    } catch (err) {
      console.error(`  ERROR updating ${cup.name} [${cup.id}]:`, err);
      errors++;
    }
  }

  console.log("\n── Summary ──");
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors:  ${errors}`);
  if (errors > 0) {
    console.log("\nCompleted with errors. Check output above for details.");
    process.exit(1);
  } else {
    console.log("\nBackfill complete.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
