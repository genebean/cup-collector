// Pure catalog logic — no Node.js imports.
// All static data imported from ./catalog-data.

import {
  SERIES_PREFIX,
  COORDS,
  COUNTRY_CODES,
  CATALOG,
  CITY_TO_COUNTRY,
  WHOLE_COUNTRY_SLUGS,
  CITY_TO_REGION,
  DISCOVERY_EXCLUDE_PREFIXES,
  STAR_WARS_BARE_SLUGS,
  STAR_WARS_NAME_FIXES,
  US_STATES,
  CA_PROVINCES,
  AU_STATES,
} from "./catalog-data";

export type { CupEntry } from "./catalog-data";
export {
  SERIES_PREFIX,
  COORDS,
  COUNTRY_CODES,
  CATALOG,
  CITY_TO_COUNTRY,
  WHOLE_COUNTRY_SLUGS,
  CITY_TO_REGION,
  DISCOVERY_EXCLUDE_PREFIXES,
  STAR_WARS_BARE_SLUGS,
  STAR_WARS_NAME_FIXES,
  US_STATES,
  CA_PROVINCES,
  AU_STATES,
} from "./catalog-data";

import type { CupEntry } from "./catalog-data";

// ── URL slug helpers ──────────────────────────────────────────────────────────

export function toSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function resolveUrl(index: Map<string, string>, candidates: string[]): string {
  for (const slug of candidates) {
    const url = index.get(slug);
    if (url) return url;
  }
  return "";
}

export function lookupMugsUrl(index: Map<string, string>, series: string, city: string): string {
  const prefix = SERIES_PREFIX[series];
  if (!prefix) return "";

  const citySlug = toSlug(city);
  const base = `${prefix}-${citySlug}`;
  const alternates: string[] = [base];
  if (citySlug === "washington-dc") alternates.push(`${prefix}-washington-d-c`);

  return resolveUrl(index, alternates);
}

// ── Coordinate / country resolution with progressive fallback ────────────────
// For Relief variants like "Manila Red", "Hong Kong 2 Dragon", "Mini Shanghai Gold":
// strip trailing words (then leading words) one at a time until a match is found.

export function resolveCountry(cityName: string): string {
  if (CITY_TO_COUNTRY[cityName]) return CITY_TO_COUNTRY[cityName];
  const words = cityName.split(" ");
  // Strip from end: "Manila Red" → "Manila"
  for (let i = words.length - 1; i >= 1; i--) {
    const c = words.slice(0, i).join(" ");
    if (CITY_TO_COUNTRY[c]) return CITY_TO_COUNTRY[c];
  }
  // Strip from front: "Mini Shanghai Gold" → "Shanghai Gold" → "Shanghai"
  for (let start = 1; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const c = words.slice(start, end).join(" ");
      if (CITY_TO_COUNTRY[c]) return CITY_TO_COUNTRY[c];
    }
  }
  return "United States";
}

export function resolveCoords(city: string, country: string): [number, number] {
  const exact = COORDS[`${city},${country}`];
  if (exact) return exact;
  const words = city.split(" ");
  // Strip from end: "Hong Kong 2 Dragon" → "Hong Kong 2" → "Hong Kong"
  for (let i = words.length - 1; i >= 1; i--) {
    const shorter = words.slice(0, i).join(" ");
    const fallback = COORDS[`${shorter},${country}`];
    if (fallback) return fallback;
  }
  // Strip from front: "Mini Shanghai Gold" → "Shanghai Gold" → "Shanghai"
  for (let start = 1; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const c = words.slice(start, end).join(" ");
      const fallback = COORDS[`${c},${country}`];
      if (fallback) return fallback;
    }
  }
  return [0, 0];
}

// ── General sitemap-driven series builder ─────────────────────────────────────
// Builds CupEntry[] for any series whose cups follow a <prefix>-<location> slug
// pattern on starbucks-mugs.com (You Are Here, Been There, Discovery Series).

export function buildSeriesFromSitemap(
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

    // Cruise ships have no fixed location — include as themed with no coords.
    if (/\bOf The Seas\b/.test(cityName) || /^Norwegian /.test(cityName)) {
      entries.push({
        city: cityName, region: "", country: "",
        series: seriesName, year: defaultYear,
        scope: "themed", notes: "Cruise ship", moreInfoUrl: url,
      });
      continue;
    }

    // Star Wars planets — include as themed with no coords.
    if (STAR_WARS_BARE_SLUGS.has(locationSlug) || locationSlug.startsWith("star-wars-")) {
      const rawSlug = locationSlug.startsWith("star-wars-")
        ? locationSlug.replace("star-wars-", "") : locationSlug;
      const swName = STAR_WARS_NAME_FIXES[rawSlug] ?? rawSlug
        .split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      entries.push({
        city: swName, region: "", country: "",
        series: seriesName, year: defaultYear,
        scope: "themed", venue_series: "Been There Disney Parks",
        notes: "Star Wars — available at Disney parks (Galaxy's Edge)", moreInfoUrl: url,
      });
      continue;
    }

    let country = resolveCountry(cityName);

    let scope = "city";
    let region = "";

    if (US_STATES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (CA_PROVINCES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (AU_STATES.has(cityName)) {
      scope = "state"; region = cityName;
    } else if (WHOLE_COUNTRY_SLUGS.has(cityName)) {
      scope = "country"; country = cityName;
    } else if (COUNTRY_CODES[cityName]) {
      scope = "country";
      country = cityName;
    } else if (scope === "city" && !CITY_TO_COUNTRY[cityName]) {
      // Progressive check: if stripping affixes reveals a known country code entry,
      // this is a country-level cup (e.g. "Christmas France", "Japan 5 Fall Edition").
      // Guard: skip for cities in CITY_TO_COUNTRY — they are definitively cities, not countries
      // (e.g. "Antigua Guatemala" would otherwise falsely match "Guatemala" → country scope).
      const words = cityName.split(" ");
      let found = false;
      for (let i = words.length - 1; i >= 1 && !found; i--) {
        const base = words.slice(0, i).join(" ");
        if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
      }
      for (let s = 1; s < words.length && !found; s++) {
        for (let e = words.length; e > s && !found; e--) {
          const base = words.slice(s, e).join(" ");
          if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
        }
      }
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

export function buildDiscoverySeriesFromSitemap(mugsIndex: Map<string, string>): CupEntry[] {
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

    let country = resolveCountry(cityName);

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
      scope = "country"; country = cityName;
    } else if (COUNTRY_CODES[cityName]) {
      // Auto-detect: slug title-cases to a known country name not in WHOLE_COUNTRY_SLUGS
      scope = "country";
      country = cityName;
    } else if (scope === "city") {
      const words = cityName.split(" ");
      let found = false;
      for (let i = words.length - 1; i >= 1 && !found; i--) {
        const base = words.slice(0, i).join(" ");
        if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
      }
      for (let s = 1; s < words.length && !found; s++) {
        for (let e = words.length; e > s && !found; e--) {
          const base = words.slice(s, e).join(" ");
          if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
        }
      }
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

// ── Ornament series builder ───────────────────────────────────────────────────
// Handles slugs of the form <prefix>-ornament-<location>.

export function buildOrnamentsFromSitemap(
  mugsIndex: Map<string, string>,
  slugPrefix: string,
  seriesName: string,
  defaultYear: number,
): CupEntry[] {
  const entries: CupEntry[] = [];
  const ornamentPrefix = `${slugPrefix}-ornament-`;

  for (const [slug, url] of mugsIndex) {
    if (!slug.startsWith(ornamentPrefix)) continue;

    const locationSlug = slug.replace(ornamentPrefix, "");

    // Skip Disney parks and Star Wars planets — no standalone coords needed
    if (locationSlug.startsWith("disney-")) continue;
    if (locationSlug.startsWith("star-wars-") || STAR_WARS_BARE_SLUGS.has(locationSlug)) continue;

    let cityName = locationSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    cityName = cityName.replace(/\bD C\b/, "DC");
    if (cityName === "St Louis") cityName = "St. Louis";

    let country = resolveCountry(cityName);
    let scope = "city";
    let region = "";

    if (US_STATES.has(cityName))    { scope = "state"; region = cityName; }
    else if (CA_PROVINCES.has(cityName)) { scope = "state"; region = cityName; }
    else if (AU_STATES.has(cityName))    { scope = "state"; region = cityName; }
    else if (WHOLE_COUNTRY_SLUGS.has(cityName)) { scope = "country"; country = cityName; }
    else if (COUNTRY_CODES[cityName]) { scope = "country"; country = cityName; }
    else if (scope === "city") {
      const words = cityName.split(" ");
      let found = false;
      for (let i = words.length - 1; i >= 1 && !found; i--) {
        const base = words.slice(0, i).join(" ");
        if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
      }
      for (let s = 1; s < words.length && !found; s++) {
        for (let e = words.length; e > s && !found; e--) {
          const base = words.slice(s, e).join(" ");
          if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
        }
      }
    }

    if (scope === "city" && !region) region = CITY_TO_REGION[cityName] ?? "";

    entries.push({
      city: cityName,
      region,
      country,
      series: seriesName,
      year: defaultYear,
      scope,
      notes: "",
      moreInfoUrl: url,
      item_type: "ornament",
    });
  }

  return entries;
}

// ── Relief series builder ─────────────────────────────────────────────────────
// Relief mugs follow `relief-<location>` slugs. Variant suffixes like "-red" or
// "-2-dragon" are kept as part of the display name (they are distinct products).
// Coordinates use progressive fallback: "Manila Red" → "Manila", etc.

export function buildReliefFromSitemap(mugsIndex: Map<string, string>): CupEntry[] {
  const entries: CupEntry[] = [];

  for (const [slug, url] of mugsIndex) {
    if (!slug.startsWith("relief-")) continue;

    const locationSlug = slug.replace("relief-", "");
    if (locationSlug.includes("ornament")) continue;

    const cityName = locationSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const country = resolveCountry(cityName);
    const region = CITY_TO_REGION[cityName] ?? "";

    entries.push({
      city: cityName,
      region,
      country,
      series: "Relief",
      year: 2014,
      scope: "city",
      notes: "",
      moreInfoUrl: url,
      item_type: "mug",
    });
  }

  return entries;
}

// ── Icon Mini series builder ──────────────────────────────────────────────────

export function buildIconMiniFromSitemap(mugsIndex: Map<string, string>): CupEntry[] {
  const entries: CupEntry[] = [];

  for (const [slug, url] of mugsIndex) {
    if (!slug.startsWith("icon-mini-")) continue;

    const locationSlug = slug.replace("icon-mini-", "");
    if (locationSlug.includes("ornament")) continue;

    let cityName = locationSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    cityName = cityName.replace(/\bD C\b/, "DC");

    let country = resolveCountry(cityName);
    const region = CITY_TO_REGION[cityName] ?? "";

    let scope = "city";
    if (WHOLE_COUNTRY_SLUGS.has(cityName)) { scope = "country"; country = cityName; }
    else if (COUNTRY_CODES[cityName]) { scope = "country"; country = cityName; }
    else {
      const words = cityName.split(" ");
      let found = false;
      for (let i = words.length - 1; i >= 1 && !found; i--) {
        const base = words.slice(0, i).join(" ");
        if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
      }
      for (let s = 1; s < words.length && !found; s++) {
        for (let e = words.length; e > s && !found; e--) {
          const base = words.slice(s, e).join(" ");
          if (COUNTRY_CODES[base]) { scope = "country"; found = true; }
        }
      }
    }

    entries.push({
      city: cityName,
      region,
      country,
      series: "Icon Mini",
      year: 2016,
      scope,
      notes: "",
      moreInfoUrl: url,
      item_type: "mug",
    });
  }

  return entries;
}

// ── Build output rows ─────────────────────────────────────────────────────────

export interface OutputRow {
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

export function buildRows(filterSeries: string | null, mugsIndex: Map<string, string>): OutputRow[] {
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

  // Ornaments — one builder per series prefix; excluded from mug builders above
  const yahOrnaments = (!filterSeries || filterSeries === "You Are Here")
    ? buildOrnamentsFromSitemap(mugsIndex, "you-are-here", "You Are Here", 2015)
    : [];
  const btOrnaments = (!filterSeries || filterSeries === "Been There")
    ? buildOrnamentsFromSitemap(mugsIndex, "been-there", "Been There", 2019)
    : [];
  const discoveryOrnaments = (!filterSeries || filterSeries === "Discovery Series")
    ? buildOrnamentsFromSitemap(mugsIndex, "discovery-series", "Discovery Series", 2020)
    : [];

  // Relief — ~164 entries, variant slugs kept as distinct cups
  const reliefEntries = (!filterSeries || filterSeries === "Relief")
    ? buildReliefFromSitemap(mugsIndex)
    : [];

  // Icon Mini — older Asia-focused series
  const iconMiniEntries = (!filterSeries || filterSeries === "Icon Mini")
    ? buildIconMiniFromSitemap(mugsIndex)
    : [];

  // Deduplicate by (city, series, item_type) — CATALOG entries first so they win
  // over any auto-detected duplicates (e.g. Singapore appears as both city and country).
  // Year is excluded from the key because YAH/BT years are scraped later and
  // the same city could otherwise appear twice at different default years.
  const seen = new Map<string, true>();
  const deduped: CupEntry[] = [];
  for (const e of [
    ...catalogEntries,
    ...yahEntries, ...btEntries, ...discoveryEntries,
    ...yahOrnaments, ...btOrnaments, ...discoveryOrnaments,
    ...reliefEntries, ...iconMiniEntries,
  ]) {
    const key = `${e.city}|${e.series}|${e.item_type ?? "mug"}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(e);
    }
  }
  const allEntries = deduped;

  const rows: OutputRow[] = [];
  const noCoords: string[] = [];

  for (const e of allEntries) {
    const [lat, lng] = resolveCoords(e.city, e.country);

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
      item_type: e.item_type ?? "mug",
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
