// Extracts the hostname from a URL for display, stripping the www. prefix.
// Returns an empty string for invalid or empty URLs rather than throwing.
export function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
