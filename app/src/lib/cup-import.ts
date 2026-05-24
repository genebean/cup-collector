// Shared types and pure utilities used by both the CLI import script
// (scripts/import-cups.ts) and the web import API route.

export interface CsvRow {
  name: string;         // was "city" — now holds city, state, country, or themed location name
  scope: string;        // "city" | "state" | "country" | "themed"; defaults to "city" if column absent
  venue_series: string; // themed cups only: series name of the venue cups they're sold alongside
  item_type: string;    // "mug" | "ornament"; defaults to "mug" if column absent
  region: string;
  country: string;
  country_code: string;
  series: string;
  year: number;
  lat: number;
  lng: number;
  image_url: string;
  hobbydb_url: string;
  more_info_url: string;
  notes: string;
  sub_collection: string; // e.g. "Campus Collection" — from starbucks-mugs.com /tag/ pages
  variant_of: string;     // name of the base cup in the same series; "" for base cups
  variant_notes: string;  // scraper-populated explanation of what makes this variant different
  is_unique: boolean;     // admin override: not a variant despite similar name — import only sets true
}

// Parse a single CSV data line respecting RFC 4180 quoting.
// Handles: "quoted,fields", ""escaped quotes"", trailing commas.
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field — collect until closing unescaped quote
      i++;
      let val = "";
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          val += line[i++];
        }
      }
      values.push(val);
      if (i < line.length && line[i] === ',') i++;
    } else {
      // Unquoted field — read until next comma or end of line
      const end = line.indexOf(',', i);
      if (end === -1) {
        values.push(line.slice(i).trim());
        break;
      }
      values.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  // A trailing comma means one more empty field (e.g. "a,b," → ["a","b",""])
  if (line.endsWith(',')) values.push("");
  return values;
}

export function parseCSV(text: string): CsvRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    // Support both old CSVs (city column) and new CSVs (name column)
    const name = row.name || row.city;
    if (!name || !row.series || !row.year) continue;

    rows.push({
      name,
      scope: row.scope || "city",
      venue_series: row.venue_series ?? "",
      item_type: row.item_type || "mug",
      region: row.region ?? "",
      country: row.country ?? "",
      country_code: row.country_code ?? "",
      series: row.series,
      year: parseInt(row.year, 10),
      lat: parseFloat(row.lat) || 0,
      lng: parseFloat(row.lng) || 0,
      image_url: row.image_url ?? "",
      hobbydb_url: row.hobbydb_url ?? "",
      more_info_url: row.more_info_url ?? "",
      notes: row.notes ?? "",
      sub_collection: row.sub_collection ?? "",
      variant_of: row.variant_of ?? "",
      variant_notes: row.variant_notes ?? "",
      is_unique: row.is_unique === "true",
    });
  }
  return rows;
}

export function rowMatchesExisting(row: CsvRow, existing: Record<string, unknown>): boolean {
  const s = (v: unknown) => String(v ?? "");
  const n = (v: unknown) => Number(v ?? 0);
  // hobbydb_url is filled manually after export — only compare when the CSV has a value,
  // so a hand-curated DB entry is never overwritten by an empty CSV column.
  const hobbydbMatch = !row.hobbydb_url || row.hobbydb_url === s(existing.hobbydb_url);
  return (
    row.item_type      === s(existing.item_type) &&
    row.scope          === (s(existing.scope) || "city") &&
    row.venue_series   === s(existing.venue_series) &&
    row.region         === s(existing.region) &&
    row.country        === s(existing.country) &&
    row.country_code   === s(existing.country_code) &&
    row.lat            === n(existing.lat) &&
    row.lng            === n(existing.lng) &&
    row.image_url      === s(existing.image_credit) &&
    hobbydbMatch &&
    row.more_info_url  === s(existing.more_info_url) &&
    row.notes          === s(existing.notes) &&
    row.sub_collection === s(existing.sub_collection) &&
    row.variant_notes  === s(existing.variant_notes)
    // variant_of is resolved to an ID in the import script and compared there.
    // is_unique is admin-only and never overwritten by a CSV import.
  );
}

// Returns a list of human-readable diff strings between the CSV row and the DB record.
// Used to log what changed during an import run.
export function diffRow(row: CsvRow, existing: Record<string, unknown>): string[] {
  const s = (v: unknown) => String(v ?? "");
  const n = (v: unknown) => Number(v ?? 0);
  const diffs: string[] = [];
  if (row.item_type      !== s(existing.item_type))           diffs.push(`item_type: csv="${row.item_type}" db="${s(existing.item_type)}"`);
  if (row.scope          !== (s(existing.scope) || "city"))  diffs.push(`scope: csv="${row.scope}" db="${s(existing.scope) || "city"}"`);
  if (row.venue_series   !== s(existing.venue_series))        diffs.push(`venue_series: csv="${row.venue_series}" db="${s(existing.venue_series)}"`);
  if (row.region         !== s(existing.region))              diffs.push(`region: csv="${row.region}" db="${s(existing.region)}"`);
  if (row.country        !== s(existing.country))             diffs.push(`country: csv="${row.country}" db="${s(existing.country)}"`);
  if (row.country_code   !== s(existing.country_code))        diffs.push(`country_code: csv="${row.country_code}" db="${s(existing.country_code)}"`);
  if (row.lat            !== n(existing.lat))                 diffs.push(`lat: csv=${row.lat} db=${n(existing.lat)}`);
  if (row.lng            !== n(existing.lng))                 diffs.push(`lng: csv=${row.lng} db=${n(existing.lng)}`);
  if (row.image_url      !== s(existing.image_credit))        diffs.push(`image_url: csv="${row.image_url}" db="${s(existing.image_credit)}"`);
  if (row.hobbydb_url && row.hobbydb_url !== s(existing.hobbydb_url)) diffs.push(`hobbydb_url: csv="${row.hobbydb_url}" db="${s(existing.hobbydb_url)}"`);
  if (row.more_info_url  !== s(existing.more_info_url))       diffs.push(`more_info_url: csv="${row.more_info_url}" db="${s(existing.more_info_url)}"`);
  if (row.notes          !== s(existing.notes))               diffs.push(`notes: csv="${row.notes}" db="${s(existing.notes)}"`);
  if (row.sub_collection !== s(existing.sub_collection))      diffs.push(`sub_collection: csv="${row.sub_collection}" db="${s(existing.sub_collection)}"`);
  if (row.variant_notes  !== s(existing.variant_notes))       diffs.push(`variant_notes: csv="${row.variant_notes}" db="${s(existing.variant_notes)}"`);
  return diffs;
}
