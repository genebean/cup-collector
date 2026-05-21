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
//
// After generation:
//   import-cups --file cups.csv --dry-run
//   import-cups --file cups.csv

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

import { buildRows, type OutputRow } from "../app/src/lib/catalog";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const seriesArg = args.indexOf("--series") !== -1 ? args[args.indexOf("--series") + 1] : null;

if (outIndex === -1 || !args[outIndex + 1]) {
  console.error("Usage: npx ts-node scripts/scrape-catalog.ts --out cups.csv [--series <name>]");
  process.exit(1);
}

const outPath = path.resolve(args[outIndex + 1]);

// ── HTTP fetch helper ─────────────────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
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
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
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
// Fetches each cup's starbucks-mugs.com page and extracts the full-size image
// URL and the release year from the page title.
// Runs with bounded concurrency to avoid hammering the server.

async function fetchPageData(pageUrl: string): Promise<{ image_url: string; year: number | null }> {
  try {
    const html = await fetchText(pageUrl);

    // Extract year from og:title or <title> — e.g. "Been There Ghent 2016 – Starbucks Mugs"
    let year: number | null = null;
    const titleSources = [
      html.match(/<meta[^>]*og:title[^>]*>/)?.[0]?.match(/content="([^"]+)"/)?.[1],
      html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1],
    ];
    for (const src of titleSources) {
      if (!src) continue;
      const m = src.match(/\b(201[3-9]|202[0-9])\b/);
      if (m) { year = parseInt(m[1], 10); break; }
    }

    // Extract image URL from og:image
    let image_url = "";
    const ogLine = html.match(/<meta[^>]*og:image[^>]*>/);
    if (ogLine) {
      const m = ogLine[0].match(/content="([^"]+)"/);
      if (m) image_url = m[1];
    }
    if (!image_url) {
      const srcsetMatch = html.match(/class="[^"]*wp-post-image[^"]*"[^>]*srcset="([^"]+)"/);
      if (srcsetMatch) {
        const urls = srcsetMatch[1].split(",").map((s) => s.trim().split(/\s+/)[0]);
        image_url = urls.find((u) => !/-\d+x\d+\./.test(u)) ?? urls[urls.length - 1];
      }
    }

    return { image_url, year };
  } catch {
    return { image_url: "", year: null };
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

interface CsvRow {
  name: string;
  scope: string;
  venue_series: string;
  item_type: string;
  region: string;
  country: string;
  country_code: string;
  series: string;
  year: number;
  lat: number;
  lng: number;
  image_url: string;
  more_info_url: string;
  notes: string;
}

function writeCSV(rows: CsvRow[], filePath: string): void {
  const header = "name,scope,venue_series,item_type,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes";
  const lines = [header, ...rows.map((r) =>
    [r.name, r.scope, r.venue_series, r.item_type, r.region, r.country, r.country_code, r.series, r.year, r.lat, r.lng, r.image_url, "", r.more_info_url, r.notes]
      .map(csvField).join(",")
  )];
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nCup Collector — Catalog Builder");
  if (seriesArg) console.log(`Series filter: ${seriesArg}`);
  console.log(`Output: ${outPath}\n`);

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

  // Fetch image URLs and scrape years for every entry that has a starbucks-mugs.com page
  const rowsWithUrl = rows.filter((r) => r.more_info_url);
  if (rowsWithUrl.length > 0) {
    console.log(`\nFetching page data for ${rowsWithUrl.length} entries (concurrency=5)…`);
    let done = 0;
    await withConcurrency(rowsWithUrl, 5, async (row) => {
      const { image_url, year } = await fetchPageData(row.more_info_url);
      row.image_url = image_url;
      if (year !== null) row.year = year;
      done++;
      process.stdout.write(`\r  ${done}/${rowsWithUrl.length}`);
    });
    const withImage = rows.filter((r) => r.image_url).length;
    console.log(`\n  image_url resolved: ${withImage} / ${rowsWithUrl.length}`);
  }

  writeCSV(rows, outPath);
  console.log(`\nWrote ${rows.length} rows to ${outPath}`);
  console.log("\nNext steps:");
  console.log("  1. Fill in hobbydb_url column where known");
  console.log("  2. import-cups --file cups.csv --dry-run");
  console.log("  3. import-cups --file cups.csv");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
