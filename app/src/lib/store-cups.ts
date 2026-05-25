import { haversineMi, parseAddressComponents } from "@/lib/geo";
import { groupByVariant } from "@/lib/variants";
import type { CupWithOwnership, NearbyStore } from "@/types";

// City cups whose centroid is within this radius are considered "available" at a store.
// 50 miles covers suburban/exurban stores — e.g. Villa Rica GA is ~35 miles from
// the Atlanta cup centroid, just past a 30-mile cutoff.
export const STORE_CUP_RADIUS_MI = 50;

export interface StoreCupGroups {
  neededCity: CupWithOwnership[];
  neededState: CupWithOwnership[];
  neededCountry: CupWithOwnership[];
  ownedCity: CupWithOwnership[];
  ownedState: CupWithOwnership[];
  ownedCountry: CupWithOwnership[];
}

export function getCupsForStore(store: NearbyStore, cups: CupWithOwnership[]): StoreCupGroups {
  const byYearDesc = (a: CupWithOwnership, b: CupWithOwnership) => b.year - a.year;
  const isNeeded = (c: CupWithOwnership) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false);

  const nearbyCityCups = cups.filter(
    (c) =>
      (c.scope === "city" || !c.scope) &&
      haversineMi({ lat: store.lat, lng: store.lng }, { lat: c.lat, lng: c.lng }) <= STORE_CUP_RADIUS_MI
  );

  const { region, countryCode } = parseAddressComponents(store.address);
  const stateCups = region
    ? cups.filter((c) => c.scope === "state" && c.region === region && c.country_code === countryCode)
    : [];
  const countryCups = countryCode
    ? cups.filter((c) => c.scope === "country" && c.country_code === countryCode)
    : [];

  return {
    neededCity:    nearbyCityCups.filter(isNeeded).sort(byYearDesc),
    neededState:   stateCups.filter(isNeeded).sort(byYearDesc),
    neededCountry: countryCups.filter(isNeeded).sort(byYearDesc),
    ownedCity:     nearbyCityCups.filter((c) => !isNeeded(c)).sort(byYearDesc),
    ownedState:    stateCups.filter((c) => !isNeeded(c)).sort(byYearDesc),
    ownedCountry:  countryCups.filter((c) => !isNeeded(c)).sort(byYearDesc),
  };
}

export function groupedStoreCups(store: NearbyStore, cups: CupWithOwnership[]) {
  const { neededCity, neededState, neededCountry, ownedCity, ownedState, ownedCountry } =
    getCupsForStore(store, cups);

  const byYearDesc = (a: CupWithOwnership, b: CupWithOwnership) => b.year - a.year;
  const allCityGroups = groupByVariant([...neededCity, ...ownedCity]);

  const locationBuckets = new Map<string, {
    locationName: string;
    neededGroups: ReturnType<typeof groupByVariant<CupWithOwnership>>;
    ownedGroups:  ReturnType<typeof groupByVariant<CupWithOwnership>>;
  }>();

  for (const group of allCityGroups) {
    const anchor = [...group.members].sort(byYearDesc)[0];
    const key = `${anchor.lat},${anchor.lng}`;
    if (!locationBuckets.has(key)) {
      locationBuckets.set(key, { locationName: anchor.name, neededGroups: [], ownedGroups: [] });
    }
    const bucket = locationBuckets.get(key)!;
    if (group.members.every((c) => !c.isOwned)) bucket.neededGroups.push(group);
    if (group.members.some((c) => c.isOwned))   bucket.ownedGroups.push(group);
  }

  return {
    cityLocations: Array.from(locationBuckets.values()),
    neededStateGroups:   groupByVariant(neededState),
    neededCountryGroups: groupByVariant(neededCountry),
    ownedStateGroups:    groupByVariant(ownedState),
    ownedCountryGroups:  groupByVariant(ownedCountry),
  };
}
