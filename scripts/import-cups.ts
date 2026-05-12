#!/usr/bin/env ts-node
// Cup catalog CSV import script.
// MUST be run inside the Nix dev shell: enter with `nix develop` first.
//
// Usage:
//   npx ts-node scripts/import-cups.ts --file cups.csv
//   npx ts-node scripts/import-cups.ts --file cups.csv --dry-run
//
// Expected CSV columns:
//   city, region, country, country_code, series, year, lat, lng, image_url, notes
//
// Upsert logic: match on (city + series + year) — update if exists, create if not.
// Safe to re-run at any time — will not duplicate records.

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import PocketBase from "pocketbase";

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const isDryRun = args.includes("--dry-run");

if (fileIndex === -1 || !args[fileIndex + 1]) {
  console.error("Usage: npx ts-node scripts/import-cups.ts --file cups.csv [--dry-run]");
  process.exit(1);
}

const csvPath = path.resolve(args[fileIndex + 1]);
if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const ADMIN_TOKEN = process.env.POCKETBASE_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error(
    "POCKETBASE_ADMIN_TOKEN is not set.\n" +
    "Set it in your environment or in a .env file.\n" +
    "See .env.example for all required variables."
  );
  process.exit(1);
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

interface CsvRow {
  city: string;
  region: string;
  country: string;
  country_code: string;
  series: string;
  year: number;
  lat: number;
  lng: number;
  image_url: string;
  notes: string;
}

function parseCSV(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV split — does not handle quoted commas; for the expected format this is fine
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    if (!row.city || !row.series || !row.year) {
      console.warn(`  Skipping row ${i + 1}: missing required field (city, series, or year)`);
      continue;
    }

    rows.push({
      city: row.city,
      region: row.region ?? "",
      country: row.country ?? "",
      country_code: row.country_code ?? "",
      series: row.series,
      year: parseInt(row.year, 10),
      lat: parseFloat(row.lat) || 0,
      lng: parseFloat(row.lng) || 0,
      image_url: row.image_url ?? "",
      notes: row.notes ?? "",
    });
  }
  return rows;
}

// ── Image download ────────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<Buffer | null> {
  if (!url || !url.startsWith("http")) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      console.warn(`    Could not download image (${response.status}): ${url}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.warn(`    Image download failed: ${url}`, err);
    return null;
  }
}

// ── Main import logic ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\nCup Collector — CSV Import${isDryRun ? " (DRY RUN — no changes will be written)" : ""}`);
  console.log(`File: ${csvPath}`);
  console.log(`PocketBase: ${POCKETBASE_URL}\n`);

  const pb = new PocketBase(POCKETBASE_URL);
  // Authenticate as admin for catalog write access
  pb.authStore.save(ADMIN_TOKEN!, null);

  const rows = parseCSV(csvPath);
  console.log(`Parsed ${rows.length} rows from CSV.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const label = `${row.city} / ${row.series} / ${row.year}`;
    try {
      // Check if a matching record already exists (upsert key: city + series + year)
      let existingId: string | null = null;
      try {
        const existing = await pb.collection("cups").getFirstListItem(
          `city="${row.city}" && series="${row.series}" && year=${row.year}`
        );
        existingId = existing.id;
      } catch {
        // No match — will create
      }

      // Download image if a URL is provided
      let imageFile: File | null = null;
      if (row.image_url) {
        const buffer = await downloadImage(row.image_url);
        if (buffer) {
          const ext = row.image_url.split(".").pop()?.split("?")[0] ?? "jpg";
          imageFile = new File([buffer], `${row.city}-${row.series}-${row.year}.${ext}`, {
            type: ext === "png" ? "image/png" : "image/jpeg",
          });
        }
      }

      const data: Record<string, unknown> = {
        city: row.city,
        region: row.region,
        country: row.country,
        country_code: row.country_code,
        series: row.series,
        year: row.year,
        lat: row.lat,
        lng: row.lng,
        // Store source URL for attribution tracking
        image_credit: row.image_url || undefined,
        notes: row.notes,
      };

      if (imageFile) {
        data.image = imageFile;
      }

      if (existingId) {
        if (isDryRun) {
          console.log(`  [UPDATE] ${label}`);
        } else {
          await pb.collection("cups").update(existingId, data);
          console.log(`  Updated: ${label}`);
        }
        updated++;
      } else {
        if (isDryRun) {
          console.log(`  [CREATE] ${label}`);
        } else {
          await pb.collection("cups").create(data);
          console.log(`  Created: ${label}`);
        }
        created++;
      }
    } catch (err) {
      console.error(`  ERROR processing ${label}:`, err);
      errors++;
    }
  }

  console.log("\n── Summary ──");
  if (isDryRun) {
    console.log(`  Would create: ${created}`);
    console.log(`  Would update: ${updated}`);
    console.log(`  Skipped:      ${skipped}`);
    console.log("\nDry run complete. Run without --dry-run to apply changes.");
  } else {
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors:  ${errors}`);
    if (errors > 0) {
      console.log("\nImport completed with errors. Check output above for details.");
      process.exit(1);
    } else {
      console.log("\nImport complete.");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
