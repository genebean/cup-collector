// Shared types and pure utilities for the import scripts.
// Kept in sync with app/src/lib/cup-import.ts — the app's ESM package
// boundary prevents the scripts (CJS) from importing directly from there.

export interface CsvRow {
  name: string;         // was "city" — now holds city, state, country, or themed location name
  scope: string;        // "city" | "state" | "country" | "themed"; defaults to "city" if column absent
  venue_series: string; // themed cups only: series name of the venue cups they're sold alongside
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
}

export function parseCSV(text: string): CsvRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    // Support both old CSVs (city column) and new CSVs (name column)
    const name = row.name || row.city;
    if (!name || !row.series || !row.year) continue;

    rows.push({
      name,
      scope: row.scope || "city",
      venue_series: row.venue_series ?? "",
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
    });
  }
  return rows;
}

export function rowMatchesExisting(row: CsvRow, existing: Record<string, unknown>): boolean {
  const s = (v: unknown) => String(v ?? "");
  const n = (v: unknown) => Number(v ?? 0);
  return (
    row.scope         === (s(existing.scope) || "city") &&
    row.venue_series  === s(existing.venue_series) &&
    row.region        === s(existing.region) &&
    row.country       === s(existing.country) &&
    row.country_code  === s(existing.country_code) &&
    row.lat           === n(existing.lat) &&
    row.lng           === n(existing.lng) &&
    row.image_url     === s(existing.image_credit) &&
    row.hobbydb_url   === s(existing.hobbydb_url) &&
    row.more_info_url === s(existing.more_info_url) &&
    row.notes         === s(existing.notes)
  );
}
