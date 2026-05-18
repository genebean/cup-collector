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
  "University Of Georgia,United States": [33.9480,  -83.3776],
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
  "Ghent,Belgium":             [51.0543,   3.7174],
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
  // ── Africa ──────────────────────────────────────────────────────────────────
  "Cairo,Egypt":            [30.0444,  31.2357],
  "Cape Town,South Africa": [-33.9249, 18.4241],
  "Nairobi,Kenya":          [-1.2921,  36.8219],
  "Marrakech,Morocco":      [31.6295,  -7.9811],
};

const COUNTRY_CODES: Record<string, string> = {
  // North America
  "United States": "US", "Canada": "CA", "Mexico": "MX",
  "Guatemala": "GT", "El Salvador": "SV", "Honduras": "HN",
  "Nicaragua": "NI", "Costa Rica": "CR", "Panama": "PA",
  "Cuba": "CU", "Jamaica": "JM", "Dominican Republic": "DO",
  "Puerto Rico": "PR", "Trinidad And Tobago": "TT", "Bahamas": "BS",
  "Guyana": "GY", "Suriname": "SR",
  // South America
  "Brazil": "BR", "Argentina": "AR", "Colombia": "CO",
  "Peru": "PE", "Chile": "CL", "Ecuador": "EC", "Bolivia": "BO",
  "Uruguay": "UY", "Paraguay": "PY", "Venezuela": "VE",
  // Europe
  "United Kingdom": "GB", "Ireland": "IE", "France": "FR",
  "Germany": "DE", "Italy": "IT", "Spain": "ES", "Portugal": "PT",
  "Netherlands": "NL", "Belgium": "BE", "Luxembourg": "LU",
  "Switzerland": "CH", "Austria": "AT", "Denmark": "DK",
  "Sweden": "SE", "Norway": "NO", "Finland": "FI", "Iceland": "IS",
  "Czech Republic": "CZ", "Slovakia": "SK", "Hungary": "HU",
  "Poland": "PL", "Romania": "RO", "Bulgaria": "BG",
  "Greece": "GR", "Croatia": "HR", "Slovenia": "SI",
  "Serbia": "RS", "Estonia": "EE", "Latvia": "LV", "Lithuania": "LT",
  "Ukraine": "UA", "Russia": "RU", "Turkey": "TR",
  // Middle East
  "United Arab Emirates": "AE", "Saudi Arabia": "SA", "Israel": "IL",
  "Jordan": "JO", "Lebanon": "LB", "Kuwait": "KW", "Qatar": "QA",
  "Bahrain": "BH", "Oman": "OM",
  // Asia
  "Japan": "JP", "China": "CN", "South Korea": "KR", "Taiwan": "TW",
  "Singapore": "SG", "Thailand": "TH", "Malaysia": "MY",
  "Indonesia": "ID", "Philippines": "PH", "Vietnam": "VN",
  "Cambodia": "KH", "Myanmar": "MM", "India": "IN",
  "Pakistan": "PK", "Sri Lanka": "LK", "Bangladesh": "BD",
  "Kazakhstan": "KZ",
  // Oceania
  "Australia": "AU", "New Zealand": "NZ",
  // Africa
  "Egypt": "EG", "Morocco": "MA", "South Africa": "ZA",
  "Kenya": "KE", "Tanzania": "TZ", "Nigeria": "NG",
  "Ethiopia": "ET", "Ghana": "GH",
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

// YAH and BT entries are derived from the starbucks-mugs.com sitemap at
// runtime. Only Disney Parks and special-edition cups remain here.
const CATALOG: CupEntry[] = [
  // Been There Disney Parks
  { city: "Disney California Adventure", region: "California", country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Disneyland Resort, Anaheim", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-california-adventure/" },
  { city: "Disneyland",                  region: "California", country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Disneyland Resort, Anaheim", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-disneyland/" },
  { city: "Magic Kingdom",               region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-magic-kingdom/" },
  { city: "EPCOT",                       region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-epcot/" },
  { city: "Animal Kingdom",              region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-animal-kingdom/" },
  { city: "Hollywood Studios",           region: "Florida",    country: "United States", series: "Been There Disney Parks", year: 2019, notes: "Walt Disney World, Orlando",  moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-disney-hollywood-studios/" },
  // Been There Marvel
  { city: "Wakanda", region: "", country: "", series: "Been There Marvel", year: 2021, scope: "themed", venue_series: "Been There Disney Parks", notes: "Black Panther / Wakanda — sold at Disney parks worldwide", moreInfoUrl: "https://starbucks-mugs.com/mug/been-there-marvel-wakanda/" },
];

// ── City → country lookup (non-US locations) ──────────────────────────────────
// Used by sitemap-driven builders to assign the correct country to a city slug.

const CITY_TO_COUNTRY: Record<string, string> = {
  // Canada
  "Alberta": "Canada", "Atlantic Canada": "Canada", "Banff": "Canada",
  "British Columbia": "Canada", "Calgary": "Canada", "Canada": "Canada",
  "Edmonton": "Canada", "Halifax": "Canada", "Manitoba": "Canada",
  "Montreal": "Canada", "Ontario": "Canada", "Ottawa": "Canada",
  "Quebec": "Canada", "Quebec City": "Canada", "Saskatchewan": "Canada",
  "Toronto": "Canada", "Vancouver": "Canada", "Vancouver Island": "Canada",
  "Whistler": "Canada", "Winnipeg": "Canada",
  // United Kingdom
  "Birmingham": "United Kingdom", "Edinburgh": "United Kingdom",
  "London": "United Kingdom", "Manchester": "United Kingdom",
  // Europe
  "Amsterdam": "Netherlands", "Athens": "Greece", "Barcelona": "Spain",
  "Berlin": "Germany", "Brussels": "Belgium", "Budapest": "Hungary",
  "Copenhagen": "Denmark", "Dublin": "Ireland", "Ghent": "Belgium",
  "Helsinki": "Finland", "Lisbon": "Portugal", "Madrid": "Spain",
  "Oslo": "Norway", "Paris": "France", "Prague": "Czech Republic",
  "Rome": "Italy", "Stockholm": "Sweden", "Vienna": "Austria",
  "Warsaw": "Poland", "Zurich": "Switzerland",
  // Asia
  "Bangkok": "Thailand", "Beijing": "China", "Dubai": "United Arab Emirates",
  "Hong Kong": "China", "Hong Kong Disneyland": "China",
  "Jakarta": "Indonesia", "Korea": "South Korea", "Kuala Lumpur": "Malaysia",
  "Kyoto": "Japan", "Manila": "Philippines", "Mumbai": "India",
  "New Delhi": "India", "Osaka": "Japan", "Seoul": "South Korea",
  "Shanghai": "China", "Singapore": "Singapore", "Taipei": "Taiwan",
  "Tel Aviv": "Israel", "Tokyo": "Japan",
  // Oceania
  "Auckland": "New Zealand", "Brisbane": "Australia",
  "Melbourne": "Australia", "Sydney": "Australia",
  // Latin America
  "Antigua Guatemala": "Guatemala", "Bogotá": "Colombia",
  "Buenos Aires": "Argentina", "El Salvador": "El Salvador",
  "Guyana": "Guyana", "Lima": "Peru", "Mazatlan": "Mexico",
  "Mexico": "Mexico", "Mexico City": "Mexico", "Rio de Janeiro": "Brazil",
  "San Miguel": "Mexico", "Santiago": "Chile", "São Paulo": "Brazil",
  // Africa
  "Cairo": "Egypt", "Cape Town": "South Africa",
  "Marrakech": "Morocco", "Nairobi": "Kenya",
};

// ── Whole-country slug detection ──────────────────────────────────────────────
// Locations where the slug title-cases to a whole-country name (scope: "country").

const WHOLE_COUNTRY_SLUGS = new Set([
  "Canada", "El Salvador", "Guyana", "Korea", "Mexico", "Singapore",
]);

// ── City → state/province region lookup ──────────────────────────────────────
// Used by sitemap-driven builders to assign the correct region to a city.
// Covers both static YAH/BT cities and Discovery-only locations.

const CITY_TO_REGION: Record<string, string> = {
  // US cities → state
  "Albuquerque": "New Mexico", "Anchorage": "Alaska", "Ann Arbor": "Michigan",
  "Aspen": "Colorado", "Athens": "Georgia", "Atlanta": "Georgia",
  "Atlantic City": "New Jersey", "Auburn University": "Alabama",
  "Austin": "Texas", "Baltimore": "Maryland", "Baton Rouge": "Louisiana",
  "Berkeley": "California", "Big Island": "Hawaii", "Boise": "Idaho",
  "Boston": "Massachusetts", "Boston University": "Massachusetts",
  "Brooklyn": "New York", "Burlington": "Vermont",
  "Cambridge": "Massachusetts", "Cape Cod": "Massachusetts",
  "Chapel Hill": "North Carolina", "Charleston": "South Carolina",
  "Charlotte": "North Carolina", "Chicago": "Illinois",
  "Cincinnati": "Ohio", "Cleveland": "Ohio", "Columbus": "Ohio",
  "Corvallis": "Oregon", "Dallas": "Texas", "Denver": "Colorado",
  "Des Moines": "Iowa", "Detroit": "Michigan", "Durham": "North Carolina",
  "Eugene": "Oregon", "Gainesville": "Florida", "Gatlinburg": "Tennessee",
  "Hartford": "Connecticut", "Hollywood": "California", "Honolulu": "Hawaii",
  "Houston": "Texas", "Howard University": "District of Columbia",
  "Indianapolis": "Indiana", "Iowa State University": "Iowa",
  "Jackson Hole": "Wyoming", "Jacksonville": "Florida",
  "Kansas City": "Missouri", "Key West": "Florida",
  "Knoxville": "Tennessee", "Lake Tahoe": "California",
  "Las Vegas": "Nevada", "Little Rock": "Arkansas",
  "Los Angeles": "California", "Louisville": "Kentucky",
  "Madison": "Wisconsin", "Manhattan": "New York", "Maui": "Hawaii",
  "Memphis": "Tennessee", "Miami": "Florida", "Miami University": "Ohio",
  "Milwaukee": "Wisconsin", "Minneapolis": "Minnesota",
  "Monterey": "California", "Myrtle Beach": "South Carolina",
  "Napa": "California", "Nashville": "Tennessee",
  "New Haven": "Connecticut", "New Orleans": "Louisiana",
  "New York": "New York", "New York City": "New York",
  "Niagara Falls": "New York", "Oahu": "Hawaii",
  "Oakland": "California", "Oklahoma City": "Oklahoma",
  "Omaha": "Nebraska", "Orange County": "California",
  "Orlando": "Florida", "Palm Springs": "California",
  "Palo Alto": "California", "Park City": "Utah",
  "Philadelphia": "Pennsylvania", "Phoenix": "Arizona",
  "Pike Place": "Washington", "Pittsburgh": "Pennsylvania",
  "Portland": "Oregon", "Princeton": "New Jersey",
  "Providence": "Rhode Island", "Queens": "New York",
  "Raleigh": "North Carolina", "Richmond": "Virginia",
  "Sacramento": "California", "Salt Lake City": "Utah",
  "San Antonio": "Texas", "San Diego": "California",
  "San Francisco": "California", "San Jose": "California",
  "Santa Fe": "New Mexico", "Savannah": "Georgia",
  "Seattle": "Washington", "Sedona": "Arizona",
  "Spokane": "Washington", "St. Louis": "Missouri",
  "Staten Island": "New York", "Tallahassee": "Florida",
  "Tampa": "Florida", "Temple University": "Pennsylvania",
  "Texas Am University": "Texas", "Texas Tech University": "Texas",
  "The Bronx": "New York", "The Florida Keys": "Florida",
  "The Hamptons": "New York", "Traverse City": "Michigan",
  "Tucson": "Arizona", "Tuscaloosa": "Alabama",
  "Twin Cities": "Minnesota", "University Of Georgia": "Georgia",
  "University Of Hawaii": "Hawaii", "University Of Memphis": "Tennessee",
  "Universal Epic Universe": "Florida", "Universal Orlando Resort": "Florida",
  "Universal Studios Hollywood": "California", "Vail": "Colorado",
  "Waikiki": "Hawaii", "Warner Bros Studios": "California",
  "Washington DC": "District of Columbia", "Wichita": "Kansas",
  "Yosemite": "California",
  // Canada cities → province
  "Banff": "Alberta", "Vancouver Island": "British Columbia",
  "Whistler": "British Columbia",
  // Atlantic Canada regional grouping
  "Atlantic Canada": "Atlantic Canada",
};

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

// ── Sub-national region tables (scope: "state") ───────────────────────────────
// Used by any series builder to detect state/province/territory slugs.
// "region" is set to the matched name so map popup matching works.

const US_STATES = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
  "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
  "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
]);

const CA_PROVINCES = new Set([
  // Provinces
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland And Labrador", "Nova Scotia", "Ontario",
  "Prince Edward Island", "Quebec", "Saskatchewan",
  // Territories
  "Northwest Territories", "Nunavut", "Yukon",
  // Regional grouping used on starbucks-mugs.com
  "Atlantic Canada",
]);

const AU_STATES = new Set([
  "New South Wales", "Victoria", "Queensland", "South Australia",
  "Western Australia", "Tasmania", "Northern Territory",
  "Australian Capital Territory",
]);

// ── General sitemap-driven series builder ─────────────────────────────────────
// Builds CupEntry[] for any series whose cups follow a <prefix>-<location> slug
// pattern on starbucks-mugs.com (You Are Here, Been There, Discovery Series).

function buildSeriesFromSitemap(
  mugsIndex: Map<string, string>,
  slugPrefix: string,
  seriesName: string,
  excludeLocationPrefixes: string[],
  defaultYear: number,
): CupEntry[] {
  const entries: CupEntry[] = [];

  for (const [slug, url] of mugsIndex) {
    if (!slug.startsWith(`${slugPrefix}-`)) continue;

    const locationSlug = slug.replace(`${slugPrefix}-`, "");

    if (locationSlug.includes("ornament")) continue;
    if (excludeLocationPrefixes.some((p) => locationSlug.startsWith(p))) continue;

    let cityName = locationSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    cityName = cityName.replace(/\bD C\b/, "DC");
    if (cityName === "St Louis") cityName = "St. Louis";

    let country = CITY_TO_COUNTRY[cityName] ?? "United States";

    let scope = "city";
    let region = "";

    if (US_STATES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (CA_PROVINCES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (AU_STATES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (WHOLE_COUNTRY_SLUGS.has(cityName)) {
      scope = "country";
    } else if (COUNTRY_CODES[cityName]) {
      scope = "country";
      country = cityName;
    }

    if (scope === "city" && !region) {
      region = CITY_TO_REGION[cityName] ?? "";
    }

    entries.push({
      city: cityName,
      region,
      country,
      series: seriesName,
      year: defaultYear,
      scope,
      notes: "",
      moreInfoUrl: url,
    });
  }

  return entries;
}

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

    let country = CITY_TO_COUNTRY[cityName] ?? "United States";

    let scope = "city";
    let region = "";
    if (US_STATES.has(cityName)) {
      scope = "state";
      region = cityName;
    } else if (CA_PROVINCES.has(cityName)) {
      scope = "state";
      region = cityName;
    } else if (AU_STATES.has(cityName)) {
      scope = "state";
      region = cityName;
    } else if (WHOLE_COUNTRY_SLUGS.has(cityName)) {
      scope = "country";
    } else if (COUNTRY_CODES[cityName]) {
      // Auto-detect: slug title-cases to a known country name not in WHOLE_COUNTRY_SLUGS
      scope = "country";
      country = cityName;
    }

    // For city-scope cups with no region, infer from combined lookup map
    if (scope === "city" && !region) {
      region = CITY_TO_REGION[cityName] ?? "";
    }

    entries.push({
      city: cityName,
      region,
      country,
      series: "Discovery Series",
      year: 2020,  // approximate — Discovery Series launched 2019-2020
      scope,
      notes: "",
      moreInfoUrl: url,
    });
  }

  return entries;
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

// ── Build output rows ─────────────────────────────────────────────────────────

interface OutputRow {
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

function buildRows(filterSeries: string | null, mugsIndex: Map<string, string>): OutputRow[] {
  // Static catalog entries (Disney Parks + special editions only)
  const catalogEntries = CATALOG.filter((e) => !filterSeries || e.series === filterSeries);

  // You Are Here — derived live from sitemap
  const yahEntries = (!filterSeries || filterSeries === "You Are Here")
    ? buildSeriesFromSitemap(mugsIndex, "you-are-here", "You Are Here", ["ornament"], 2015)
    : [];

  // Been There — derived live from sitemap (exclude disney-*, marvel-*, pin-drop-*, ornament*)
  const btEntries = (!filterSeries || filterSeries === "Been There")
    ? buildSeriesFromSitemap(mugsIndex, "been-there", "Been There", ["disney-", "marvel-", "pin-drop-", "ornament"], 2019)
    : [];

  // Discovery Series — derived live from sitemap
  const discoveryEntries = (!filterSeries || filterSeries === "Discovery Series")
    ? buildDiscoverySeriesFromSitemap(mugsIndex)
    : [];

  // Deduplicate by (city, series) — CATALOG entries first so they win
  // over any auto-detected duplicates (e.g. Singapore appears as both city and country).
  // Year is excluded from the key because YAH/BT years are scraped later and
  // the same city could otherwise appear twice at different default years.
  const seen = new Map<string, true>();
  const deduped: CupEntry[] = [];
  for (const e of [...catalogEntries, ...yahEntries, ...btEntries, ...discoveryEntries]) {
    const key = `${e.city}|${e.series}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(e);
    }
  }
  const allEntries = deduped;

  const rows: OutputRow[] = [];
  const noCoords: string[] = [];

  for (const e of allEntries) {
    const coordKey = `${e.city},${e.country}`;
    const [lat, lng] = COORDS[coordKey] ?? [0, 0];

    // State/country/themed cups appear in city-pin popups — no standalone pin needed,
    // so 0,0 coords are fine. Only skip city-scope entries that are missing coords.
    const isNonPin = e.scope === "state" || e.scope === "country" || e.scope === "themed";
    if (!isNonPin && lat === 0 && lng === 0 && e.country !== "") {
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
      item_type: "mug",
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
