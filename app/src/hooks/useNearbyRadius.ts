"use client";

import { useState } from "react";
import { RADIUS_OPTIONS, DEFAULT_RADIUS_METERS } from "@/lib/nearby-radius";

export { RADIUS_OPTIONS } from "@/lib/nearby-radius";

const STORAGE_KEY = "nearby_radius_meters";

export function useNearbyRadius() {
  const [radiusMeters, setRadiusMeters] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_RADIUS_METERS;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (RADIUS_OPTIONS.some((o) => o.meters === n)) return n;
    }
    return DEFAULT_RADIUS_METERS;
  });

  function setRadius(meters: number) {
    setRadiusMeters(meters);
    localStorage.setItem(STORAGE_KEY, String(meters));
  }

  return { radiusMeters, setRadius };
}
