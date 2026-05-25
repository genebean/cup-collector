import { describe, it, expect } from "vitest";
import { getCupsForStore, groupedStoreCups, STORE_CUP_RADIUS_MI } from "@/lib/store-cups";
import type { CupWithOwnership, NearbyStore } from "@/types";

// Atlanta centroid — used as the reference point for proximity tests.
const ATL_LAT = 33.749;
const ATL_LNG = -84.388;

// A store inside the 50-mile radius (downtown Atlanta).
const STORE_ATL: NearbyStore = {
  name: "Starbucks - Peachtree St",
  address: "123 Peachtree St NE, Atlanta, GA 30303",
  lat: ATL_LAT,
  lng: ATL_LNG,
  place_id: "place_atl",
};

// A store in a different state entirely (Nashville, TN).
const STORE_NASHVILLE: NearbyStore = {
  name: "Starbucks - Broadway",
  address: "500 Broadway, Nashville, TN 37203",
  lat: 36.1627,
  lng: -86.7816,
  place_id: "place_nash",
};

// A store in a non-US country (Canada, no state parsing).
const STORE_TORONTO: NearbyStore = {
  name: "Starbucks - King St",
  address: "200 King St W, Toronto, Canada",
  lat: 43.6455,
  lng: -79.3834,
  place_id: "place_tor",
};

function makeCup(overrides: Partial<CupWithOwnership> & Pick<CupWithOwnership, "id" | "name" | "series">): CupWithOwnership {
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
    lat: ATL_LAT,
    lng: ATL_LNG,
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
    isOwned: false,
    ...overrides,
  };
}

// A city cup at the Atlanta centroid — within 50 miles of STORE_ATL.
const ATL_CUP = makeCup({ id: "atl", name: "Atlanta", series: "Been There" });

// A city cup in Nashville — well outside 50 miles of STORE_ATL.
const NASH_CUP = makeCup({ id: "nash", name: "Nashville", series: "Been There", lat: 36.1627, lng: -86.7816 });

// A state-scope cup for Georgia.
const GA_CUP = makeCup({ id: "ga", name: "Georgia", series: "Been There", scope: "state", region: "Georgia", country_code: "US", lat: 32.5, lng: -83.5 });

// A state-scope cup for Tennessee.
const TN_CUP = makeCup({ id: "tn", name: "Tennessee", series: "Been There", scope: "state", region: "Tennessee", country_code: "US", lat: 35.5, lng: -86.5 });

// A country-scope cup for the US.
const US_CUP = makeCup({ id: "us", name: "United States", series: "Been There", scope: "country", country_code: "US", lat: 38.0, lng: -97.0 });

// A country-scope cup for Canada.
const CA_CUP = makeCup({ id: "ca", name: "Canada", series: "Been There", scope: "country", country: "Canada", country_code: "CA", lat: 56.0, lng: -96.0 });

const ALL_CUPS = [ATL_CUP, NASH_CUP, GA_CUP, TN_CUP, US_CUP, CA_CUP];

// ─── getCupsForStore ───────────────────────────────────────────────────────────

describe("getCupsForStore — city proximity", () => {
  it("includes a city cup whose centroid is within 50 miles", () => {
    const { neededCity } = getCupsForStore(STORE_ATL, [ATL_CUP]);
    expect(neededCity.map((c) => c.id)).toContain("atl");
  });

  it("excludes a city cup whose centroid is outside 50 miles", () => {
    const { neededCity } = getCupsForStore(STORE_ATL, [NASH_CUP]);
    expect(neededCity).toHaveLength(0);
  });

  it("STORE_CUP_RADIUS_MI is 50", () => {
    expect(STORE_CUP_RADIUS_MI).toBe(50);
  });

  it("cup with no scope (blank) is treated as city scope", () => {
    const noScope = makeCup({ id: "blank_scope", name: "Atlanta Alt", series: "Been There", scope: undefined as unknown as "city" });
    const { neededCity } = getCupsForStore(STORE_ATL, [noScope]);
    expect(neededCity.map((c) => c.id)).toContain("blank_scope");
  });
});

describe("getCupsForStore — state matching", () => {
  it("includes the Georgia state cup for a store with a GA address", () => {
    const { neededState } = getCupsForStore(STORE_ATL, [GA_CUP, TN_CUP]);
    expect(neededState.map((c) => c.id)).toEqual(["ga"]);
  });

  it("includes the Tennessee state cup for a store with a TN address", () => {
    const { neededState } = getCupsForStore(STORE_NASHVILLE, [GA_CUP, TN_CUP]);
    expect(neededState.map((c) => c.id)).toEqual(["tn"]);
  });

  it("returns no state cups for a non-US address", () => {
    const { neededState } = getCupsForStore(STORE_TORONTO, [GA_CUP, TN_CUP]);
    expect(neededState).toHaveLength(0);
  });
});

describe("getCupsForStore — country matching", () => {
  it("includes the US country cup for a store in the US", () => {
    const { neededCountry } = getCupsForStore(STORE_ATL, [US_CUP, CA_CUP]);
    expect(neededCountry.map((c) => c.id)).toEqual(["us"]);
  });

  it("includes the Canada country cup for a store in Canada", () => {
    const { neededCountry } = getCupsForStore(STORE_TORONTO, [US_CUP, CA_CUP]);
    expect(neededCountry.map((c) => c.id)).toEqual(["ca"]);
  });
});

describe("getCupsForStore — owned vs needed split", () => {
  it("an unowned cup appears in neededCity, not ownedCity", () => {
    const { neededCity, ownedCity } = getCupsForStore(STORE_ATL, [ATL_CUP]);
    expect(neededCity.map((c) => c.id)).toContain("atl");
    expect(ownedCity).toHaveLength(0);
  });

  it("an owned cup appears in ownedCity, not neededCity", () => {
    const owned = { ...ATL_CUP, isOwned: true };
    const { neededCity, ownedCity } = getCupsForStore(STORE_ATL, [owned]);
    expect(neededCity).toHaveLength(0);
    expect(ownedCity.map((c) => c.id)).toContain("atl");
  });

  it("an owned-but-needs-replacing cup is treated as needed", () => {
    const replacing = {
      ...ATL_CUP,
      isOwned: true,
      ownedRecord: {
        id: "o1",
        collectionId: "owned_cups",
        household_id: "hh1",
        cup_id: "atl",
        marked_by_sub: "sub",
        acquired_date: "",
        own_photo: "",
        needs_replacing: true,
        replacement_note: "cracked lid",
        acquired_store_name: "",
        acquired_store_address: "",
        acquired_store_lat: 0,
        acquired_store_lng: 0,
        created: "",
      },
    };
    const { neededCity, ownedCity } = getCupsForStore(STORE_ATL, [replacing]);
    expect(neededCity.map((c) => c.id)).toContain("atl");
    expect(ownedCity).toHaveLength(0);
  });
});

describe("getCupsForStore — sort order", () => {
  it("results are sorted newest year first within each bucket", () => {
    const cup2020 = makeCup({ id: "atl2020", name: "Atlanta", series: "You Are Here", year: 2020 });
    const cup2023 = makeCup({ id: "atl2023", name: "Atlanta", series: "You Are Here", year: 2023 });
    const cup2018 = makeCup({ id: "atl2018", name: "Atlanta", series: "You Are Here", year: 2018 });
    const { neededCity } = getCupsForStore(STORE_ATL, [cup2020, cup2023, cup2018]);
    expect(neededCity.map((c) => c.year)).toEqual([2023, 2020, 2018]);
  });
});

describe("getCupsForStore — full mix", () => {
  it("correctly partitions all cup types for STORE_ATL", () => {
    const result = getCupsForStore(STORE_ATL, ALL_CUPS);
    expect(result.neededCity.map((c) => c.id)).toEqual(["atl"]);
    expect(result.neededState.map((c) => c.id)).toEqual(["ga"]);
    expect(result.neededCountry.map((c) => c.id)).toEqual(["us"]);
    expect(result.ownedCity).toHaveLength(0);
    expect(result.ownedState).toHaveLength(0);
    expect(result.ownedCountry).toHaveLength(0);
  });

  it("empty cup list returns all empty buckets", () => {
    const result = getCupsForStore(STORE_ATL, []);
    expect(result.neededCity).toHaveLength(0);
    expect(result.neededState).toHaveLength(0);
    expect(result.neededCountry).toHaveLength(0);
    expect(result.ownedCity).toHaveLength(0);
    expect(result.ownedState).toHaveLength(0);
    expect(result.ownedCountry).toHaveLength(0);
  });
});

// ─── groupedStoreCups ─────────────────────────────────────────────────────────

describe("groupedStoreCups — structure", () => {
  it("returns cityLocations, neededStateGroups, neededCountryGroups, ownedStateGroups, ownedCountryGroups", () => {
    const result = groupedStoreCups(STORE_ATL, ALL_CUPS);
    expect(result).toHaveProperty("cityLocations");
    expect(result).toHaveProperty("neededStateGroups");
    expect(result).toHaveProperty("neededCountryGroups");
    expect(result).toHaveProperty("ownedStateGroups");
    expect(result).toHaveProperty("ownedCountryGroups");
  });

  it("Atlanta cup appears in cityLocations under ATL_LAT,ATL_LNG bucket", () => {
    const { cityLocations } = groupedStoreCups(STORE_ATL, [ATL_CUP]);
    expect(cityLocations).toHaveLength(1);
    expect(cityLocations[0].locationName).toBe("Atlanta");
    expect(cityLocations[0].neededGroups).toHaveLength(1);
    expect(cityLocations[0].ownedGroups).toHaveLength(0);
  });

  it("Georgia state cup appears in neededStateGroups", () => {
    const { neededStateGroups } = groupedStoreCups(STORE_ATL, [GA_CUP]);
    expect(neededStateGroups).toHaveLength(1);
    expect(neededStateGroups[0].base.id).toBe("ga");
  });

  it("US country cup appears in neededCountryGroups", () => {
    const { neededCountryGroups } = groupedStoreCups(STORE_ATL, [US_CUP]);
    expect(neededCountryGroups).toHaveLength(1);
    expect(neededCountryGroups[0].base.id).toBe("us");
  });

  it("owned city cup moves to ownedGroups within its location bucket", () => {
    const owned = { ...ATL_CUP, isOwned: true };
    const { cityLocations } = groupedStoreCups(STORE_ATL, [owned]);
    expect(cityLocations).toHaveLength(1);
    expect(cityLocations[0].neededGroups).toHaveLength(0);
    expect(cityLocations[0].ownedGroups).toHaveLength(1);
  });

  it("two cups at same lat/lng are merged into one location bucket", () => {
    const atl2 = makeCup({ id: "atl2", name: "Atlanta", series: "You Are Here", year: 2021 });
    const { cityLocations } = groupedStoreCups(STORE_ATL, [ATL_CUP, atl2]);
    expect(cityLocations).toHaveLength(1);
    expect(cityLocations[0].neededGroups).toHaveLength(2);
  });

  it("cups at different lat/lng produce separate location buckets", () => {
    const nearby = makeCup({ id: "marietta", name: "Marietta", series: "Been There", lat: 33.9526, lng: -84.5499 });
    const { cityLocations } = groupedStoreCups(STORE_ATL, [ATL_CUP, nearby]);
    expect(cityLocations).toHaveLength(2);
  });

  it("empty cup list returns empty arrays for all fields", () => {
    const result = groupedStoreCups(STORE_ATL, []);
    expect(result.cityLocations).toHaveLength(0);
    expect(result.neededStateGroups).toHaveLength(0);
    expect(result.neededCountryGroups).toHaveLength(0);
    expect(result.ownedStateGroups).toHaveLength(0);
    expect(result.ownedCountryGroups).toHaveLength(0);
  });
});
