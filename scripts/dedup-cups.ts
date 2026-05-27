// PocketBase duplicate cup merger.
// Finds cups that share the same more_info_url (the canonical dedup key used by
// the catalog builder), migrates any owned_cups records from duplicates to the
// canonical cup, then deletes the duplicate cup records.
//
// Canonical selection priority:
//   1. The record whose name+series+year+item_type matches a row in cups.csv
//      (i.e. what the catalog would import) — ensures the "right" record survives.
//   2. Lowest id (alphabetical) as a stable tiebreaker when no CSV match exists.
//
// Usage (inside nix develop):
//   dedup-cups               # dry run against local PocketBase
//   dedup-cups --apply       # apply changes (local)
//   dedup-cups --prod        # dry run against production
//   dedup-cups --prod --apply

import * as fs from "fs";
import * as path from "path";
import PocketBase from "pocketbase";
import { parseCSV, type CsvRow } from "../app/src/lib/cup-import";

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");

const PROJ_ROOT = path.resolve(path.dirname(process.argv[1]), "..");
const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const ADMIN_EMAIL    = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are not set.\n" +
    "Set them in your environment or in app/.env.local."
  );
  process.exit(1);
}

interface CupRecord {
  id: string;
  name: string;
  series: string;
  item_type: string;
  year: number;
  more_info_url: string;
}

interface OwnedCupRecord {
  id: string;
  cup_id: string;
  household_id: string;
  own_photo: string;
  needs_replacing: boolean;
}

// Build a lookup key from a cup's identity fields — same fields import-cups uses for upsert.
function cupKey(name: string, series: string, year: number | string, item_type: string): string {
  return `${name.trim()}|${series.trim()}|${String(year)}|${(item_type || "mug").trim()}`;
}

async function main() {
  console.log(`\nCup Collector — Duplicate Merger${isDryRun ? " (DRY RUN — pass --apply to write changes)" : " (APPLYING CHANGES)"}`);
  console.log(`PocketBase: ${POCKETBASE_URL}\n`);

  // Load catalog CSV to determine which record in each duplicate group is canonical.
  const csvPath = path.join(PROJ_ROOT, "cups.csv");
  const catalogKeys = new Set<string>();
  if (fs.existsSync(csvPath)) {
    const rows: CsvRow[] = parseCSV(fs.readFileSync(csvPath, "utf-8"));
    for (const r of rows) catalogKeys.add(cupKey(r.name, r.series, r.year, r.item_type));
    console.log(`Loaded ${rows.length} rows from ${csvPath} for canonical selection.\n`);
  } else {
    console.warn(`cups.csv not found at ${csvPath} — falling back to id-sort for canonical selection.\n`);
  }

  const pb = new PocketBase(POCKETBASE_URL);
  try {
    await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  } catch (err: unknown) {
    if ((err as Record<string, unknown>)?.status === 0) {
      console.error(`PocketBase is not running at ${POCKETBASE_URL}.`);
    } else {
      console.error("Could not authenticate with PocketBase:", err);
    }
    process.exit(1);
  }

  // Load all cups that have a more_info_url.
  console.log("Loading cups…");
  const cups = await pb.collection("cups").getFullList<CupRecord>({
    fields: "id,name,series,item_type,year,more_info_url",
  });

  // Group by more_info_url — only care about groups with >1 entry.
  const byUrl = new Map<string, CupRecord[]>();
  for (const cup of cups) {
    const url = cup.more_info_url?.trim();
    if (!url) continue;
    const group = byUrl.get(url) ?? [];
    group.push(cup);
    byUrl.set(url, group);
  }

  const dupGroups = [...byUrl.values()].filter((g) => g.length > 1);

  if (dupGroups.length === 0) {
    console.log("No duplicate cups found — nothing to do.");
    return;
  }

  console.log(`Found ${dupGroups.length} URL(s) with duplicate cups:\n`);

  let totalMigrated = 0;
  let totalDeleted  = 0;

  for (const group of dupGroups) {
    // Prefer the record that matches the catalog CSV; fall back to id sort.
    const csvMatch = group.find((c) => catalogKeys.has(cupKey(c.name, c.series, c.year, c.item_type)));
    if (csvMatch) {
      // Move the CSV match to the front so it becomes canonical.
      group.sort((a, b) => (a.id === csvMatch.id ? -1 : b.id === csvMatch.id ? 1 : a.id.localeCompare(b.id)));
    } else {
      group.sort((a, b) => a.id.localeCompare(b.id));
    }
    const [canonical, ...dupes] = group;

    const csvMarker = csvMatch?.id === canonical.id ? " ✓ csv" : csvMatch ? " (csv matched a duplicate — check)" : "";
    console.log(`  URL: ${canonical.more_info_url}`);
    console.log(`    canonical → ${canonical.id}  "${canonical.name}" (${canonical.series})${csvMarker}`);
    for (const d of dupes) {
      const dMarker = csvMatch?.id === d.id ? " ✓ csv" : "";
      console.log(`    duplicate → ${d.id}  "${d.name}" (${d.series})${dMarker}`);
    }

    for (const dupe of dupes) {
      // Find owned_cups records pointing at this duplicate.
      const owned = await pb.collection("owned_cups").getFullList<OwnedCupRecord>({
        filter: `cup_id = "${dupe.id}"`,
        fields: "id,cup_id,household_id,own_photo,needs_replacing",
      });

      for (const oc of owned) {
        // Check if the canonical already has an owned_cups record for this household.
        const existing = await pb.collection("owned_cups").getList<OwnedCupRecord>(1, 1, {
          filter: `cup_id = "${canonical.id}" && household_id = "${oc.household_id}"`,
        });

        if (existing.totalItems > 0) {
          const canonicalOc = existing.items[0];
          const needsMerge = !canonicalOc.own_photo && oc.own_photo;
          if (needsMerge) {
            console.log(`      migrate own_photo from owned_cup ${oc.id} → canonical owned_cup ${canonicalOc.id}`);
            if (!isDryRun) {
              await pb.collection("owned_cups").update(canonicalOc.id, { own_photo: oc.own_photo });
            }
          } else {
            console.log(`      canonical already owned by household ${oc.household_id} — skipping owned_cup ${oc.id}`);
          }
          console.log(`      delete duplicate owned_cup ${oc.id}`);
          if (!isDryRun) {
            await pb.collection("owned_cups").delete(oc.id);
          }
        } else {
          console.log(`      re-point owned_cup ${oc.id} (household ${oc.household_id}) → canonical ${canonical.id}`);
          if (!isDryRun) {
            await pb.collection("owned_cups").update(oc.id, { cup_id: canonical.id });
          }
          totalMigrated++;
        }
      }

      console.log(`      delete duplicate cup ${dupe.id}`);
      if (!isDryRun) {
        await pb.collection("cups").delete(dupe.id);
      }
      totalDeleted++;
    }

    console.log();
  }

  if (isDryRun) {
    console.log(`Dry run complete. Would delete ${totalDeleted} duplicate cup(s) and migrate ${totalMigrated} owned_cups record(s).`);
    console.log("Re-run with --apply to commit changes.");
  } else {
    console.log(`Done. Deleted ${totalDeleted} duplicate cup(s), migrated ${totalMigrated} owned_cups record(s).`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
