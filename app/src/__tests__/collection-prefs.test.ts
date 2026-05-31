import { describe, it, expect } from "vitest";
import { isExcludedSeries, isExcludedType, isDisplayableCup } from "@/lib/collection-prefs";
import type { Cup, CollectionPrefs } from "@/types";

// Minimal Cup stub — only the fields isDisplayableCup reads.
function makeCup(overrides: Partial<Cup> = {}): Cup {
  return {
    id: "cup1", collectionId: "cups", name: "Atlanta", scope: "city",
    region: "Georgia", country: "United States", country_code: "US",
    series: "You Are Here", item_type: "mug", year: 2019,
    image: "", image_credit: "", lat: 33.749, lng: -84.388,
    notes: "", hobbydb_url: "", more_info_url: "", venue_series: "",
    is_duplicate: false, duplicate_ok: false, variant_of: "", is_unique: false,
    sub_collection: "", variant_notes: "", slug: "",
    ...overrides,
  };
}

describe("isExcludedSeries", () => {
  it("returns false when excluded_series is absent", () => {
    expect(isExcludedSeries({}, "You Are Here")).toBe(false);
  });

  it("returns false when series is not in the list", () => {
    expect(isExcludedSeries({ excluded_series: ["Been There"] }, "You Are Here")).toBe(false);
  });

  it("returns true when series is in the list", () => {
    expect(isExcludedSeries({ excluded_series: ["You Are Here"] }, "You Are Here")).toBe(true);
  });
});

describe("isExcludedType", () => {
  it("returns false when excluded_types is absent", () => {
    expect(isExcludedType({}, "ornament")).toBe(false);
  });

  it("returns false when type is not in the list", () => {
    expect(isExcludedType({ excluded_types: ["ornament"] }, "mug")).toBe(false);
  });

  it("returns true when type is in the list", () => {
    expect(isExcludedType({ excluded_types: ["ornament"] }, "ornament")).toBe(true);
  });
});

describe("isDisplayableCup", () => {
  const emptyPrefs: CollectionPrefs = {};

  it("returns true for a normal cup with empty prefs", () => {
    expect(isDisplayableCup(makeCup(), emptyPrefs)).toBe(true);
  });

  it("returns false when cup is_duplicate", () => {
    expect(isDisplayableCup(makeCup({ is_duplicate: true }), emptyPrefs)).toBe(false);
  });

  it("returns false when the cup's series is excluded", () => {
    const prefs = { excluded_series: ["You Are Here"] };
    expect(isDisplayableCup(makeCup({ series: "You Are Here" }), prefs)).toBe(false);
  });

  it("returns false when the cup's item_type is excluded", () => {
    const prefs = { excluded_types: ["ornament"] };
    expect(isDisplayableCup(makeCup({ item_type: "ornament" }), prefs)).toBe(false);
  });

  it("treats blank item_type as mug for exclusion check", () => {
    const prefs = { excluded_types: ["mug"] };
    expect(isDisplayableCup(makeCup({ item_type: "" }), prefs)).toBe(false);
  });

  it("returns true when series exclusion does not match", () => {
    const prefs = { excluded_series: ["Been There"] };
    expect(isDisplayableCup(makeCup({ series: "You Are Here" }), prefs)).toBe(true);
  });

  it("is_duplicate takes precedence over other checks", () => {
    const prefs = { excluded_series: ["You Are Here"] };
    // Even without the series exclusion, is_duplicate alone is enough to hide
    expect(isDisplayableCup(makeCup({ is_duplicate: true }), prefs)).toBe(false);
  });
});
