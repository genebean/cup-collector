import { describe, it, expect } from "vitest";
import { buildSeriesOptions } from "@/lib/browse";

describe("buildSeriesOptions", () => {
  it("returns a single entry for a series with mugs only", () => {
    const cups = [
      { series: "You Are Here", item_type: "mug" },
      { series: "You Are Here", item_type: "mug" },
    ];
    expect(buildSeriesOptions(cups)).toEqual([
      { value: "You Are Here", label: "You Are Here" },
    ]);
  });

  it("treats empty/null item_type as mug", () => {
    const cups = [
      { series: "You Are Here", item_type: "" },
      { series: "You Are Here", item_type: null },
      { series: "You Are Here", item_type: undefined },
    ];
    expect(buildSeriesOptions(cups)).toEqual([
      { value: "You Are Here", label: "You Are Here" },
    ]);
  });

  it("returns a single ornament entry for a series with ornaments only", () => {
    const cups = [{ series: "You Are Here", item_type: "ornament" }];
    expect(buildSeriesOptions(cups)).toEqual([
      { value: "You Are Here|ornament", label: "You Are Here Ornaments" },
    ]);
  });

  it("splits into two entries when a series has both mugs and ornaments", () => {
    const cups = [
      { series: "Been There", item_type: "mug" },
      { series: "Been There", item_type: "ornament" },
    ];
    expect(buildSeriesOptions(cups)).toEqual([
      { value: "Been There|mug",      label: "Been There" },
      { value: "Been There|ornament", label: "Been There Ornaments" },
    ]);
  });

  it("sorts series alphabetically", () => {
    const cups = [
      { series: "You Are Here", item_type: "mug" },
      { series: "Been There",   item_type: "mug" },
      { series: "Discovery Series", item_type: "mug" },
    ];
    const values = buildSeriesOptions(cups).map((o) => o.value);
    expect(values).toEqual(["Been There", "Discovery Series", "You Are Here"]);
  });

  it("handles a mix: some series split, some not", () => {
    const cups = [
      { series: "Been There",   item_type: "mug" },
      { series: "Been There",   item_type: "ornament" },
      { series: "You Are Here", item_type: "mug" },
    ];
    expect(buildSeriesOptions(cups)).toEqual([
      { value: "Been There|mug",      label: "Been There" },
      { value: "Been There|ornament", label: "Been There Ornaments" },
      { value: "You Are Here",        label: "You Are Here" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(buildSeriesOptions([])).toEqual([]);
  });
});
