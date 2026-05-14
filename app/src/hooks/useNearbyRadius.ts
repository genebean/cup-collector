"use client";

import { useState } from "react";

export const RADIUS_OPTIONS = [
  { label: "2 mi",  meters: 3219,  zoom: 13 },
  { label: "5 mi",  meters: 8047,  zoom: 12 },
  { label: "10 mi", meters: 16093, zoom: 11 },
  { label: "25 mi", meters: 40234, zoom: 9  },
] as const;

const STORAGE_KEY = "nearby_radius_meters";
const DEFAULT_METERS = 16093; // 10 miles

export function useNearbyRadius() {
  const [radiusMeters, setRadiusMeters] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_METERS;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (RADIUS_OPTIONS.some((o) => o.meters === n)) return n;
    }
    return DEFAULT_METERS;
  });

  function setRadius(meters: number) {
    setRadiusMeters(meters);
    localStorage.setItem(STORAGE_KEY, String(meters));
  }

  return { radiusMeters, setRadius };
}
