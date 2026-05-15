import { describe, it, expect } from "vitest";
import { haversineMi } from "@/lib/geo";

describe("haversineMi", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMi({ lat: 47.6, lng: -122.3 }, { lat: 47.6, lng: -122.3 })).toBe(0);
  });

  it("Seattle to Atlanta is approximately 2,182 miles", () => {
    const seattle = { lat: 47.6062, lng: -122.3321 };
    const atlanta = { lat: 33.749, lng: -84.388 };
    expect(haversineMi(seattle, atlanta)).toBeCloseTo(2182, -2); // within ~100 miles
  });

  it("London to Tokyo is approximately 5,940 miles", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const tokyo = { lat: 35.6762, lng: 139.6503 };
    expect(haversineMi(london, tokyo)).toBeCloseTo(5940, -2);
  });

  it("is symmetric — distance A→B equals B→A", () => {
    const a = { lat: 33.749, lng: -84.388 };
    const b = { lat: 35.6762, lng: 139.6503 };
    expect(haversineMi(a, b)).toBeCloseTo(haversineMi(b, a), 10);
  });
});
