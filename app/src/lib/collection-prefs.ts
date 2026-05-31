import type { Cup, CollectionPrefs } from "@/types";

// Returns true when the given series is excluded from the household's tracked collection.
export function isExcludedSeries(prefs: CollectionPrefs, series: string): boolean {
  return (prefs.excluded_series ?? []).includes(series);
}

// Returns true when the given item type is excluded from the household's tracked collection.
export function isExcludedType(prefs: CollectionPrefs, type: string): boolean {
  return (prefs.excluded_types ?? []).includes(type);
}

// Whether an unowned cup should appear in Browse, Map, Search, and Stats.
// Callers are responsible for the "owned cups always show" guard — this
// predicate only evaluates the three hide-from-unowned conditions.
export function isDisplayableCup(cup: Cup, prefs: CollectionPrefs): boolean {
  if (cup.is_duplicate) return false;
  if (isExcludedSeries(prefs, cup.series)) return false;
  if (isExcludedType(prefs, cup.item_type || "mug")) return false;
  return true;
}
