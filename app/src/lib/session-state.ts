// Parses a JSON string (e.g. from sessionStorage.getItem) and returns the
// parsed value, or `fallback` if the string is null, empty, or invalid JSON.
// Pure function — no browser APIs — so it is unit-testable in isolation.
export function tryParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
