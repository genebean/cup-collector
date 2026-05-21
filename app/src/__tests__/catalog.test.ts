import { describe, it, expect } from "vitest";
import {
  toSlug,
  resolveUrl,
  lookupMugsUrl,
  resolveCountry,
  resolveCoords,
} from "@/lib/catalog";

describe("toSlug", () => {
  it("lowercases and hyphenates basic strings", () => {
    expect(toSlug("Seattle")).toBe("seattle");
    expect(toSlug("New York")).toBe("new-york");
  });

  it("strips accents: São Paulo → sao-paulo", () => {
    expect(toSlug("São Paulo")).toBe("sao-paulo");
  });

  it("handles Washington DC", () => {
    expect(toSlug("Washington DC")).toBe("washington-dc");
  });

  it("removes non-alphanumeric characters other than hyphens", () => {
    expect(toSlug("St. Louis")).toBe("st-louis");
  });

  it("collapses multiple spaces", () => {
    expect(toSlug("Hong  Kong")).toBe("hong-kong");
  });
});

describe("resolveUrl", () => {
  it("returns the URL for the first matching candidate", () => {
    const index = new Map([
      ["you-are-here-seattle", "https://example.com/seattle"],
      ["you-are-here-portland", "https://example.com/portland"],
    ]);
    expect(resolveUrl(index, ["you-are-here-seattle"])).toBe("https://example.com/seattle");
  });

  it("returns the first hit when multiple candidates are given", () => {
    const index = new Map([
      ["you-are-here-washington-d-c", "https://example.com/dc"],
    ]);
    expect(resolveUrl(index, ["you-are-here-washington-dc", "you-are-here-washington-d-c"])).toBe(
      "https://example.com/dc"
    );
  });

  it("returns empty string when no candidate matches", () => {
    const index = new Map([["something-else", "https://example.com"]]);
    expect(resolveUrl(index, ["you-are-here-nowhere"])).toBe("");
  });

  it("returns empty string for an empty index", () => {
    expect(resolveUrl(new Map(), ["you-are-here-seattle"])).toBe("");
  });
});

describe("lookupMugsUrl", () => {
  it("resolves You Are Here Seattle", () => {
    const index = new Map([
      ["you-are-here-seattle", "https://starbucks-mugs.com/mug/you-are-here-seattle/"],
    ]);
    expect(lookupMugsUrl(index, "You Are Here", "Seattle")).toBe(
      "https://starbucks-mugs.com/mug/you-are-here-seattle/"
    );
  });

  it("tries alternate washington-d-c slug for Washington DC", () => {
    const index = new Map([
      ["you-are-here-washington-d-c", "https://starbucks-mugs.com/mug/you-are-here-washington-d-c/"],
    ]);
    expect(lookupMugsUrl(index, "You Are Here", "Washington DC")).toBe(
      "https://starbucks-mugs.com/mug/you-are-here-washington-d-c/"
    );
  });

  it("returns empty string for an unknown series", () => {
    const index = new Map([["you-are-here-seattle", "https://example.com"]]);
    expect(lookupMugsUrl(index, "Unknown Series", "Seattle")).toBe("");
  });

  it("returns empty string when city is not in index", () => {
    const index = new Map([["you-are-here-portland", "https://example.com"]]);
    expect(lookupMugsUrl(index, "You Are Here", "Atlantis")).toBe("");
  });
});

describe("resolveCountry", () => {
  it("returns United Kingdom for London", () => {
    expect(resolveCountry("London")).toBe("United Kingdom");
  });

  it("strips suffix to match: Manila Red → Philippines", () => {
    expect(resolveCountry("Manila Red")).toBe("Philippines");
  });

  it("strips prefix to match: Mini Shanghai Gold → China", () => {
    expect(resolveCountry("Mini Shanghai Gold")).toBe("China");
  });

  it("defaults to United States for unknown cities", () => {
    expect(resolveCountry("Nonexistent City")).toBe("United States");
  });

  it("returns Guatemala for Antigua Guatemala (not the default)", () => {
    expect(resolveCountry("Antigua Guatemala")).toBe("Guatemala");
  });

  it("returns Canada for Vancouver", () => {
    expect(resolveCountry("Vancouver")).toBe("Canada");
  });

  it("returns Japan for Tokyo", () => {
    expect(resolveCountry("Tokyo")).toBe("Japan");
  });
});

describe("resolveCoords", () => {
  it("returns exact match for Seattle, United States", () => {
    expect(resolveCoords("Seattle", "United States")).toEqual([47.6062, -122.3321]);
  });

  it("falls back by stripping suffix: Hong Kong 2 Dragon → Hong Kong", () => {
    const [lat, lng] = resolveCoords("Hong Kong 2 Dragon", "China");
    expect(lat).toBeCloseTo(22.3193, 3);
    expect(lng).toBeCloseTo(114.1694, 3);
  });

  it("returns [0, 0] when no match is found", () => {
    expect(resolveCoords("Nonexistent City", "Nonexistent Country")).toEqual([0, 0]);
  });

  it("returns Antigua Guatemala coordinates when country is Guatemala", () => {
    const [lat, lng] = resolveCoords("Antigua Guatemala", "Guatemala");
    expect(lat).toBeCloseTo(14.5586, 3);
    expect(lng).toBeCloseTo(-90.7295, 3);
  });

  it("returns exact match for London, United Kingdom", () => {
    expect(resolveCoords("London", "United Kingdom")).toEqual([51.5074, -0.1278]);
  });
});
