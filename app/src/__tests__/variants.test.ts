import { describe, it, expect } from "vitest";
import { groupByVariant } from "@/lib/variants";
import type { Cup } from "@/types";

function cup(overrides: Partial<Cup> & Pick<Cup, "id" | "name" | "series">): Cup {
  return {
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

const ATL   = cup({ id: "atl",  name: "Atlanta",   series: "Been There" });
const ATL2  = cup({ id: "atl2", name: "Atlanta 2", series: "Been There", variant_of: "atl" });
const ATL3  = cup({ id: "atl3", name: "Atlanta 3", series: "Been There", variant_of: "atl" });
const LON   = cup({ id: "lon",  name: "London",    series: "Been There" });
const SEA   = cup({ id: "sea",  name: "Seattle",   series: "You Are Here" });
const SEA2  = cup({ id: "sea2", name: "Seattle 2", series: "You Are Here", variant_of: "sea" });

describe("groupByVariant", () => {
  it("single cup produces a single-member group", () => {
    const groups = groupByVariant([ATL]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(1);
    expect(groups[0].base.id).toBe("atl");
  });

  it("base + one variant produces a two-member group with base first", () => {
    const groups = groupByVariant([ATL, ATL2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].members[0].id).toBe("atl");
    expect(groups[0].members[1].id).toBe("atl2");
  });

  it("base + two variants produces a three-member group", () => {
    const groups = groupByVariant([ATL, ATL2, ATL3]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].base.id).toBe("atl");
  });

  it("variant members are sorted alphabetically after the base", () => {
    // Insert ATL3 before ATL2 to verify sort order is by name, not insertion order
    const groups = groupByVariant([ATL, ATL3, ATL2]);
    const names = groups[0].members.map((c) => c.name);
    expect(names).toEqual(["Atlanta", "Atlanta 2", "Atlanta 3"]);
  });

  it("multiple independent groups are returned correctly", () => {
    const groups = groupByVariant([ATL, ATL2, LON, SEA, SEA2]);
    expect(groups).toHaveLength(3); // Atlanta group, London solo, Seattle group
    const atlanta = groups.find((g) => g.base.id === "atl")!;
    const seattle = groups.find((g) => g.base.id === "sea")!;
    const london  = groups.find((g) => g.base.id === "lon")!;
    expect(atlanta.members).toHaveLength(2);
    expect(seattle.members).toHaveLength(2);
    expect(london.members).toHaveLength(1);
  });

  it("is_unique cup is always its own single-member group, even with variant_of set", () => {
    const unique = cup({ id: "atl2u", name: "Atlanta 2", series: "Been There", variant_of: "atl", is_unique: true });
    const groups = groupByVariant([ATL, unique]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.base.id === "atl2u")!.members).toHaveLength(1);
    // ATL itself has no children because the only variant is marked unique
    expect(groups.find((g) => g.base.id === "atl")!.members).toHaveLength(1);
  });

  it("orphaned variant (base absent from list) becomes its own single-member group", () => {
    // ATL2 has variant_of="atl" but ATL is not in the list
    const groups = groupByVariant([ATL2, LON]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.base.id === "atl2")!.members).toHaveLength(1);
  });

  it("empty list returns empty array", () => {
    expect(groupByVariant([])).toHaveLength(0);
  });

  it("cups in the same baseName bucket but different series are never grouped", () => {
    const yahAtl  = cup({ id: "yatl",  name: "Atlanta",   series: "You Are Here" });
    const yahAtl2 = cup({ id: "yatl2", name: "Atlanta 2", series: "You Are Here", variant_of: "yatl" });
    // ATL (Been There) and yahAtl (You Are Here) are separate bases
    const groups = groupByVariant([ATL, ATL2, yahAtl, yahAtl2]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.base.id === "atl")!.members.map((c) => c.id)).toEqual(["atl", "atl2"]);
    expect(groups.find((g) => g.base.id === "yatl")!.members.map((c) => c.id)).toEqual(["yatl", "yatl2"]);
  });
});
