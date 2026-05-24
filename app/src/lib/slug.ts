// Slug generation for cup detail page URLs.
// Rules: remove punctuation that isn't a word boundary (apostrophes, periods,
// commas, etc.); replace word-boundary chars (spaces, &, /) with hyphens;
// strip diacritics; collapse runs; lowercase.

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining diacritical marks (accents)
    .replace(/\p{M}/gu, "")
    // Remove chars that should vanish entirely (not be replaced by a hyphen)
    .replace(/['''"`.,;:!?()[\]{}@#$%^*+=|\\<>~]/g, "")
    // Replace word-boundary chars with hyphens
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse and trim
    .replace(/^-+|-+$/g, "");
}

// Generates the canonical URL slug for a cup.
// Format: {name}-{series}-{year}  (+ "-ornament" suffix for ornaments)
export function toCupSlug(cup: {
  name: string;
  series: string;
  year: number;
  item_type?: string;
}): string {
  const parts = [slugify(cup.name), slugify(cup.series), String(cup.year)];
  if ((cup.item_type ?? "mug") === "ornament") parts.push("ornament");
  return parts.join("-");
}

// PocketBase record IDs are always exactly 15 lowercase alphanumeric chars.
// A cup slug always contains hyphens (name-series-year), so these never collide.
const PB_ID_RE = /^[a-z0-9]{15}$/;
export function looksLikeId(s: string): boolean {
  return PB_ID_RE.test(s);
}
