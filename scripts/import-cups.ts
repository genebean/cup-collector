#!/usr/bin/env ts-node
// Cup catalog CSV import script.
// MUST be run inside the Nix dev shell: enter with `nix develop` first.
//
// Usage:
//   npx ts-node scripts/import-cups.ts --file cups.csv
//   npx ts-node scripts/import-cups.ts --file cups.csv --dry-run
//
// Expected CSV columns:
//   name (or city), scope, region, country, country_code, series, year, lat, lng, image_url, hobbydb_url, more_info_url, notes
//   Old CSVs with "city" column and no "scope" column are still accepted — scope defaults to "city".
//
// Upsert logic: match on (name + series + year + item_type) — update if exists, create if not.
// Safe to re-run at any time — will not duplicate records.

import * as fs from "fs";
import * as path from "path";
import PocketBase from "pocketbase";
import { parseCSV, rowMatchesExisting, diffRow, baseName, type CsvRow } from "../app/src/lib/cup-import";
import { toCupSlug } from "../app/src/lib/slug";

// ── Geo backfill — Natural Earth admin-1 boundaries ──────────────────────────

const DATA_DIR     = path.resolve(path.dirname(process.argv[1]), "data");
const GEOJSON_PATH = path.join(DATA_DIR, "ne_10m_admin1.geojson");
const GEOJSON_URL  =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/" +
  "ne_10m_admin_1_states_provinces.geojson";

type Ring        = number[][];
type PolyCoords  = Ring[];
type MultiCoords = PolyCoords[];
interface GeoProps { name: string | null; name_en: string | null; iso_a2: string | null; [k: string]: unknown; }
interface PolygonGeom      { type: "Polygon";      coordinates: PolyCoords;  }
interface MultiPolygonGeom { type: "MultiPolygon"; coordinates: MultiCoords; }
type GeoGeom = PolygonGeom | MultiPolygonGeom;
interface GeoFeature    { type: "Feature"; properties: GeoProps; geometry: GeoGeom; }
interface GeoCollection { type: "FeatureCollection"; features: GeoFeature[]; }

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInPoly(lng: number, lat: number, coords: PolyCoords): boolean {
  if (!pointInRing(lng, lat, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) if (pointInRing(lng, lat, coords[i])) return false;
  return true;
}

function pointInGeom(lng: number, lat: number, geom: GeoGeom): boolean {
  if (geom.type === "Polygon")      return pointInPoly(lng, lat, geom.coordinates);
  if (geom.type === "MultiPolygon") return geom.coordinates.some(p => pointInPoly(lng, lat, p));
  return false;
}

async function loadGeoIndex(): Promise<Map<string, GeoFeature[]>> {
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.log("  Downloading Natural Earth admin-1 boundaries (~40 MB, one-time)…");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const res = await fetch(GEOJSON_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    fs.writeFileSync(GEOJSON_PATH, await res.text(), "utf-8");
    console.log(`  Cached → ${GEOJSON_PATH}`);
  }
  const col = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf-8")) as GeoCollection;
  const index = new Map<string, GeoFeature[]>();
  for (const f of col.features) {
    const code = String(f.properties.iso_a2 ?? "").toUpperCase();
    if (!code || code === "-1" || code === "-99") continue;
    const bucket = index.get(code) ?? []; bucket.push(f); index.set(code, bucket);
  }
  return index;
}

// Bounding-box overrides for jurisdictions too small for Natural Earth 50m resolution.
// Checked before the polygon lookup so they take priority.
const GEO_OVERRIDES: Array<{ cc: string; minLat: number; maxLat: number; minLng: number; maxLng: number; region: string }> = [
  // Washington D.C. — federal district, absent from admin-1 data; points fall into VA/MD without this
  { cc: "US", minLat: 38.791, maxLat: 38.996, minLng: -77.120, maxLng: -76.909, region: "Washington, D.C." },
];

function geoLookup(lng: number, lat: number, cc: string, index: Map<string, GeoFeature[]>): string | null {
  const upper = cc.toUpperCase();
  for (const o of GEO_OVERRIDES) {
    if (o.cc === upper && lat >= o.minLat && lat <= o.maxLat && lng >= o.minLng && lng <= o.maxLng)
      return o.region;
  }
  for (const f of index.get(upper) ?? []) {
    if (pointInGeom(lng, lat, f.geometry))
      return String(f.properties.name_en || f.properties.name || "").trim() || null;
  }
  return null;
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const isDryRun = args.includes("--dry-run");
const isDebug = args.includes("--debug");

if (fileIndex === -1 || !args[fileIndex + 1]) {
  console.error("Usage: npx ts-node scripts/import-cups.ts --file cups.csv [--dry-run] [--debug]");
  process.exit(1);
}

const csvPath = path.resolve(args[fileIndex + 1]);
if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are not set.\n" +
    "Set them in your environment or in app/.env.local."
  );
  process.exit(1);
}

// ── CSV parsing ───────────────────────────────────────────────────────────────
// parseCSV and CsvRow are imported from app/src/lib/cup-import.

// ── Image download ────────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  if (!url || !url.startsWith("http")) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      console.warn(`    Could not download image (${response.status}): ${url}`);
      return null;
    }
    return response.arrayBuffer();
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

  const rows = parseCSV(fs.readFileSync(csvPath, "utf-8"));
  console.log(`Parsed ${rows.length} rows from CSV.\n`);

  // Sort so unnumbered base cups are processed before their numbered variants.
  // This ensures same-run bases are in PocketBase (or the local map) when variants resolve.
  rows.sort((a, b) => {
    const numA = +(a.name.match(/\s+(\d+)$/) ?? [0, 0])[1];
    const numB = +(b.name.match(/\s+(\d+)$/) ?? [0, 0])[1];
    return numA - numB;
  });

  // Pre-load all existing cups into a local map for single-pass variant_of resolution.
  // Cups created during this run are added here so variants can reference same-run bases.
  const cupIdByKey = new Map<string, string>();
  {
    const existing = await pb.collection("cups").getFullList<{ id: string; name: string; series: string; item_type: string }>({
      fields: "id,name,series,item_type",
    });
    for (const c of existing) {
      cupIdByKey.set(`${c.name}|${c.series}|${c.item_type || "mug"}`, c.id);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const label = `${row.name} / ${row.series} / ${row.year}${row.item_type === "ornament" ? " [ornament]" : ""}`;
    try {
      // Check if a matching record already exists (upsert key: name + series + year + item_type)
      // item_type is part of the key: mug and ornament for the same name/series/year are
      // separate catalog entries. Using != "ornament" for mugs handles pre-migration
      // records where item_type was stored as empty string.
      let existingId: string | null = null;
      let existingRecord: Record<string, unknown> | null = null;
      try {
        const itemTypeClause = row.item_type === "ornament"
          ? `item_type = "ornament"`
          : `item_type != "ornament"`;
        existingRecord = await pb.collection("cups").getFirstListItem(
          `name="${row.name}" && series="${row.series}" && year=${row.year} && ${itemTypeClause}`
        );
        existingId = existingRecord!.id as string;
      } catch {
        // No match — will create
      }

      // Download image only when the URL is new or has changed.
      // image_credit stores the URL that was used for the last download, so it
      // acts as a cache key — skip the fetch when it matches.
      let imageFile: File | null = null;
      const existingImageCredit = existingRecord ? String(existingRecord.image_credit ?? "") : null;
      if (row.image_url && (!existingId || row.image_url !== existingImageCredit)) {
        const buffer = await downloadImage(row.image_url);
        if (buffer) {
          const ext = row.image_url.split(".").pop()?.split("?")[0] ?? "jpg";
          imageFile = new File([buffer], `${row.name}-${row.series}-${row.year}.${ext}`, {
            type: ext === "png" ? "image/png" : "image/jpeg",
          });
        }
      }

      // Resolve variant_of name → PocketBase ID using the pre-loaded local map.
      // Cups created earlier in this run are also in the map, so same-run bases
      // can be referenced by variants processed later in the same import.
      let variantOfId: string | undefined;
      if (row.variant_of) {
        const baseKey = `${row.variant_of}|${row.series}|${row.item_type || "mug"}`;
        const resolvedId = cupIdByKey.get(baseKey);
        if (resolvedId && !resolvedId.startsWith("__pending__")) {
          variantOfId = resolvedId;
        } else if (!resolvedId) {
          console.warn(`  [WARN] ${label}: could not resolve variant_of="${row.variant_of}" — skipping variant link`);
        }
        // else: base is pending creation in this dry-run — link will resolve correctly on real import
      }

      const data: Record<string, unknown> = {
        name: row.name,
        scope: row.scope || "city",
        venue_series: row.venue_series || undefined,
        item_type: row.item_type || "mug",
        region: row.region || (existingRecord?.region as string) || "",
        country: row.country,
        country_code: row.country_code,
        series: row.series,
        year: row.year,
        lat: row.lat,
        lng: row.lng,
        image_credit: row.image_url || undefined,
        hobbydb_url: row.hobbydb_url || existingRecord?.hobbydb_url || undefined,
        more_info_url: row.more_info_url || undefined,
        notes: row.notes,
        sub_collection: row.sub_collection,
        variant_notes: row.variant_notes,
        slug: toCupSlug(row),
        // Write variant_of when CSV provides it; explicitly clear when is_unique overrides it
        ...(variantOfId !== undefined ? { variant_of: variantOfId } : row.is_unique ? { variant_of: "" } : {}),
        // Only set is_unique when CSV explicitly says true — never reset an admin-set value
        ...(row.is_unique ? { is_unique: true } : {}),
      };

      if (imageFile) {
        data.image = imageFile;
      }

      // variant_of is excluded from rowMatchesExisting (it's an ID, not a name).
      // Check it separately so records are updated when a new variant link is resolved,
      // or when is_unique clears an existing link.
      const variantOfChanged =
        (variantOfId !== undefined && variantOfId !== String(existingRecord?.variant_of ?? "")) ||
        (row.is_unique && String(existingRecord?.variant_of ?? "") !== "");

      if (existingId) {
        if (existingRecord && rowMatchesExisting(row, existingRecord) && !imageFile && !variantOfChanged) {
          if (isDryRun && isDebug) console.log(`  [NO CHANGE] ${label}`);
          skipped++;
        } else if (isDryRun) {
          console.log(`  [UPDATE] ${label}`);
          if (existingRecord) diffRow(row, existingRecord).forEach(d => console.log(`    ~ ${d}`));
          if (variantOfChanged) console.log(`    ~ variant_of: csv="${row.variant_of}" (resolved to id=${variantOfId})`);
          updated++;
        } else {
          if (existingRecord) {
            const diffs = diffRow(row, existingRecord);
            if (diffs.length > 0) diffs.forEach(d => console.log(`    ~ ${d}`));
            if (variantOfChanged) console.log(`    ~ variant_of → ${row.variant_of}`);
            else if (!variantOfChanged && diffs.length === 0) console.log(`    ~ image changed`);
          }
          await pb.collection("cups").update(existingId, data);
          console.log(`  Updated: ${label}`);
          updated++;
        }
      } else {
        const cupKey = `${row.name}|${row.series}|${row.item_type || "mug"}`;
        if (isDryRun) {
          console.log(`  [CREATE] ${label}`);
          cupIdByKey.set(cupKey, `__pending__${cupKey}`);
        } else {
          const newRecord = await pb.collection("cups").create(data);
          console.log(`  Created: ${label}`);
          cupIdByKey.set(cupKey, newRecord.id as string);
        }
        created++;
      }
    } catch (err) {
      console.error(`  ERROR processing ${label}:`, err);
      errors++;
    }
  }

  console.log("\n── Import Summary ──");
  if (isDryRun) {
    console.log(`  Would create:    ${created}`);
    console.log(`  Would update:    ${updated}`);
    console.log(`  No change:       ${skipped}`);
  } else {
    console.log(`  Created:   ${created}`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  No change: ${skipped}`);
    console.log(`  Errors:    ${errors}`);
    if (errors > 0) {
      console.log("\nImport completed with errors. Check output above for details.");
      process.exit(1);
    }
  }

  // ── Geo region backfill ─────────────────────────────────────────────────────
  // Fills missing `region` on any cup with lat/lng using Natural Earth admin-1
  // boundaries (point-in-polygon). Runs before sibling backfill so filled regions
  // can propagate to coordinate-less cups in the same city group.
  console.log("\n── Geo Region Backfill ──");
  try {
    const geoIndex = await loadGeoIndex();
    interface GeoCup { id: string; name: string; series: string; year: number; lat: number; lng: number; country_code: string; }
    const geoCups = await pb.collection("cups").getFullList<GeoCup>({
      fields: "id,name,series,year,lat,lng,country_code",
      filter: "region = \"\" && scope != \"country\" && lat != 0 && lng != 0",
    });
    type GeoMiss = { name: string; country_code: string; lat: number; lng: number };
    const printGeoMisses = (misses: GeoMiss[]) => {
      if (misses.length === 0) return;
      const byCC = new Map<string, string[]>();
      for (const m of misses) {
        const arr = byCC.get(m.country_code) ?? []; arr.push(m.name); byCC.set(m.country_code, arr);
      }
      console.log(`  No match (${misses.length}) — add to CITY_TO_REGION in catalog-data.ts:`);
      for (const [cc, names] of [...byCC.entries()].sort(([a], [b]) => a.localeCompare(b)))
        console.log(`    [${cc}] ${names.join(", ")}`);
    };

    if (geoCups.length === 0) {
      console.log("  Nothing to backfill.");
    } else if (isDryRun) {
      let geoWould = 0;
      const misses: GeoMiss[] = [];
      for (const cup of geoCups) {
        const region = geoLookup(cup.lng, cup.lat, cup.country_code, geoIndex);
        if (region) { if (isDebug) console.log(`  ${cup.name} (${cup.series}) → region="${region}"`); geoWould++; }
        else misses.push({ name: cup.name, country_code: cup.country_code, lat: cup.lat, lng: cup.lng });
      }
      console.log(`  Would update: ${geoWould} of ${geoCups.length} cup(s).`);
      printGeoMisses(misses);
    } else {
      let geoUpdated = 0;
      const misses: GeoMiss[] = [];
      for (const cup of geoCups) {
        const region = geoLookup(cup.lng, cup.lat, cup.country_code, geoIndex);
        if (!region) { misses.push({ name: cup.name, country_code: cup.country_code, lat: cup.lat, lng: cup.lng }); continue; }
        try {
          await pb.collection("cups").update(cup.id, { region });
          if (isDebug) console.log(`  Updated: ${cup.name} (${cup.series}) → "${region}"`);
          geoUpdated++;
        } catch (err) {
          console.error(`  ERROR: ${cup.name} [${cup.id}]:`, err);
          errors++;
        }
      }
      console.log(`  Updated: ${geoUpdated}  No match: ${misses.length}`);
      printGeoMisses(misses);
    }
  } catch (err) {
    console.warn("  Geo backfill skipped (network unavailable or boundary file missing):", (err as Error).message);
  }

  // ── Region backfill ─────────────────────────────────────────────────────────
  // Fills missing `region` on cups where a same-city sibling already has one.
  // Runs after geo backfill so that geo-filled regions propagate to cups without
  // coordinates (e.g. "Atlanta 2" gets "Georgia" from "Atlanta" which got it via geo).
  console.log("\n── Region Backfill ──");
  interface CupRecord { id: string; name: string; series: string; country_code: string; scope: string; region: string; item_type: string; }
  const allCups = await pb.collection("cups").getFullList<CupRecord>({
    fields: "id,name,series,country_code,scope,region,item_type",
  });

  const buckets = new Map<string, CupRecord[]>();
  for (const cup of allCups) {
    const key = `${cup.series}|${cup.country_code}|${cup.scope || "city"}|${cup.item_type || "mug"}|${baseName(cup.name)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(cup);
    buckets.set(key, bucket);
  }

  const toBackfill: Array<{ cup: CupRecord; region: string }> = [];
  for (const members of buckets.values()) {
    const regions = [...new Set(members.map(c => c.region).filter(Boolean))];
    if (regions.length === 0) continue;
    if (regions.length > 1) {
      console.warn(`  SKIP — ambiguous regions [${regions.map(r => `"${r}"`).join(", ")}] for "${members[0].name}" (${members[0].series})`);
      continue;
    }
    for (const cup of members) {
      if (!cup.region) toBackfill.push({ cup, region: regions[0] });
    }
  }

  if (toBackfill.length === 0) {
    console.log("  Nothing to backfill.");
  } else if (isDryRun) {
    console.log(`  Would backfill ${toBackfill.length} cup(s):`);
    for (const { cup, region } of toBackfill) {
      console.log(`    ${cup.name} (${cup.series}) → region="${region}"`);
    }
  } else {
    let backfilled = 0;
    for (const { cup, region } of toBackfill) {
      try {
        await pb.collection("cups").update(cup.id, { region });
        console.log(`  Backfilled: ${cup.name} (${cup.series}) → region="${region}"`);
        backfilled++;
      } catch (err) {
        console.error(`  ERROR backfilling ${cup.name} [${cup.id}]:`, err);
        errors++;
      }
    }
    console.log(`  Backfilled: ${backfilled}`);
  }

  // ── Missing catalog images ───────────────────────────────────────────────────
  // Cups with no image_credit have no catalog photo from starbucks-mugs.com.
  // Check whether a personal photo (own_photo on owned_cups) covers them so the
  // output tells you whether action is actually needed.
  interface NoCatalogImage { id: string; name: string; series: string; }
  const noCatalogImage = await pb.collection("cups").getFullList<NoCatalogImage>({
    filter: 'image_credit = ""',
    fields: "id,name,series",
  });
  if (noCatalogImage.length > 0) {
    console.log("\n── Missing Catalog Images ──");
    for (const cup of noCatalogImage) {
      const hasPersonalPhoto = await pb.collection("owned_cups").getList(1, 1, {
        filter: `cup_id = "${cup.id}" && own_photo != ""`,
        fields: "id",
      }).then(r => r.totalItems > 0);
      const note = hasPersonalPhoto ? " — personal photo uploaded, no action needed" : " — no fallback, consider finding an image";
      console.log(`  ${cup.name} (${cup.series})${note}`);
    }
  }

  if (isDryRun) {
    console.log("\nDry run complete. Run without --dry-run to apply changes.");
  } else {
    console.log("\nImport complete.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
