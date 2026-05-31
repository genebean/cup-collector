// Builds an RFC 4180 CSV string from headers and rows.
// Every value is double-quote wrapped; internal double-quotes are doubled.
export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const escape = (v: string | number | boolean | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  return lines.join("\n");
}
