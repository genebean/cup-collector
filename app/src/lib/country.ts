// Convert ISO 3166-1 alpha-2 country code to a flag emoji.
// Each letter maps to a Regional Indicator Symbol (Unicode block U+1F1E6–U+1F1FF).
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}
