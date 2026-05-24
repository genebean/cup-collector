import { describe, it, expect } from "vitest";
import { slugify, toCupSlug, looksLikeId } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Been There")).toBe("been-there");
  });

  it("removes apostrophes entirely (no hyphen gap)", () => {
    expect(slugify("O'Hare")).toBe("ohare");
    expect(slugify("Hawai'i")).toBe("hawaii");
  });

  it("removes periods entirely", () => {
    expect(slugify("D.C.")).toBe("dc");
    expect(slugify("St. Louis")).toBe("st-louis");
    expect(slugify("Washington, D.C.")).toBe("washington-dc");
  });

  it("removes commas and other punctuation", () => {
    expect(slugify("Atlanta, Georgia")).toBe("atlanta-georgia");
  });

  it("strips diacritics", () => {
    expect(slugify("Côte d'Ivoire")).toBe("cote-divoire");
    expect(slugify("Zürich")).toBe("zurich");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("Rock & Roll")).toBe("rock-roll");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("(Atlanta)")).toBe("atlanta");
  });
});

describe("toCupSlug", () => {
  it("combines name, series, and year", () => {
    expect(toCupSlug({ name: "Seattle", series: "Been There", year: 2018 })).toBe(
      "seattle-been-there-2018"
    );
  });

  it("appends ornament suffix for ornaments", () => {
    expect(
      toCupSlug({ name: "Seattle", series: "Been There", year: 2018, item_type: "ornament" })
    ).toBe("seattle-been-there-2018-ornament");
  });

  it("no ornament suffix for mugs", () => {
    expect(
      toCupSlug({ name: "Seattle", series: "Been There", year: 2018, item_type: "mug" })
    ).toBe("seattle-been-there-2018");
  });

  it("handles punctuation in name", () => {
    expect(toCupSlug({ name: "Washington, D.C.", series: "Been There", year: 2019 })).toBe(
      "washington-dc-been-there-2019"
    );
    expect(toCupSlug({ name: "O'Hare", series: "You Are Here", year: 2022 })).toBe(
      "ohare-you-are-here-2022"
    );
  });
});

describe("looksLikeId", () => {
  it("recognises a 15-char lowercase alphanumeric string as an ID", () => {
    expect(looksLikeId("or4s8x5wcd22621")).toBe(true);
    expect(looksLikeId("aaaaabbbbbccccc")).toBe(true);
  });

  it("rejects slugs", () => {
    expect(looksLikeId("seattle-been-there-2018")).toBe(false);
    expect(looksLikeId("seattle")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(looksLikeId("or4s8x5wcd2262")).toBe(false);   // 14
    expect(looksLikeId("or4s8x5wcd226210")).toBe(false); // 16
  });

  it("rejects uppercase or hyphens", () => {
    expect(looksLikeId("Or4s8x5wcd22621")).toBe(false);
    expect(looksLikeId("or4s8x5wcd2262-")).toBe(false);
  });
});
