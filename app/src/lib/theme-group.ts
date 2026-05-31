import type { Cup } from "@/types";

// Derives a display-friendly theme group from a themed cup's notes, series, and venue fields.
// Used by the Stats screen to group themed cups under a common label.
export function getThemeGroup(cup: Cup): string {
  const notes = cup.notes?.toLowerCase() ?? "";
  const series = cup.series?.toLowerCase() ?? "";
  if (notes.includes("star wars")) return "Star Wars";
  if (notes.includes("avengers campus") || notes.includes("black panther") || series === "been there marvel") return "Marvel";
  if (notes.includes("cruise ship")) return "Cruise Ships";
  if (cup.venue_series === "Been There Disney Parks") return "Disney Parks";
  if (cup.venue_series) return cup.venue_series;
  return cup.series;
}
