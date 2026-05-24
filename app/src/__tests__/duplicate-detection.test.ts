import { describe, it, expect } from "vitest";
import { baseName, detectDuplicateGroups } from "@/lib/duplicate-detection";
import type { Cup } from "@/types";

function cup(overrides: Partial<Cup> & Pick<Cup, "name" | "series">): Cup {
  return {
    id: overrides.name + overrides.series,
    collectionId: "cups",
    scope: "city",
    region: "",
    country: "United States",
    country_code: "US",
    item_type: "mug",
    year: 2022,
    image: "",
    image_credit: "",
    lat: 0,
    lng: 0,
    notes: "",
    hobbydb_url: "",
    more_info_url: "",
    venue_series: "",
    is_duplicate: false,
    duplicate_ok: false,
    variant_of: "",
    is_unique: false,
    sub_collection: "",
    variant_notes: "",
    slug: "",
    ...overrides,
  };
}

describe("baseName", () => {
  it("strips trailing \" 2\"", () => expect(baseName("Atlanta 2")).toBe("Atlanta"));
  it("strips trailing \" 10\"", () => expect(baseName("Disney Springs 10")).toBe("Disney Springs"));
  it("leaves plain name unchanged", () => expect(baseName("Atlanta")).toBe("Atlanta"));
});

describe("detectDuplicateGroups", () => {
  it("flags two cups with the same base name in the same series", () => {
    const cups = [
      cup({ name: "Atlanta",   series: "Been There" }),
      cup({ name: "Atlanta 2", series: "Been There" }),
      cup({ name: "London",    series: "Been There" }),
    ];
    const groups = detectDuplicateGroups(cups);
    expect(groups).toHaveLength(1);
    expect(groups[0].cups.map((c) => c.name).sort()).toEqual(["Atlanta", "Atlanta 2"]);
  });

  it("does not flag a mug and an ornament as duplicates of each other", () => {
    const cups = [
      cup({ name: "Atlanta",   series: "Been There", item_type: "mug" }),
      cup({ name: "Atlanta 2", series: "Been There", item_type: "ornament" }),
    ];
    expect(detectDuplicateGroups(cups)).toHaveLength(0);
  });

  it("does not flag cups with the same name in different series", () => {
    const cups = [
      cup({ name: "Atlanta", series: "Been There" }),
      cup({ name: "Atlanta", series: "You Are Here" }),
    ];
    expect(detectDuplicateGroups(cups)).toHaveLength(0);
  });

  it("does not flag cups with the same name in the same series but different regions", () => {
    const cups = [
      cup({ name: "Springfield", series: "Been There", region: "IL" }),
      cup({ name: "Springfield", series: "Been There", region: "MO" }),
    ];
    expect(detectDuplicateGroups(cups)).toHaveLength(0);
  });

  it("returns empty when there are no duplicates", () => {
    const cups = [
      cup({ name: "Seattle",  series: "Been There" }),
      cup({ name: "Atlanta",  series: "Been There" }),
      cup({ name: "London",   series: "Been There" }),
    ];
    expect(detectDuplicateGroups(cups)).toHaveLength(0);
  });

  it("groups three variants under one entry", () => {
    const cups = [
      cup({ name: "Disney Springs",   series: "You Are Here" }),
      cup({ name: "Disney Springs 2", series: "You Are Here" }),
      cup({ name: "Disney Springs 3", series: "You Are Here" }),
    ];
    const groups = detectDuplicateGroups(cups);
    expect(groups).toHaveLength(1);
    expect(groups[0].cups).toHaveLength(3);
  });

  it("sorts plain name before numbered variants within a group", () => {
    const cups = [
      cup({ name: "Atlanta 2", series: "Been There" }),
      cup({ name: "Atlanta",   series: "Been There" }),
    ];
    const groups = detectDuplicateGroups(cups);
    expect(groups[0].cups[0].name).toBe("Atlanta");
  });
});
