import { describe, it, expect } from "vitest";
import { chipMetersForZoom, RADIUS_OPTIONS } from "@/lib/nearby-radius";

// RADIUS_OPTIONS zoom values: 2mi=13, 5mi=12, 10mi=11, 25mi=9

describe("chipMetersForZoom", () => {
  it("returns 2mi meters at zoom 13 (exact match)", () => {
    expect(chipMetersForZoom(13)).toBe(3219);
  });

  it("returns 5mi meters at zoom 12 (exact match)", () => {
    expect(chipMetersForZoom(12)).toBe(8047);
  });

  it("returns 10mi meters at zoom 11 (exact match)", () => {
    expect(chipMetersForZoom(11)).toBe(16093);
  });

  it("returns 25mi meters at zoom 9 (exact match)", () => {
    expect(chipMetersForZoom(9)).toBe(40234);
  });

  it("returns 10mi at zoom 10 — equidistant from 10mi(11) and 25mi(9), tie-breaks to smaller radius", () => {
    expect(chipMetersForZoom(10)).toBe(16093);
  });

  it("returns 2mi at zoom 14 — more zoomed in than any chip, clamps to 2mi", () => {
    expect(chipMetersForZoom(14)).toBe(3219);
  });

  it("returns 25mi at zoom 8 — more zoomed out than any chip, clamps to 25mi", () => {
    expect(chipMetersForZoom(8)).toBe(40234);
  });

  it("returns 25mi at zoom 1 — far beyond max zoom out", () => {
    expect(chipMetersForZoom(1)).toBe(40234);
  });

  it("only returns meters values that exist in RADIUS_OPTIONS", () => {
    const validMeters = new Set<number>(RADIUS_OPTIONS.map((o) => o.meters));
    for (let z = 1; z <= 18; z++) {
      expect(validMeters.has(chipMetersForZoom(z))).toBe(true);
    }
  });
});
