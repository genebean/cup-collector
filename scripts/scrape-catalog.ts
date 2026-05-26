#!/usr/bin/env ts-node
// Cup catalog builder — produces a CSV ready for import-cups.ts.
//
// Fetches the full starbucks-mugs.com sitemap at runtime to resolve
// more_info_url for each cup automatically. Discovery Series, You Are Here,
// and Been There entries are all derived from the sitemap so they reflect
// what actually exists.
// hobbydb_url is left blank — fill manually after export.
//
// Usage (inside nix develop):
//   npx ts-node scripts/scrape-catalog.ts --out cups.csv
//   npx ts-node scripts/scrape-catalog.ts --out cups.csv --series "You Are Here"
//   npx ts-node scripts/scrape-catalog.ts --out cups.csv --cache-dir .scrape-cache
//
// --cache-dir writes every fetched page/sitemap to disk and reuses it on subsequent
// runs. Use during dev to avoid hammering starbucks-mugs.com. Delete the directory
// (or individual files) to force a fresh fetch.
//
// After generation:
//   import-cups --file cups.csv --dry-run
//   import-cups --file cups.csv

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

import { parse } from "node-html-parser";

import { buildRows, toSlug, type OutputRow } from "../app/src/lib/catalog";
import { COUNTRY_CODES, CITY_TO_REGION, COORDS } from "../app/src/lib/catalog-data";

function baseName(name: string): string {
  return name.replace(/\s+\d+$/, "").trim();
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const seriesArg = args.indexOf("--series") !== -1 ? args[args.indexOf("--series") + 1] : null;
const cacheDirIndex = args.indexOf("--cache-dir");
const cacheDir: string | null = cacheDirIndex !== -1 ? path.resolve(args[cacheDirIndex + 1]) : null;

if (outIndex === -1 || !args[outIndex + 1]) {
  console.error("Usage: npx ts-node scripts/scrape-catalog.ts --out cups.csv [--series <name>] [--cache-dir <dir>]");
  process.exit(1);
}

const outPath = path.resolve(args[outIndex + 1]);

// ── HTTP fetch helper ─────────────────────────────────────────────────────────

function cacheKeyFor(url: string): string {
  // Produce a readable filename from the URL path, e.g.:
  //   https://starbucks-mugs.com/sitemap.xml           → sitemap.xml
  //   https://starbucks-mugs.com/mug/been-there-seattle/ → mug__been-there-seattle.html
  const key = url
    .replace(/^https?:\/\/[^/]+\//, "")  // strip protocol + host
    .replace(/\/+$/, "")                  // strip trailing slash
    .replace(/\//g, "__")                 // slashes → double underscore
    || "root";
  return key.endsWith(".xml") ? key : key + ".html";
}

function fetchText(url: string): Promise<string> {
  if (cacheDir) {
    const cachePath = path.join(cacheDir, cacheKeyFor(url));
    if (fs.existsSync(cachePath)) return Promise.resolve(fs.readFileSync(cachePath, "utf-8"));
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; cup-collector-catalog/1.0; +https://github.com/genebean/cup-collector)",
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        if (cacheDir) {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(path.join(cacheDir, cacheKeyFor(url)), text, "utf-8");
        }
        resolve(text);
      });
    });
    req.on("error", reject);
    req.setTimeout(20_000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ── starbucks-mugs.com URL index ──────────────────────────────────────────────
// Fetches all sub-sitemaps and builds a lookup: slug → full URL.
// Slug = the last path segment (e.g. "you-are-here-seattle").

async function buildMugsIndex(): Promise<Map<string, string>> {
  console.log("Fetching starbucks-mugs.com sitemap…");
  const index = new Map<string, string>();

  const rootXml = await fetchText("https://starbucks-mugs.com/sitemap.xml");
  const subSitemaps = [...rootXml.matchAll(/https:\/\/starbucks-mugs\.com\/sitemap-pt-mug[^<"']*/g)]
    .map((m) => m[0]);

  let fetched = 0;
  for (const sitemapUrl of subSitemaps) {
    try {
      const xml = await fetchText(sitemapUrl);
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      for (const url of locs) {
        const slug = url.replace(/\/$/, "").split("/").pop();
        if (slug) index.set(slug, url);
      }
      fetched++;
    } catch (err) {
      console.warn(`  Skipping sitemap ${sitemapUrl}: ${err}`);
    }
  }
  console.log(`Loaded ${index.size} URLs from ${fetched} sitemaps.\n`);
  return index;
}

// ── Page data scraper ─────────────────────────────────────────────────────────
// Fetches each cup's starbucks-mugs.com page and extracts:
//   image_url   — full-size cup photo
//   year        — release year from the page title
//   tags        — all /tag/ slugs linked from the page (for sub-collection detection)
//   description — first substantial paragraph of post content (for variant_notes)
// Runs with bounded concurrency to avoid hammering the server.

interface PageData {
  image_url: string;
  year: number | null;
  tags: string[];
  description: string;
}

async function fetchPageData(pageUrl: string): Promise<PageData> {
  try {
    const doc = parse(await fetchText(pageUrl));

    // Year from og:title or <title> — e.g. "Been There Ghent 2016 – Starbucks Mugs"
    let year: number | null = null;
    for (const src of [
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      doc.querySelector('title')?.textContent,
    ]) {
      if (!src) continue;
      const m = src.match(/\b(201[3-9]|202[0-9])\b/);
      if (m) { year = parseInt(m[1], 10); break; }
    }

    // Image URL from og:image, falling back to wp-post-image srcset
    let image_url = "";
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage) {
      image_url = ogImage;
    } else {
      const srcset = doc.querySelector('.wp-post-image')?.getAttribute('srcset');
      if (srcset) {
        const urls = srcset.split(",").map((s: string) => s.trim().split(/\s+/)[0]);
        image_url = urls.find((u: string) => !/-\d+x\d+\./.test(u)) ?? urls[urls.length - 1] ?? "";
      }
    }

    // Tags — only <a rel="tag"> links (the cup-specific tags, not the sidebar tag cloud).
    // Extract the slug from each href, e.g. /tag/british-columbia/ → "british-columbia".
    const tagSet = new Set<string>();
    for (const a of doc.querySelectorAll('a[rel="tag"]')) {
      const slug = (a.getAttribute('href') ?? '').replace(/\/$/, '').split('/').pop();
      if (slug) tagSet.add(slug);
    }
    const tags = [...tagSet];

    // First substantial paragraph from the post content (for variant_notes).
    // node-html-parser decodes HTML entities and strips tags via textContent.
    let description = "";
    for (const p of doc.querySelector('.entry-content')?.querySelectorAll('p') ?? []) {
      const text = p.textContent.replace(/\s+/g, ' ').trim();
      if (text.length >= 60) { description = text; break; }
    }

    return { image_url, year, tags, description };
  } catch {
    return { image_url: "", year: null, tags: [], description: "" };
  }
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

const SERIES_SLUGS = new Set([
  "you-are-here", "been-there", "discovery-series", "ornament", "icon-mini",
  "been-there-disney-parks", "you-are-here-disney-parks",
]);

// Geographic scope indicators — not sub-collections and not regions.
const SCOPE_TAGS = new Set([
  "city", "country", "province", "state", "region", "area", "territory", "island",
]);

const VERSION_TAG_RE = /^v\d+$/;

function slugToTitle(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Sub-collection tag picker ─────────────────────────────────────────────────
// Filters the raw tag list from a cup page down to the most relevant
// sub-collection label, excluding series slugs, scope slugs, location slugs,
// and version tags.

function pickSubCollection(tags: string[], row: OutputRow): string {
  const locationSlugs = new Set<string>();
  for (const text of [row.name, row.region, row.country]) {
    if (!text) continue;
    const slug = toSlug(text);
    locationSlugs.add(slug);
    // Also add individual words so "new-york" excludes "new" and "york" separately
    for (const part of slug.split("-")) locationSlugs.add(part);
  }

  for (const tag of tags) {
    if (SERIES_SLUGS.has(tag)) continue;
    if (SCOPE_TAGS.has(tag)) continue;
    if (VERSION_TAG_RE.test(tag)) continue;
    if (locationSlugs.has(tag)) continue;
    return slugToTitle(tag);
  }
  return "";
}

// ── Tag-based geography fix ───────────────────────────────────────────────────
// Corrects or fills country/country_code from country tags, and fills an empty
// region from tags that are already known region values (safe against false
// positives like "Campus Collection").

const KNOWN_REGIONS = new Set(Object.values(CITY_TO_REGION));

function applyTagGeography(tags: string[], row: OutputRow): void {
  // Find the first tag whose title-cased form is a key in COUNTRY_CODES.
  // COUNTRY_CODES already maps "Canada" → "CA", "Philippines" → "PH", etc.
  let tagCountry: string | null = null;
  let tagCountryCode: string | null = null;
  for (const tag of tags) {
    const title = slugToTitle(tag);
    const code = COUNTRY_CODES[title];
    if (code) { tagCountry = title; tagCountryCode = code; break; }
  }

  if (tagCountry && tagCountry !== row.country) {
    if (row.country) console.log(`  tag-fix: ${row.name}: country "${row.country}" → "${tagCountry}"`);
    row.country = tagCountry;
    row.country_code = tagCountryCode!;
    // Clear region — it was resolved for the old country; geo backfill will re-set correctly.
    row.region = "";
    // Update coordinates if COORDS has an entry for the corrected country.
    const newCoords = COORDS[`${row.name},${tagCountry}`];
    if (newCoords) { row.lat = newCoords[0]; row.lng = newCoords[1]; }
  }

  // Fill empty region from the first tag that is a known geographic region value.
  // Skips country-scope cups (they have no sub-region), series tags, scope words,
  // country tags, and the cup's own name slug.
  if (!row.region && row.scope !== "country") {
    const nameSlug = toSlug(row.name);
    for (const tag of tags) {
      if (SERIES_SLUGS.has(tag)) continue;
      if (SCOPE_TAGS.has(tag)) continue;
      if (COUNTRY_CODES[slugToTitle(tag)]) continue;
      if (tag === nameSlug) continue;
      const title = slugToTitle(tag);
      if (KNOWN_REGIONS.has(title)) { row.region = title; break; }
    }
  }
}

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      await fn(items[i++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ── CSV writer ────────────────────────────────────────────────────────────────

function csvField(val: string | number): string {
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// OutputRow from catalog.ts already has all needed fields (including the new variant ones).
// This alias keeps writeCSV's signature readable.
type CsvRow = OutputRow;

// Overridable string fields — lat/lng/year are excluded because 0 is ambiguous with "no override".
const OVERRIDE_STRING_FIELDS = [
  "scope", "venue_series", "item_type", "region", "country", "country_code",
  "image_url", "more_info_url", "notes", "sub_collection", "variant_of", "variant_notes",
] as const;

function applyOverrides(rows: CsvRow[], overridesPath: string): void {
  if (!fs.existsSync(overridesPath)) return;
  const lines = fs.readFileSync(overridesPath, "utf-8").split("\n").filter(Boolean);
  if (lines.length < 2) return; // header only
  const headers = lines[0].split(",");
  const col = (row: string[], name: string) => {
    const i = headers.indexOf(name);
    return i === -1 ? "" : (row[i] ?? "").replace(/^"|"$/g, "").trim();
  };
  let count = 0;
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const name = col(parts, "name");
    const series = col(parts, "series");
    if (!name || !series) continue;
    const target = rows.find(r => r.name === name && r.series === series);
    if (!target) {
      console.warn(`  [override] no match for "${name}" (${series})`);
      continue;
    }
    let changed = false;
    for (const field of OVERRIDE_STRING_FIELDS) {
      const val = col(parts, field);
      if (val) { target[field] = val; changed = true; }
    }
    if (changed) count++;
  }
  console.log(`\nApplied ${count} override(s) from ${path.basename(overridesPath)}.`);
}

function writeCSV(rows: CsvRow[], filePath: string): void {
  const header = "name,scope,venue_series,item_type,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes,sub_collection,variant_of,variant_notes";
  const lines = [header, ...rows.map((r) =>
    [r.name, r.scope, r.venue_series, r.item_type, r.region, r.country, r.country_code, r.series, r.year, r.lat, r.lng, r.image_url, "", r.more_info_url, r.notes, r.sub_collection, r.variant_of, r.variant_notes]
      .map(csvField).join(",")
  )];
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nCup Collector — Catalog Builder");
  if (seriesArg) console.log(`Series filter: ${seriesArg}`);
  console.log(`Output: ${outPath}`);
  if (cacheDir) console.log(`Cache:  ${cacheDir}`);
  console.log("");

  const mugsIndex = await buildMugsIndex();
  const rows = buildRows(seriesArg, mugsIndex);

  const bySeries: Record<string, number> = {};
  for (const r of rows) bySeries[r.series] = (bySeries[r.series] ?? 0) + 1;

  console.log(`\nEntries by series:`);
  for (const [series, count] of Object.entries(bySeries).sort()) {
    console.log(`  ${series}: ${count}`);
  }
  console.log(`  Total: ${rows.length}`);

  const withUrl    = rows.filter(r => r.more_info_url).length;
  const withoutUrl = rows.length - withUrl;
  console.log(`\nmore_info_url resolved: ${withUrl} / ${rows.length} (${withoutUrl} blank)`);

  // Fetch image URLs, years, tags, and descriptions for every entry with a starbucks-mugs.com page
  const rowsWithUrl = rows.filter((r) => r.more_info_url);
  if (rowsWithUrl.length > 0) {
    console.log(`\nFetching page data for ${rowsWithUrl.length} entries (concurrency=5)…`);
    let done = 0;
    await withConcurrency(rowsWithUrl, 5, async (row) => {
      const { image_url, year, tags, description } = await fetchPageData(row.more_info_url);
      row.image_url = image_url;
      if (year !== null) row.year = year;
      applyTagGeography(tags, row);
      row.sub_collection = pickSubCollection(tags, row);
      // Only store variant_notes on cups whose name ends in a number (e.g. "Atlanta 2")
      if (/\s+\d+$/.test(row.name) && description) row.variant_notes = description;
      done++;
      process.stdout.write(`\r  ${done}/${rowsWithUrl.length}`);
    });
    const withImage = rows.filter((r) => r.image_url).length;
    const noImage = rows.filter((r) => r.more_info_url && !r.image_url);
    const withSubCollection = rows.filter((r) => r.sub_collection).length;
    const withVariantNotes = rows.filter((r) => r.variant_notes).length;
    console.log(`\n  image_url resolved:   ${withImage} / ${rowsWithUrl.length}`);
    if (noImage.length > 0) {
      noImage.forEach((r) => console.log(`    [no image] ${r.name} (${r.series})`));
    }
    console.log(`  sub_collection found: ${withSubCollection} / ${rowsWithUrl.length}`);
    console.log(`  variant_notes found:  ${withVariantNotes} cups`);
  }

  // Post-process: set variant_of for numbered cups whose base exists in the same series.
  // Key includes item_type so mug and ornament versions of the same name don't collide.
  const bySeriesAndName = new Map(rows.map((r) => [`${r.series}|${r.name}|${r.item_type}`, r]));
  let variantCount = 0;
  for (const row of rows) {
    if (!/\s+\d+$/.test(row.name)) continue; // not a numbered cup
    const m = row.name.match(/^(.+?)\s+(\d+)$/);
    if (!m) continue;
    const [, basePart, numStr] = m;
    const num = parseInt(numStr, 10);

    // Candidate 1: plain base name, same item_type (e.g. "Atlanta 2" → "Atlanta")
    const plainBase = bySeriesAndName.get(`${row.series}|${basePart}|${row.item_type}`);
    // Candidate 2: previous number, same item_type (e.g. "Canada 2" → "Canada 1" when no plain "Canada" exists)
    const prevBase = num > 1 ? bySeriesAndName.get(`${row.series}|${basePart} ${num - 1}|${row.item_type}`) : undefined;

    const base = plainBase ?? prevBase;
    if (base) {
      row.variant_of = base.name;
      variantCount++;
      // Inherit region from base when the variant has none
      if (!row.region && base.region) row.region = base.region;
    }
  }
  if (variantCount > 0) console.log(`\nLinked ${variantCount} variant cup(s) to their base via variant_of.`);

  const overridesPath = path.join(path.dirname(path.resolve(outPath)), "cups-overrides.csv");
  applyOverrides(rows, overridesPath);

  writeCSV(rows, outPath);
  console.log(`\nWrote ${rows.length} rows to ${outPath}`);
  console.log("\nNext steps:");
  console.log("  1. Fill in hobbydb_url column where known");
  console.log("  2. import-cups --dry-run");
  console.log("  3. import-cups");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
