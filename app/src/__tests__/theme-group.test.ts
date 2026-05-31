import { describe, it, expect } from "vitest";
import { getThemeGroup } from "@/lib/theme-group";
import type { Cup } from "@/types";

function makeCup(overrides: Partial<Cup> = {}): Cup {
  return {
    id: "cup1", collectionId: "cups", name: "Test", scope: "themed",
    region: "", country: "United States", country_code: "US",
    series: "Been There", item_type: "mug", year: 2022,
    image: "", image_credit: "", lat: 0, lng: 0,
    notes: "", hobbydb_url: "", more_info_url: "", venue_series: "",
    is_duplicate: false, duplicate_ok: false, variant_of: "", is_unique: false,
    sub_collection: "", variant_notes: "", slug: "",
    ...overrides,
  };
}

describe("getThemeGroup", () => {
  it("returns 'Star Wars' when notes include 'star wars'", () => {
    expect(getThemeGroup(makeCup({ notes: "Star Wars themed cup" }))).toBe("Star Wars");
  });

  it("is case-insensitive for notes matching", () => {
    expect(getThemeGroup(makeCup({ notes: "STAR WARS collection" }))).toBe("Star Wars");
  });

  it("returns 'Marvel' for avengers campus note", () => {
    expect(getThemeGroup(makeCup({ notes: "avengers campus exclusive" }))).toBe("Marvel");
  });

  it("returns 'Marvel' for black panther note", () => {
    expect(getThemeGroup(makeCup({ notes: "black panther wakanda" }))).toBe("Marvel");
  });

  it("returns 'Marvel' for been there marvel series", () => {
    expect(getThemeGroup(makeCup({ series: "Been There Marvel" }))).toBe("Marvel");
  });

  it("returns 'Cruise Ships' when notes include 'cruise ship'", () => {
    expect(getThemeGroup(makeCup({ notes: "sold on cruise ship routes" }))).toBe("Cruise Ships");
  });

  it("returns 'Disney Parks' for Been There Disney Parks venue_series", () => {
    expect(getThemeGroup(makeCup({ venue_series: "Been There Disney Parks" }))).toBe("Disney Parks");
  });

  it("returns venue_series when set and not Disney Parks", () => {
    expect(getThemeGroup(makeCup({ venue_series: "Universal Studios" }))).toBe("Universal Studios");
  });

  it("falls back to series when no notes or venue_series match", () => {
    expect(getThemeGroup(makeCup({ series: "Special Edition" }))).toBe("Special Edition");
  });
});
