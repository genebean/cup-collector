#!/usr/bin/env ts-node
// Cup catalog builder — produces a CSV ready for import-cups.ts.
//
// Fetches the full starbucks-mugs.com sitemap at runtime to resolve
// more_info_url for each cup automatically. Discovery Series entries are
// derived entirely from the sitemap so they reflect what actually exists.
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

// ── URL slug helpers ──────────────────────────────────────────────────────────

const SERIES_PREFIX: Record<string, string> = {
  "You Are Here":        "you-are-here",
  "Been There":          "been-there",
  "Been There Pin Drop": "been-there",
};

function toSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function resolveUrl(index: Map<string, string>, candidates: string[]): string {
  for (const slug of candidates) {
    const url = index.get(slug);
    if (url) return url;
  }
  return "";
}

function lookupMugsUrl(index: Map<string, string>, series: string, city: string): string {
  const prefix = SERIES_PREFIX[series];
  if (!prefix) return "";

  const citySlug = toSlug(city);
  const base = `${prefix}-${citySlug}`;
  const alternates: string[] = [base];
  if (citySlug === "washington-dc") alternates.push(`${prefix}-washington-d-c`);

  return resolveUrl(index, alternates);
}

// ── Coordinate and country tables ─────────────────────────────────────────────

const COORDS: Record<string, [number, number]> = {
  // ── United States — major cities ────────────────────────────────────────────
  "Seattle,United States":        [47.6062, -122.3321],
  "New York,United States":       [40.7128,  -74.0060],
  "New York City,United States":  [40.7128,  -74.0060],
  "San Francisco,United States":  [37.7749, -122.4194],
  "Los Angeles,United States":    [34.0522, -118.2437],
  "Chicago,United States":        [41.8781,  -87.6298],
  "Boston,United States":         [42.3601,  -71.0589],
  "Miami,United States":          [25.7617,  -80.1918],
  "Las Vegas,United States":      [36.1699, -115.1398],
  "Austin,United States":         [30.2672,  -97.7431],
  "Denver,United States":         [39.7392, -104.9903],
  "Nashville,United States":      [36.1627,  -86.7816],
  "Atlanta,United States":        [33.7490,  -84.3880],
  "New Orleans,United States":    [29.9511,  -90.0715],
  "Portland,United States":       [45.5051, -122.6750],
  "Phoenix,United States":        [33.4484, -112.0740],
  "San Diego,United States":      [32.7157, -117.1611],
  "Philadelphia,United States":   [39.9526,  -75.1652],
  "Washington DC,United States":  [38.9072,  -77.0369],
  "Minneapolis,United States":    [44.9778,  -93.2650],
  "Detroit,United States":        [42.3314,  -83.0458],
  "Charlotte,United States":      [35.2271,  -80.8431],
  "Pittsburgh,United States":     [40.4406,  -79.9959],
  "Cincinnati,United States":     [39.1031,  -84.5120],
  "Columbus,United States":       [39.9612,  -82.9988],
  "Cleveland,United States":      [41.4993,  -81.6944],
  "Indianapolis,United States":   [39.7684,  -86.1581],
  "Kansas City,United States":    [39.0997,  -94.5786],
  "St. Louis,United States":      [38.6270,  -90.1994],
  "Salt Lake City,United States": [40.7608, -111.8910],
  "Honolulu,United States":       [21.3069, -157.8583],
  "Anchorage,United States":      [61.2181, -149.9003],
  "Albuquerque,United States":    [35.0844, -106.6504],
  "Memphis,United States":        [35.1495,  -90.0490],
  "Richmond,United States":       [37.5407,  -77.4360],
  "Baltimore,United States":      [39.2904,  -76.6122],
  "Savannah,United States":       [32.0835,  -81.0998],
  "Charleston,United States":     [32.7765,  -79.9311],
  "Tampa,United States":          [27.9506,  -82.4572],
  "Orlando,United States":        [28.5383,  -81.3792],
  "Sacramento,United States":     [38.5816, -121.4944],
  "San Jose,United States":       [37.3382, -121.8863],
  "Oakland,United States":        [37.8044, -122.2712],
  "Raleigh,United States":        [35.7796,  -78.6382],
  "Louisville,United States":     [38.2527,  -85.7585],
  "Hartford,United States":       [41.7658,  -72.6851],
  "Providence,United States":     [41.8240,  -71.4128],
  "Tucson,United States":         [32.2226, -110.9747],
  "Boise,United States":          [43.6150, -116.2023],
  "Spokane,United States":        [47.6587, -117.4260],
  "Omaha,United States":          [41.2565,  -95.9345],
  "Des Moines,United States":     [41.5868,  -93.6250],
  "Madison,United States":        [43.0731,  -89.4012],
  "Milwaukee,United States":      [43.0389,  -87.9065],
  "Baton Rouge,United States":    [30.4515,  -91.1871],
  "Little Rock,United States":    [34.7465,  -92.2896],
  "Oklahoma City,United States":  [35.4676,  -97.5164],
  "Wichita,United States":        [37.6872,  -97.3301],
  "Dallas,United States":         [32.7767,  -96.7970],
  "San Antonio,United States":    [29.4241,  -98.4936],
  "Houston,United States":        [29.7604,  -95.3698],
  "Jacksonville,United States":   [30.3322,  -81.6557],
  "Brooklyn,United States":       [40.6782,  -73.9442],
  "Cambridge,United States":      [42.3736,  -71.1097],
  "New Haven,United States":      [41.3083,  -72.9279],
  "Princeton,United States":      [40.3573,  -74.6672],
  "Durham,United States":         [35.9940,  -78.8986],
  "Chapel Hill,United States":    [35.9132,  -79.0558],
  "Ann Arbor,United States":      [42.2808,  -83.7430],
  "Palo Alto,United States":      [37.4419, -122.1430],
  "Berkeley,United States":       [37.8716, -122.2727],
  "Eugene,United States":         [44.0521, -123.0868],
  "Corvallis,United States":      [44.5646, -123.2620],
  "Gainesville,United States":    [29.6516,  -82.3248],
  "Tallahassee,United States":    [30.4518,  -84.2807],
  "Tuscaloosa,United States":     [33.2098,  -87.5692],
  "Knoxville,United States":      [35.9606,  -83.9207],
  "Athens,United States":         [33.9519,  -83.3576],
  "Asheville,United States":      [35.5951,  -82.5515],
  "Burlington,United States":     [44.4759,  -73.2121],
  "Sedona,United States":         [34.8697, -111.7610],
  "Santa Fe,United States":       [35.6870, -105.9378],
  "Key West,United States":       [24.5551,  -81.7800],
  "Napa,United States":           [38.2975, -122.2869],
  "Jackson Hole,United States":   [43.4799, -110.7624],
  "Park City,United States":      [40.6461, -111.4980],
  "Gatlinburg,United States":     [35.7143,  -83.5121],
  "Traverse City,United States":  [44.7631,  -85.6206],
  // ── United States — states ──────────────────────────────────────────────────
  "Alabama,United States":        [32.3617,  -86.2792],
  "Alaska,United States":         [64.2008, -153.4937],
  "Arizona,United States":        [34.0489, -111.0937],
  "Arkansas,United States":       [34.7999,  -92.1986],
  "California,United States":     [36.7783, -119.4179],
  "Colorado,United States":       [39.5501, -105.7821],
  "Connecticut,United States":    [41.6032,  -73.0877],
  "Delaware,United States":       [38.9108,  -75.5277],
  "Florida,United States":        [27.6648,  -81.5158],
  "Georgia,United States":        [32.1574,  -82.9071],
  "Hawaii,United States":         [19.8968, -155.5828],
  "Idaho,United States":          [44.0682, -114.7420],
  "Illinois,United States":       [40.6331,  -89.3985],
  "Indiana,United States":        [40.2672,  -86.1349],
  "Iowa,United States":           [41.8780,  -93.0977],
  "Kansas,United States":         [38.5266,  -96.7265],
  "Kentucky,United States":       [37.6681,  -84.6701],
  "Louisiana,United States":      [31.1695,  -91.8678],
  "Maine,United States":          [44.6939,  -69.3819],
  "Maryland,United States":       [39.0458,  -76.6413],
  "Massachusetts,United States":  [42.4072,  -71.3824],
  "Michigan,United States":       [44.3148,  -85.6024],
  "Minnesota,United States":      [46.7296,  -94.6859],
  "Mississippi,United States":    [32.3547,  -89.3985],
  "Missouri,United States":       [37.9643,  -91.8318],
  "Montana,United States":        [46.8797, -110.3626],
  "Nebraska,United States":       [41.4925,  -99.9018],
  "Nevada,United States":         [38.8026, -116.4194],
  "New Hampshire,United States":  [43.1939,  -71.5724],
  "New Jersey,United States":     [40.0583,  -74.4057],
  "New Mexico,United States":     [34.5199, -105.8701],
  "North Carolina,United States": [35.7596,  -79.0193],
  "North Dakota,United States":   [47.5515, -101.0020],
  "Ohio,United States":           [40.4173,  -82.9071],
  "Oklahoma,United States":       [35.0078,  -97.0929],
  "Oregon,United States":         [44.5720, -122.0709],
  "Pennsylvania,United States":   [41.2033,  -77.1945],
  "Rhode Island,United States":   [41.6809,  -71.5118],
  "South Carolina,United States": [33.8361,  -81.1637],
  "South Dakota,United States":   [44.2998,  -99.4388],
  "Tennessee,United States":      [35.5175,  -86.5804],
  "Texas,United States":          [31.9686,  -99.9018],
  "Utah,United States":           [39.3210, -111.0937],
  "Vermont,United States":        [44.5588,  -72.5778],
  "Virginia,United States":       [37.4316,  -78.6569],
  "Washington,United States":     [47.7511, -120.7401],
  "West Virginia,United States":  [38.5976,  -80.4549],
  "Wisconsin,United States":      [43.7844,  -88.7879],
  "Wyoming,United States":        [43.0760, -107.2903],
  // ── United States — regions and landmarks ───────────────────────────────────
  "Aspen,United States":              [39.1911, -106.8175],
  "Atlantic City,United States":      [39.3643,  -74.4229],
  "Auburn University,United States":  [32.6099,  -85.4808],
  "Big Island,United States":         [19.5429, -155.6659],
  "Boston University,United States":  [42.3505,  -71.1054],
  "Cape Cod,United States":           [41.6688,  -70.2962],
  "Lake Tahoe,United States":         [39.0968, -120.0324],
  "Myrtle Beach,United States":       [33.6891,  -78.8867],
  "Niagara Falls,United States":      [43.0962,  -79.0377],
  "Orange County,United States":      [33.7175, -117.8311],
  "Pike Place,United States":         [47.6097, -122.3425],
  "Twin Cities,United States":        [44.9537,  -93.0900],
  "University Of Hawaii,United States":[21.2969, -157.8171],
  "Vail,United States":               [39.6433, -106.3781],
  "Waikiki,United States":            [21.2769, -157.8286],
  "Warner Bros Studios,United States":       [34.1470, -118.3381],
  "Universal Studios Hollywood,United States":[34.1381, -118.3534],
  "Universal Epic Universe,United States":   [28.4813,  -81.4685],
  "Universal Orlando Resort,United States":  [28.4772,  -81.4680],
  "Yosemite,United States":                  [37.8651, -119.5383],
  "Oahu,United States":                      [21.4389, -158.0001],
  "Maui,United States":                      [20.7984, -156.3319],
  "Palm Springs,United States":              [33.8303, -116.5453],
  "Monterey,United States":                  [36.6002, -121.8947],
  "Hollywood,United States":                 [34.0928, -118.3287],
  "Manhattan,United States":                 [40.7831,  -73.9712],
  "The Bronx,United States":                 [40.8448,  -73.8648],
  "Queens,United States":                    [40.7282,  -73.7949],
  "Staten Island,United States":             [40.5795,  -74.1502],
  "The Hamptons,United States":              [40.9176,  -72.3170],
  "The Florida Keys,United States":          [24.5551,  -81.3800],
  "Howard University,United States":         [38.9221,  -77.0200],
  "Texas Tech University,United States":     [33.5779, -101.8552],
  "Miami University,United States":          [39.5074,  -84.7452],
  "Texas Am University,United States":       [30.6280,  -96.3344],
  "University Of Memphis,United States":     [35.1174,  -89.9390],
  "Temple University,United States":         [39.9817,  -75.1549],
  "Iowa State University,United States":     [42.0267,  -93.6465],
  // ── Disney Parks (US) ───────────────────────────────────────────────────────
  "Disney California Adventure,United States": [33.8049, -117.9212],
  "Disneyland,United States":                  [33.8121, -117.9190],
  "Magic Kingdom,United States":               [28.4177,  -81.5812],
  "EPCOT,United States":                       [28.3747,  -81.5494],
  "Animal Kingdom,United States":              [28.3553,  -81.5899],
  "Hollywood Studios,United States":           [28.3575,  -81.5584],
  // ── Canada ──────────────────────────────────────────────────────────────────
  "Vancouver,Canada":       [49.2827, -123.1207],
  "Toronto,Canada":         [43.6532,  -79.3832],
  "Montreal,Canada":        [45.5017,  -73.5673],
  "Calgary,Canada":         [51.0447, -114.0719],
  "Ottawa,Canada":          [45.4215,  -75.6972],
  "Edmonton,Canada":        [53.5461, -113.4938],
  "Quebec City,Canada":     [46.8139,  -71.2082],
  "Quebec,Canada":          [52.9399,  -73.5491],
  "Winnipeg,Canada":        [49.8951,  -97.1384],
  "Halifax,Canada":         [44.6488,  -63.5752],
  "Banff,Canada":           [51.1784, -115.5708],
  "Niagara Falls,Canada":   [43.0896,  -79.0849],
  "Atlantic Canada,Canada":  [46.0000,  -63.0000],
  "British Columbia,Canada": [53.7267, -127.6476],
  "Ontario,Canada":          [51.2538,  -85.3232],
  "Manitoba,Canada":         [53.7609,  -98.8139],
  "Saskatchewan,Canada":     [52.9399, -106.4509],
  "Vancouver Island,Canada": [49.6508, -125.4493],
  "Whistler,Canada":         [50.1163, -122.9574],
  "Canada,Canada":           [56.1304, -106.3468],
  // ── United Kingdom ──────────────────────────────────────────────────────────
  "London,United Kingdom":     [51.5074,  -0.1278],
  "Edinburgh,United Kingdom":  [55.9533,  -3.1883],
  "Manchester,United Kingdom": [53.4808,  -2.2426],
  "Birmingham,United Kingdom": [52.4862,  -1.8904],
  // ── Europe ──────────────────────────────────────────────────────────────────
  "Paris,France":              [48.8566,   2.3522],
  "Berlin,Germany":            [52.5200,  13.4050],
  "Rome,Italy":                [41.9028,  12.4964],
  "Barcelona,Spain":           [41.3851,   2.1734],
  "Madrid,Spain":              [40.4168,  -3.7038],
  "Amsterdam,Netherlands":     [52.3676,   4.9041],
  "Brussels,Belgium":          [50.8503,   4.3517],
  "Vienna,Austria":            [48.2082,  16.3738],
  "Prague,Czech Republic":     [50.0755,  14.4378],
  "Budapest,Hungary":          [47.4979,  19.0402],
  "Warsaw,Poland":             [52.2297,  21.0122],
  "Stockholm,Sweden":          [59.3293,  18.0686],
  "Oslo,Norway":               [59.9139,  10.7522],
  "Copenhagen,Denmark":        [55.6761,  12.5683],
  "Helsinki,Finland":          [60.1699,  24.9384],
  "Lisbon,Portugal":           [38.7223,  -9.1393],
  "Athens,Greece":             [37.9838,  23.7275],
  "Zurich,Switzerland":        [47.3769,   8.5417],
  "Dublin,Ireland":            [53.3498,  -6.2603],
  // ── Asia ────────────────────────────────────────────────────────────────────
  "Tokyo,Japan":                         [35.6762,  139.6503],
  "Kyoto,Japan":                         [35.0116,  135.7681],
  "Osaka,Japan":                         [34.6937,  135.5023],
  "Beijing,China":                       [39.9042,  116.4074],
  "Shanghai,China":                      [31.2304,  121.4737],
  "Hong Kong,China":                     [22.3193,  114.1694],
  "Seoul,South Korea":                   [37.5665,  126.9780],
  "Singapore,Singapore":                 [ 1.3521,  103.8198],
  "Bangkok,Thailand":                    [13.7563,  100.5018],
  "Taipei,Taiwan":                       [25.0330,  121.5654],
  "Kuala Lumpur,Malaysia":               [ 3.1390,  101.6869],
  "Jakarta,Indonesia":                   [-6.2088,  106.8456],
  "Manila,Philippines":                  [14.5995,  120.9842],
  "Mumbai,India":                        [19.0760,   72.8777],
  "New Delhi,India":                     [28.6139,   77.2090],
  "Dubai,United Arab Emirates":          [25.2048,   55.2708],
  "Tel Aviv,Israel":                     [32.0853,   34.7818],
  // ── Oceania ─────────────────────────────────────────────────────────────────
  "Sydney,Australia":     [-33.8688,  151.2093],
  "Melbourne,Australia":  [-37.8136,  144.9631],
  "Brisbane,Australia":   [-27.4698,  153.0251],
  "Auckland,New Zealand": [-36.8485,  174.7633],
  // ── Latin America ───────────────────────────────────────────────────────────
  "Mexico City,Mexico":      [19.4326,  -99.1332],
  "São Paulo,Brazil":        [-23.5505, -46.6333],
  "Rio de Janeiro,Brazil":   [-22.9068, -43.1729],
  "Buenos Aires,Argentina":  [-34.6037, -58.3816],
  "Bogotá,Colombia":         [  4.7110, -74.0721],
  "Lima,Peru":               [-12.0464, -77.0428],
  "Santiago,Chile":          [-33.4489, -70.6693],
  "Antigua Guatemala,Guatemala": [14.5586,  -90.7295],
  "Mexico,Mexico":               [23.6345, -102.5528],
  "Mazatlan,Mexico":             [23.2494, -106.4111],
  "San Miguel,Mexico":           [20.9144, -100.7452],
  "El Salvador,El Salvador":     [13.7942,  -88.8965],
  "Guyana,Guyana":               [ 4.8604,  -58.9302],
  "Hong Kong Disneyland,China":  [22.3130,  114.0413],
  "Korea,South Korea":           [37.5665,  126.9780],
  "Singapore,Singapore":         [ 1.3521,  103.8198],
  // ── Africa ──────────────────────────────────────────────────────────────────
  "Cairo,Egypt":            [30.0444,  31.2357],
  "Cape Town,South Africa": [-33.9249, 18.4241],
  "Nairobi,Kenya":          [-1.2921,  36.8219],
  "Marrakech,Morocco":      [31.6295,  -7.9811],
};

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US", "Canada": "CA", "United Kingdom": "GB",
  "France": "FR", "Germany": "DE", "Italy": "IT", "Spain": "ES",
  "Netherlands": "NL", "Belgium": "BE", "Austria": "AT",
  "Czech Republic": "CZ", "Hungary": "HU", "Poland": "PL",
  "Sweden": "SE", "Norway": "NO", "Denmark": "DK", "Finland": "FI",
  "Portugal": "PT", "Greece": "GR", "Switzerland": "CH", "Ireland": "IE",
  "Japan": "JP", "China": "CN", "South Korea": "KR", "Singapore": "SG",
  "Thailand": "TH", "Taiwan": "TW", "Malaysia": "MY", "Indonesia": "ID",
  "Philippines": "PH", "India": "IN", "United Arab Emirates": "AE",
  "Israel": "IL", "Australia": "AU", "New Zealand": "NZ",
  "Mexico": "MX", "Brazil": "BR", "Argentina": "AR", "Colombia": "CO",
  "Peru": "PE", "Chile": "CL", "Egypt": "EG", "Guatemala": "GT",
  "El Salvador": "SV", "Guyana": "GY",
  "South Africa": "ZA", "Kenya": "KE", "Morocco": "MA", "Tanzania": "TZ",
};

// ── Catalog ───────────────────────────────────────────────────────────────────

interface CupEntry {
  city: string;
  region: string;
  country: string;
  series: string;
  year: number;
  notes: string;
  moreInfoUrl?: string;   // explicit override — skip slug lookup when set
  scope?: string;         // defaults to "city"; set to "themed" for fictional/special-edition cups
  venue_series?: string;  // themed cups only: series of the venue cups they're sold alongside
}

// Discovery Series is NOT listed here — entries are derived from the
// starbucks-mugs.com sitemap at runtime so they reflect what actually exists.
const CATALOG: CupEntry[] = [
  // ── You Are Here ──────────────────────────────────────────────────────────
  // United States
  { city: "Seattle",        region: "Washington",          country: "United States", series: "You Are Here", year: 2013, notes: "Inaugural release" },
  { city: "New York",       region: "New York",            country: "United States", series: "You Are Here", year: 2013, notes: "" },
  { city: "San Francisco",  region: "California",          country: "United States", series: "You Are Here", year: 2013, notes: "" },
  { city: "Chicago",        region: "Illinois",            country: "United States", series: "You Are Here", year: 2013, notes: "" },
  { city: "Los Angeles",    region: "California",          country: "United States", series: "You Are Here", year: 2013, notes: "" },
  { city: "Boston",         region: "Massachusetts",       country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "Washington DC",  region: "District of Columbia",country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "Miami",          region: "Florida",             country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "Las Vegas",      region: "Nevada",              country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "New Orleans",    region: "Louisiana",           country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "Portland",       region: "Oregon",              country: "United States", series: "You Are Here", year: 2014, notes: "" },
  { city: "Austin",         region: "Texas",               country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Denver",         region: "Colorado",            country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Nashville",      region: "Tennessee",           country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Atlanta",        region: "Georgia",             country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Phoenix",        region: "Arizona",             country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "San Diego",      region: "California",          country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Philadelphia",   region: "Pennsylvania",        country: "United States", series: "You Are Here", year: 2015, notes: "" },
  { city: "Minneapolis",    region: "Minnesota",           country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Detroit",        region: "Michigan",            country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Pittsburgh",     region: "Pennsylvania",        country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Baltimore",      region: "Maryland",            country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Salt Lake City", region: "Utah",                country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Honolulu",       region: "Hawaii",              country: "United States", series: "You Are Here", year: 2016, notes: "" },
  { city: "Anchorage",      region: "Alaska",              country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "Kansas City",    region: "Missouri",            country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "St. Louis",      region: "Missouri",            country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "Columbus",       region: "Ohio",                country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "Charlotte",      region: "North Carolina",      country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "Indianapolis",   region: "Indiana",             country: "United States", series: "You Are Here", year: 2017, notes: "" },
  { city: "Sacramento",     region: "California",          country: "United States", series: "You Are Here", year: 2018, notes: "" },
  { city: "Tampa",          region: "Florida",             country: "United States", series: "You Are Here", year: 2018, notes: "" },
  { city: "Savannah",       region: "Georgia",             country: "United States", series: "You Are Here", year: 2018, notes: "" },
  { city: "Memphis",        region: "Tennessee",           country: "United States", series: "You Are Here", year: 2018, notes: "" },
  { city: "Louisville",     region: "Kentucky",            country: "United States", series: "You Are Here", year: 2018, notes: "" },
  { city: "Oklahoma City",  region: "Oklahoma",            country: "United States", series: "You Are Here", year: 2019, notes: "" },
  { city: "Raleigh",        region: "North Carolina",      country: "United States", series: "You Are Here", year: 2019, notes: "" },
  { city: "Richmond",       region: "Virginia",            country: "United States", series: "You Are Here", year: 2019, notes: "" },
  { city: "Boise",          region: "Idaho",               country: "United States", series: "You Are Here", year: 2019, notes: "" },
  { city: "Albuquerque",    region: "New Mexico",          country: "United States", series: "You Are Here", year: 2019, notes: "" },
  { city: "Spokane",        region: "Washington",          country: "United States", series: "You Are Here", year: 2020, notes: "" },
  { city: "Cleveland",      region: "Ohio",                country: "United States", series: "You Are Here", year: 2020, notes: "" },
  { city: "Cincinnati",     region: "Ohio",                country: "United States", series: "You Are Here", year: 2020, notes: "" },
  { city: "Milwaukee",      region: "Wisconsin",           country: "United States", series: "You Are Here", year: 2020, notes: "" },
  { city: "Madison",        region: "Wisconsin",           country: "United States", series: "You Are Here", year: 2020, notes: "" },
  { city: "Charleston",     region: "South Carolina",      country: "United States", series: "You Are Here", year: 2021, notes: "" },
  { city: "Tucson",         region: "Arizona",             country: "United States", series: "You Are Here", year: 2021, notes: "" },
  { city: "Hartford",       region: "Connecticut",         country: "United States", series: "You Are Here", year: 2021, notes: "" },
  { city: "Providence",     region: "Rhode Island",        country: "United States", series: "You Are Here", year: 2021, notes: "" },
  { city: "Des Moines",     region: "Iowa",                country: "United States", series: "You Are Here", year: 2022, notes: "" },
  { city: "Omaha",          region: "Nebraska",            country: "United States", series: "You Are Here", year: 2022, notes: "" },
  { city: "Wichita",        region: "Kansas",              country: "United States", series: "You Are Here", year: 2022, notes: "" },
  { city: "Baton Rouge",    region: "Louisiana",           country: "United States", series: "You Are Here", year: 2022, notes: "" },
  { city: "Little Rock",    region: "Arkansas",            country: "United States", series: "You Are Here", year: 2022, notes: "" },
  // Canada
  { city: "Vancouver",   region: "British Columbia", country: "Canada", series: "You Are Here", year: 2013, notes: "" },
  { city: "Toronto",     region: "Ontario",          country: "Canada", series: "You Are Here", year: 2013, notes: "" },
  { city: "Montreal",    region: "Quebec",           country: "Canada", series: "You Are Here", year: 2014, notes: "" },
  { city: "Calgary",     region: "Alberta",          country: "Canada", series: "You Are Here", year: 2015, notes: "" },
  { city: "Ottawa",      region: "Ontario",          country: "Canada", series: "You Are Here", year: 2015, notes: "" },
  { city: "Edmonton",    region: "Alberta",          country: "Canada", series: "You Are Here", year: 2016, notes: "" },
  { city: "Quebec City", region: "Quebec",           country: "Canada", series: "You Are Here", year: 2016, notes: "" },
  { city: "Halifax",     region: "Nova Scotia",      country: "Canada", series: "You Are Here", year: 2017, notes: "" },
  // United Kingdom
  { city: "London",     region: "England",  country: "United Kingdom", series: "You Are Here", year: 2013, notes: "" },
  { city: "Edinburgh",  region: "Scotland", country: "United Kingdom", series: "You Are Here", year: 2014, notes: "" },
  { city: "Manchester", region: "England",  country: "United Kingdom", series: "You Are Here", year: 2015, notes: "" },
  // Europe
  { city: "Paris",      region: "", country: "France",         series: "You Are Here", year: 2013, notes: "" },
  { city: "Berlin",     region: "", country: "Germany",        series: "You Are Here", year: 2013, notes: "" },
  { city: "Rome",       region: "", country: "Italy",          series: "You Are Here", year: 2013, notes: "" },
  { city: "Barcelona",  region: "", country: "Spain",          series: "You Are Here", year: 2014, notes: "" },
  { city: "Amsterdam",  region: "", country: "Netherlands",    series: "You Are Here", year: 2014, notes: "" },
  { city: "Vienna",     region: "", country: "Austria",        series: "You Are Here", year: 2015, notes: "" },
  { city: "Prague",     region: "", country: "Czech Republic", series: "You Are Here", year: 2015, notes: "" },
  { city: "Stockholm",  region: "", country: "Sweden",         series: "You Are Here", year: 2015, notes: "" },
  { city: "Copenhagen", region: "", country: "Denmark",        series: "You Are Here", year: 2016, notes: "" },
  { city: "Brussels",   region: "", country: "Belgium",        series: "You Are Here", year: 2016, notes: "" },
  { city: "Lisbon",     region: "", country: "Portugal",       series: "You Are Here", year: 2016, notes: "" },
  { city: "Budapest",   region: "", country: "Hungary",        series: "You Are Here", year: 2016, notes: "" },
  { city: "Oslo",       region: "", country: "Norway",         series: "You Are Here", year: 2017, notes: "" },
  { city: "Helsinki",   region: "", country: "Finland",        series: "You Are Here", year: 2017, notes: "" },
  { city: "Athens",     region: "", country: "Greece",         series: "You Are Here", year: 2017, notes: "" },
  { city: "Zurich",     region: "", country: "Switzerland",    series: "You Are Here", year: 2017, notes: "" },
  { city: "Warsaw",     region: "", country: "Poland",         series: "You Are Here", year: 2018, notes: "" },
  { city: "Madrid",     region: "", country: "Spain",          series: "You Are Here", year: 2018, notes: "" },
  { city: "Dublin",     region: "", country: "Ireland",        series: "You Are Here", year: 2018, notes: "" },
  // Asia
  { city: "Tokyo",        region: "", country: "Japan",               series: "You Are Here", year: 2013, notes: "" },
  { city: "Kyoto",        region: "", country: "Japan",               series: "You Are Here", year: 2014, notes: "" },
  { city: "Osaka",        region: "", country: "Japan",               series: "You Are Here", year: 2015, notes: "" },
  { city: "Beijing",      region: "", country: "China",               series: "You Are Here", year: 2013, notes: "" },
  { city: "Shanghai",     region: "", country: "China",               series: "You Are Here", year: 2013, notes: "" },
  { city: "Hong Kong",    region: "", country: "China",               series: "You Are Here", year: 2014, notes: "" },
  { city: "Seoul",        region: "", country: "South Korea",         series: "You Are Here", year: 2013, notes: "" },
  { city: "Singapore",    region: "", country: "Singapore",           series: "You Are Here", year: 2013, notes: "" },
  { city: "Bangkok",      region: "", country: "Thailand",            series: "You Are Here", year: 2014, notes: "" },
  { city: "Taipei",       region: "", country: "Taiwan",              series: "You Are Here", year: 2014, notes: "" },
  { city: "Kuala Lumpur", region: "", country: "Malaysia",            series: "You Are Here", year: 2015, notes: "" },
  { city: "Dubai",        region: "", country: "United Arab Emirates",series: "You Are Here", year: 2015, notes: "" },
  { city: "Mumbai",       region: "", country: "India",               series: "You Are Here", year: 2016, notes: "" },
  { city: "Jakarta",      region: "", country: "Indonesia",           series: "You Are Here", year: 2016, notes: "" },
  { city: "Manila",       region: "", country: "Philippines",         series: "You Are Here", year: 2017, notes: "" },
  { city: "Tel Aviv",     region: "", country: "Israel",              series: "You Are Here", year: 2017, notes: "" },
  // Oceania
  { city: "Sydney",    region: "New South Wales", country: "Australia",   series: "You Are Here", year: 2013, notes: "" },
  { city: "Melbourne", region: "Victoria",        country: "Australia",   series: "You Are Here", year: 2014, notes: "" },
  { city: "Brisbane",  region: "Queensland",      country: "Australia",   series: "You Are Here", year: 2015, notes: "" },
  { city: "Auckland",  region: "",                country: "New Zealand", series: "You Are Here", year: 2015, notes: "" },
  // Latin America
  { city: "Mexico City",    region: "", country: "Mexico",    series: "You Are Here", year: 2013, notes: "" },
  { city: "São Paulo",      region: "", country: "Brazil",    series: "You Are Here", year: 2014, notes: "" },
  { city: "Buenos Aires",   region: "", country: "Argentina", series: "You Are Here", year: 2015, notes: "" },
  { city: "Bogotá",         region: "", country: "Colombia",  series: "You Are Here", year: 2016, notes: "" },
  { city: "Santiago",       region: "", country: "Chile",     series: "You Are Here", year: 2016, notes: "" },
  { city: "Lima",           region: "", country: "Peru",      series: "You Are Here", year: 2017, notes: "" },
  { city: "Rio de Janeiro", region: "", country: "Brazil",    series: "You Are Here", year: 2017, notes: "" },
  // Africa
  { city: "Cape Town", region: "", country: "South Africa", series: "You Are Here", year: 2016, notes: "" },
  { city: "Nairobi",   region: "", country: "Kenya",        series: "You Are Here", year: 2017, notes: "" },
  { city: "Marrakech", region: "", country: "Morocco",      series: "You Are Here", year: 2018, notes: "" },
  { city: "Cairo",     region: "", country: "Egypt",        series: "You Are Here", year: 2018, notes: "" },

  // ── Been There Across the Globe ───────────────────────────────────────────
  { city: "Seattle",       region: "Washington",          country: "United States", series: "Been There", year: 2018, notes: "Across the Globe launch" },
  { city: "New York",      region: "New York",            country: "United States", series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Chicago",       region: "Illinois",            country: "United States", series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "San Francisco", region: "California",          country: "United States", series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Los Angeles",   region: "California",          country: "United States", series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "London",        region: "England",             country: "United Kingdom",series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Paris",         region: "",                    country: "France",        series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Tokyo",         region: "",                    country: "Japan",         series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Toronto",       region: "Ontario",             country: "Canada",        series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Vancouver",     region: "British Columbia",    country: "Canada",        series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Sydney",        region: "New South Wales",     country: "Australia",     series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Mexico City",   region: "",                    country: "Mexico",        series: "Been There", year: 2018, notes: "Across the Globe" },
  { city: "Miami",         region: "Florida",             country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Boston",        region: "Massachusetts",       country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Las Vegas",     region: "Nevada",              country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Washington DC", region: "District of Columbia",country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "New Orleans",   region: "Louisiana",           country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Austin",        region: "Texas",               country: "United States", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Berlin",        region: "",                    country: "Germany",       series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Barcelona",     region: "",                    country: "Spain",         series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Amsterdam",     region: "",                    country: "Netherlands",   series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Seoul",         region: "",                    country: "South Korea",   series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Singapore",     region: "",                    country: "Singapore",     series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Bangkok",       region: "",                    country: "Thailand",      series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Dubai",         region: "",                    country: "United Arab Emirates", series: "Been There", year: 2019, notes: "Across the Globe" },
  { city: "Rome",          region: "",                    country: "Italy",         series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Vienna",        region: "",                    country: "Austria",       series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Lisbon",        region: "",                    country: "Portugal",      series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Prague",        region: "",                    country: "Czech Republic",series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Stockholm",     region: "",                    country: "Sweden",        series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Taipei",        region: "",                    country: "Taiwan",        series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Hong Kong",     region: "",                    country: "China",         series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Shanghai",      region: "",                    country: "China",         series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Melbourne",     region: "Victoria",            country: "Australia",     series: "Been There", year: 2020, notes: "Across the Globe" },
  { city: "Denver",        region: "Colorado",            country: "United States", series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Nashville",     region: "Tennessee",           country: "United States", series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Atlanta",       region: "Georgia",             country: "United States", series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Portland",      region: "Oregon",              country: "United States", series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Edinburgh",     region: "Scotland",            country: "United Kingdom",series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Budapest",      region: "",                    country: "Hungary",       series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Osaka",         region: "",                    country: "Japan",         series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Mumbai",        region: "",                    country: "India",         series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "São Paulo",     region: "",                    country: "Brazil",        series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Buenos Aires",  region: "",                    country: "Argentina",     series: "Been There", year: 2021, notes: "Across the Globe" },
  { city: "Cape Town",     region: "",                    country: "South Africa",  series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Honolulu",      region: "Hawaii",              country: "United States", series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "San Diego",     region: "California",          country: "United States", series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Philadelphia",  region: "Pennsylvania",        country: "United States", series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Dublin",        region: "",                    country: "Ireland",       series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Madrid",        region: "",                    country: "Spain",         series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Kuala Lumpur",  region: "",                    country: "Malaysia",      series: "Been There", year: 2022, notes: "Across the Globe" },
  { city: "Cairo",         region: "",                    country: "Egypt",         series: "Been There", year: 2023, notes: "Across the Globe" },
  { city: "Marrakech",     region: "",                    country: "Morocco",       series: "Been There", year: 2023, notes: "Across the Globe" },

  // ── Been There Disney Parks (US only — verified on starbucks-mugs.com) ─────
  { city: "Disney California Adventure", region: "California", country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Disneyland Resort, Anaheim", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-california-adventure/" },
  { city: "Disneyland",                  region: "California", country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Disneyland Resort, Anaheim", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-disneyland/" },
  { city: "Magic Kingdom",               region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-magic-kingdom/" },
  { city: "EPCOT",                       region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-epcot/" },
  { city: "Animal Kingdom",              region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-animal-kingdom/" },
  { city: "Hollywood Studios",           region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-hollywood-studios/" },

  // ── Been There Marvel ─────────────────────────────────────────────────────
  { city: "Wakanda", region: "", country: "", series: "Been There Marvel", year: 2021, scope: "themed", venue_series: "Been There Disney Parks", notes: "Black Panther / Wakanda — sold at Disney parks worldwide", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-marvel-wakanda/" },
];

// ── Discovery Series — derived from starbucks-mugs.com sitemap ───────────────
// Slug prefixes to exclude entirely (checked against locationSlug after stripping "discovery-series-").
const DISCOVERY_EXCLUDE_PREFIXES = ["wicked-"];

// Star Wars bare planet slugs (no "star-wars-" prefix on starbucks-mugs.com).
const STAR_WARS_BARE_SLUGS = new Set([
  "ahch-to", "crait", "endor", "geonosis", "hoth", "naboo", "tatooine",
]);

// Name overrides for Star Wars slugs that don't title-case correctly.
const STAR_WARS_NAME_FIXES: Record<string, string> = {
  "ahch-to":      "Ahch-To",
  "galaxys-edge": "Galaxy's Edge",
};

// Locations that belong to a country other than the United States.
const DISCOVERY_COUNTRY: Record<string, string> = {
  // Canada — cities and provinces
  "Atlantic Canada":   "Canada",
  "Banff":             "Canada",
  "British Columbia":  "Canada",
  "Calgary":           "Canada",
  "Canada":            "Canada",
  "Edmonton":          "Canada",
  "Manitoba":          "Canada",
  "Montreal":          "Canada",
  "Ontario":           "Canada",
  "Ottawa":            "Canada",
  "Quebec":            "Canada",
  "Saskatchewan":      "Canada",
  "Toronto":           "Canada",
  "Vancouver":         "Canada",
  "Vancouver Island":  "Canada",
  "Whistler":          "Canada",
  "Winnipeg":          "Canada",
  // Asia / Pacific
  "Bangkok":              "Thailand",
  "Hong Kong Disneyland": "China",
  "Korea":                "South Korea",
  "Singapore":            "Singapore",
  // Latin America
  "Antigua Guatemala": "Guatemala",
  "El Salvador":       "El Salvador",
  "Guyana":            "Guyana",
  "Mazatlan":          "Mexico",
  "Mexico":            "Mexico",
  "San Miguel":        "Mexico",
};

function buildDiscoverySeriesFromSitemap(mugsIndex: Map<string, string>): CupEntry[] {
  const entries: CupEntry[] = [];

  for (const [slug, url] of mugsIndex) {
    if (!slug.startsWith("discovery-series-")) continue;

    const locationSlug = slug.replace("discovery-series-", "");

    // Skip ornaments, Disney sub-series, and Wicked
    if (locationSlug.includes("ornament")) continue;
    if (locationSlug.startsWith("disney-")) continue;
    if (DISCOVERY_EXCLUDE_PREFIXES.some(p => locationSlug.startsWith(p))) continue;

    // Detect Star Wars slugs (prefixed or bare planet names)
    const isStarWars = locationSlug.startsWith("star-wars-") || STAR_WARS_BARE_SLUGS.has(locationSlug);

    if (isStarWars) {
      const rawSlug = locationSlug.startsWith("star-wars-")
        ? locationSlug.replace("star-wars-", "")
        : locationSlug;
      const displayName = STAR_WARS_NAME_FIXES[rawSlug] ?? rawSlug
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      entries.push({
        city: displayName,
        region: "",
        country: "",   // fictional — no real coords; country="" skips the no-coords warning
        series: "Discovery Series",
        year: 2025,
        scope: "themed",
        venue_series: "Been There Disney Parks",
        notes: "Star Wars — available at Disney parks (Galaxy's Edge)",
        moreInfoUrl: url,
      });
      continue;
    }

    // Derive human-readable name: hyphens → spaces, title-case each word
    let cityName = locationSlug
      .split("-")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    // Normalise slug artefacts that don't title-case cleanly
    cityName = cityName.replace(/\bD C\b/, "DC");  // washington-d-c → Washington DC
    if (cityName === "St Louis") cityName = "St. Louis";

    const country = DISCOVERY_COUNTRY[cityName] ?? "United States";

    entries.push({
      city: cityName,
      region: "",
      country,
      series: "Discovery Series",
      year: 2020,  // approximate — Discovery Series launched 2019-2020
      notes: "",
      moreInfoUrl: url,
    });
  }

  return entries;
}

// ── Image URL scraper ─────────────────────────────────────────────────────────
// Fetches each cup's starbucks-mugs.com page and extracts the full-size image.
// Runs with bounded concurrency to avoid hammering the server.

async function fetchImageUrl(pageUrl: string): Promise<string> {
  try {
    const html = await fetchText(pageUrl);

    // og:image is reliable and usually points at the full-size upload
    const ogLine = html.match(/<meta[^>]*og:image[^>]*>/);
    if (ogLine) {
      const m = ogLine[0].match(/content="([^"]+)"/);
      if (m) return m[1];
    }

    // Fall back to wp-post-image srcset — prefer the URL without -WxH dimension suffix
    const srcsetMatch = html.match(/class="[^"]*wp-post-image[^"]*"[^>]*srcset="([^"]+)"/);
    if (srcsetMatch) {
      const urls = srcsetMatch[1].split(",").map(s => s.trim().split(/\s+/)[0]);
      return urls.find(u => !/-\d+x\d+\./.test(u)) ?? urls[urls.length - 1];
    }
  } catch {
    // silently skip — image_url stays blank
  }
  return "";
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

// ── Build output rows ─────────────────────────────────────────────────────────

interface OutputRow {
  name: string;
  scope: string;
  venue_series: string;
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

function buildRows(filterSeries: string | null, mugsIndex: Map<string, string>): OutputRow[] {
  // Static catalog entries (never includes Discovery Series)
  const catalogEntries = CATALOG
    .filter(e => !filterSeries || e.series === filterSeries);

  // Discovery Series entries derived live from the sitemap
  const discoveryEntries = (!filterSeries || filterSeries === "Discovery Series")
    ? buildDiscoverySeriesFromSitemap(mugsIndex)
    : [];

  const allEntries = [...catalogEntries, ...discoveryEntries];

  const rows: OutputRow[] = [];
  const noCoords: string[] = [];

  for (const e of allEntries) {
    const coordKey = `${e.city},${e.country}`;
    const [lat, lng] = COORDS[coordKey] ?? [0, 0];

    // Skip real-world locations with no coordinates rather than emitting 0,0
    if (lat === 0 && lng === 0 && e.country !== "") {
      noCoords.push(`${e.city} (${e.series})`);
      continue;
    }

    const more_info_url = e.moreInfoUrl !== undefined
      ? e.moreInfoUrl
      : lookupMugsUrl(mugsIndex, e.series, e.city);

    rows.push({
      name: e.city,
      scope: e.scope ?? "city",
      venue_series: e.venue_series ?? "",
      region: e.region,
      country: e.country,
      country_code: COUNTRY_CODES[e.country] ?? "",
      series: e.series,
      year: e.year,
      lat, lng,
      image_url: "",
      more_info_url,
      notes: e.notes,
    });
  }

  if (noCoords.length > 0) {
    console.warn(`\nSkipped ${noCoords.length} entries with no coordinates (add to COORDS table to include):`);
    noCoords.forEach(n => console.warn(`  ${n}`));
  }

  return rows;
}

// ── CSV writer ────────────────────────────────────────────────────────────────

function csvField(val: string | number): string {
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCSV(rows: OutputRow[], filePath: string): void {
  const header = "name,scope,venue_series,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes";
  const lines = [header, ...rows.map((r) =>
    [r.name, r.scope, r.venue_series, r.region, r.country, r.country_code, r.series, r.year, r.lat, r.lng, r.image_url, "", r.more_info_url, r.notes]
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

  // Fetch image URLs for every entry that has a starbucks-mugs.com page
  const rowsWithUrl = rows.filter(r => r.more_info_url);
  if (rowsWithUrl.length > 0) {
    console.log(`\nFetching image URLs for ${rowsWithUrl.length} entries (concurrency=5)…`);
    let done = 0;
    await withConcurrency(rowsWithUrl, 5, async (row) => {
      row.image_url = await fetchImageUrl(row.more_info_url);
      done++;
      process.stdout.write(`\r  ${done}/${rowsWithUrl.length}`);
    });
    const withImage = rows.filter(r => r.image_url).length;
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
