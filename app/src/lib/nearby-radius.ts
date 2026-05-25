export const RADIUS_OPTIONS = [
  { label: "2 mi",  meters: 3219,  zoom: 13 },
  { label: "5 mi",  meters: 8047,  zoom: 12 },
  { label: "10 mi", meters: 16093, zoom: 11 },
  { label: "25 mi", meters: 40234, zoom: 9  },
] as const;

export type RadiusOption = typeof RADIUS_OPTIONS[number];

export const DEFAULT_RADIUS_METERS = 16093; // 10 miles

// Given a Leaflet zoom level, returns the radius (in meters) of the chip
// whose zoom is closest to the current map zoom. Ties go to the chip with
// the higher zoom number (smaller radius) so the progression is conservative.
export function chipMetersForZoom(zoom: number): number {
  return (RADIUS_OPTIONS as readonly RadiusOption[]).reduce((best, opt) => {
    const bestDiff = Math.abs(best.zoom - zoom);
    const optDiff  = Math.abs(opt.zoom  - zoom);
    if (optDiff < bestDiff) return opt;
    if (optDiff === bestDiff && opt.zoom > best.zoom) return opt;
    return best;
  }).meters;
}
