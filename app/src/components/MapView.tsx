"use client";

// MapView must be imported with `dynamic(() => ..., { ssr: false })` because
// Leaflet directly accesses the browser DOM and will crash during server-side
// rendering. See app/src/app/map/page.tsx for the dynamic import.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import type { CupWithOwnership, NearbyStore } from "@/types";
import { useRouter } from "next/navigation";
import { useUiTheme } from "@/hooks/useUiTheme";
import { MapBottomSheet } from "@/components/MapBottomSheet";
import { haversineMi, parseAddressComponents } from "@/lib/geo";
import { groupByVariant } from "@/lib/variants";

const MAP_POSITION_KEY = "map_position";

const TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

interface MapViewProps {
  cups: CupWithOwnership[];
  stores: NearbyStore[];
  userLocation: { lat: number; lng: number } | null;
  targetZoom: number;
  worldViewTick?: number;
}

// Saves map center+zoom to sessionStorage on every pan/zoom so position
// is restored when the user navigates away and back.
function MapPositionSaver() {
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      const z = e.target.getZoom();
      sessionStorage.setItem(MAP_POSITION_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: z }));
    },
  });
  return null;
}

// Flies to user location on first load — skipped when a saved position exists
// (i.e. the user navigated away and came back).
function LocationUpdater({ location, zoom }: { location: { lat: number; lng: number } | null; zoom: number }) {
  const map = useMap();
  const hasFlownTo = useRef(false);

  useEffect(() => {
    if (location && !hasFlownTo.current) {
      hasFlownTo.current = true;
      if (!sessionStorage.getItem(MAP_POSITION_KEY)) {
        map.flyTo([location.lat, location.lng], zoom, { duration: 1.5 });
      }
    }
  }, [location, zoom, map]);

  return null;
}

// Flies to the world overview when the globe button is pressed
function WorldViewResetter({ tick }: { tick: number }) {
  const map = useMap();
  useEffect(() => {
    if (tick > 0) {
      map.flyTo([20, 0], 2, { duration: 1.5 });
    }
  }, [tick, map]);
  return null;
}

// Listens to Leaflet map events and reports which cups fall within the current viewport
function BoundsTracker({
  cups,
  onVisibleCupsChange,
}: {
  cups: CupWithOwnership[];
  onVisibleCupsChange: (cups: CupWithOwnership[]) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const bounds = map.getBounds();
      onVisibleCupsChange(cups.filter((c) => bounds.contains([c.lat, c.lng])));
    },
  });

  // Re-filter whenever the cups data changes (initial load, real-time updates)
  useEffect(() => {
    const bounds = map.getBounds();
    onVisibleCupsChange(cups.filter((c) => bounds.contains([c.lat, c.lng])));
  }, [cups, map, onVisibleCupsChange]);

  return null;
}

// Adjusts zoom when the radius chip changes (only when a location is active)
function ZoomUpdater({ location, zoom }: { location: { lat: number; lng: number } | null; zoom: number }) {
  const map = useMap();
  const prevZoom = useRef<number | null>(null);

  useEffect(() => {
    if (!location) return;
    if (prevZoom.current === null) {
      prevZoom.current = zoom;
      return;
    }
    if (zoom !== prevZoom.current) {
      prevZoom.current = zoom;
      map.flyTo([location.lat, location.lng], zoom, { duration: 1 });
    }
  }, [zoom, location, map]);

  return null;
}

// City cups whose centroid is within this radius are considered "available" at a store.
// 50 miles covers suburban/exurban stores — e.g. Villa Rica GA is ~35 miles from
// the Atlanta cup centroid, just past a 30-mile cutoff.
const STORE_CUP_RADIUS_MI = 50;

interface StoreCupGroups {
  neededCity: CupWithOwnership[];
  neededState: CupWithOwnership[];
  neededCountry: CupWithOwnership[];
  ownedCity: CupWithOwnership[];
  ownedState: CupWithOwnership[];
  ownedCountry: CupWithOwnership[];
}

function getCupsForStore(store: NearbyStore, cups: CupWithOwnership[]): StoreCupGroups {
  const byYearDesc = (a: CupWithOwnership, b: CupWithOwnership) => b.year - a.year;
  const isNeeded = (c: CupWithOwnership) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false);

  // City cups: proximity-based — any city cup whose centroid is within range.
  const nearbyCityCups = cups.filter(
    (c) =>
      (c.scope === "city" || !c.scope) &&
      haversineMi({ lat: store.lat, lng: store.lng }, { lat: c.lat, lng: c.lng }) <= STORE_CUP_RADIUS_MI
  );

  // State & country cups: address-based — every store in a state/country shows its cups.
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

// Groups all cups into pins for city-scope cups.
// State and country cups have no pin of their own — they appear in the popup
// of every city pin whose region/country_code matches.
interface LocationGroup {
  lat: number;
  lng: number;
  cityCups: CupWithOwnership[];
  stateCups: CupWithOwnership[];
  countryCups: CupWithOwnership[];
  themedCups: CupWithOwnership[];
}

function buildLocationGroups(cups: CupWithOwnership[]): LocationGroup[] {
  const cityCups   = cups.filter((c) => c.scope === "city" || !c.scope);
  const stateCups  = cups.filter((c) => c.scope === "state");
  const countryCups = cups.filter((c) => c.scope === "country");
  // Themed cups have no pin of their own — they surface inside city pin popups
  // for every location where a cup's series matches the themed cup's venue_series.
  const themedCups = cups.filter((c) => c.scope === "themed");

  // Cluster city cups by lat/lng (using string key for exact match)
  const grouped = new Map<string, CupWithOwnership[]>();
  for (const cup of cityCups) {
    const key = `${cup.lat},${cup.lng}`;
    const group = grouped.get(key) ?? [];
    group.push(cup);
    grouped.set(key, group);
  }

  const byYearDesc = (a: CupWithOwnership, b: CupWithOwnership) => b.year - a.year;

  return Array.from(grouped.values()).map((cityGroup) => {
    const { lat, lng, region, country_code } = cityGroup[0];
    const seriesInGroup = new Set(cityGroup.map((c) => c.series));

    const matchingState = stateCups.filter(
      (s) => s.region === region && s.country_code === country_code
    );
    const matchingCountry = countryCups.filter(
      (c) => c.country_code === country_code
    );
    const matchingThemed = themedCups.filter(
      (t) => t.venue_series && seriesInGroup.has(t.venue_series)
    );

    return {
      lat, lng,
      cityCups:    [...cityGroup].sort(byYearDesc),
      stateCups:   matchingState.sort(byYearDesc),
      countryCups: matchingCountry.sort(byYearDesc),
      themedCups:  matchingThemed.sort(byYearDesc),
    };
  });
}

export default function MapView({ cups, stores, userLocation, targetZoom, worldViewTick = 0 }: MapViewProps) {
  const router = useRouter();
  const { isDark } = useUiTheme();
  const tiles = isDark ? TILES.dark : TILES.light;
  const [visibleCups, setVisibleCups] = useState<CupWithOwnership[]>([]);
  const visibleCupIdsRef = useRef<Set<string>>(new Set());
  const handleVisibleCupsChange = useCallback((c: CupWithOwnership[]) => {
    const newIds = new Set(c.map((cup) => cup.id));
    const prev = visibleCupIdsRef.current;
    if (newIds.size === prev.size && [...newIds].every((id) => prev.has(id))) return;
    visibleCupIdsRef.current = newIds;
    setVisibleCups(c);
  }, []);

  // Restore saved map position (set when user previously panned/zoomed); fall back to world view.
  const savedPos = (() => {
    try { return JSON.parse(sessionStorage.getItem(MAP_POSITION_KEY) ?? "null"); } catch { return null; }
  })();
  const defaultCenter: [number, number] = savedPos ? [savedPos.lat, savedPos.lng] : [20, 0];
  const defaultZoom: number = savedPos ? savedPos.zoom : 2;

  const locationGroups = buildLocationGroups(cups);
  // Memoized so BoundsTracker's useEffect dependency doesn't fire on every render
  const boundsTrackerCups = useMemo(() => cups.filter((c) => c.scope !== "themed"), [cups]);

  return (
    <div className="relative w-full h-full">
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      className="w-full h-full"
      attributionControl={true}
    >
      {/* key forces a remount when switching so stale tiles don't linger */}
      <TileLayer key={isDark ? "dark" : "light"} attribution={tiles.attribution} url={tiles.url} />

      <MapPositionSaver />
      <LocationUpdater location={userLocation} zoom={targetZoom} />
      <ZoomUpdater location={userLocation} zoom={targetZoom} />
      <WorldViewResetter tick={worldViewTick} />
      {/* Exclude themed cups — their lat/lng is a placeholder, not a real location */}
      <BoundsTracker cups={boundsTrackerCups} onVisibleCupsChange={handleVisibleCupsChange} />

      {/* "You are here" — white dot with blue ring */}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={9}
          pathOptions={{
            color: "#1d4ed8",
            fillColor: "white",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>You are here</Popup>
        </CircleMarker>
      )}

      {/* Cup pins — one per city-scope location.
          Green  = everything at this location is owned and in good condition.
          Orange = anything unowned OR owned but needs replacing. */}
      {locationGroups.map((group) => {
        const allCups = [...group.cityCups, ...group.stateCups, ...group.countryCups];
        const needsAction = allCups.some(
          (c) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false)
        );
        const isGreen = !needsAction;

        // Header for the first city cup's location name
        const locationName = group.cityCups[0].name;

        return (
          <CircleMarker
            key={`${group.lat},${group.lng}`}
            center={[group.lat, group.lng]}
            radius={12}
            pathOptions={{
              color: isGreen ? "#00704A" : "#f97316",
              fillColor: isGreen ? "#00704A" : "#f97316",
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Popup>
              {(() => {
                const isNeeded = (c: CupWithOwnership) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false);

                // Collapse city cups into variant groups.
                // "Already owned" wins if ANY member is owned — owning one version covers the group.
                const cityGroups = groupByVariant(group.cityCups);
                const neededCityGroups = cityGroups.filter(({ members }) => members.every((c) => !c.isOwned));
                const ownedCityGroups  = cityGroups.filter(({ members }) => members.some((c) => c.isOwned));

                const neededState   = group.stateCups.filter(isNeeded);
                const neededCountry = group.countryCups.filter(isNeeded);
                const neededThemed  = group.themedCups.filter(isNeeded);
                const ownedState    = group.stateCups.filter((c) => !isNeeded(c));
                const ownedCountry  = group.countryCups.filter((c) => !isNeeded(c));
                const ownedThemed   = group.themedCups.filter((c) => !isNeeded(c));

                const cityGroupRow = ({ base, members }: { base: CupWithOwnership; members: CupWithOwnership[] }) => {
                  const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                  const anyNeedsReplacing = members.some((c) => c.ownedRecord?.needs_replacing);
                  return (
                    <div key={base.id} className="mb-1">
                      <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                        {base.name}{versionSuffix}
                      </button>
                      <div className="text-gray-500">
                        {base.series} · {base.year}
                        {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                      </div>
                      <div className="text-map-orange">
                        {anyNeedsReplacing ? "⚠ Needs replacing" : "Needed"}
                      </div>
                    </div>
                  );
                };

                const neededRow = (cup: CupWithOwnership) => (
                  <div key={cup.id} className="mb-1">
                    <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                      {cup.name}
                    </button>
                    <div className="text-gray-500">
                      {cup.series} · {cup.year}
                      {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                    </div>
                    <div className="text-map-orange">
                      {cup.ownedRecord?.needs_replacing ? "⚠ Needs replacing" : "Needed"}
                    </div>
                  </div>
                );

                const hasNeeded = neededCityGroups.length > 0 || neededState.length > 0 || neededCountry.length > 0 || neededThemed.length > 0;
                const hasOwned  = ownedCityGroups.length > 0 || ownedState.length > 0 || ownedCountry.length > 0 || ownedThemed.length > 0;

                return (
                  <div className="text-sm min-w-[160px] max-h-[60vh] overflow-y-auto pr-1">
                    <div className="font-semibold">📍 {locationName}</div>

                    {hasNeeded && (
                      <div className="border-t border-gray-200 mt-2 pt-2">
                        {neededCityGroups.map((g) => cityGroupRow(g))}

                        {neededState.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededState[0].name} <span className="font-normal text-gray-400 text-xs">(state)</span>
                            </div>
                            {neededState.map((cup) => neededRow(cup))}
                          </>
                        )}

                        {neededCountry.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededCountry[0].name} <span className="font-normal text-gray-400 text-xs">(country)</span>
                            </div>
                            {neededCountry.map((cup) => neededRow(cup))}
                          </>
                        )}

                        {neededThemed.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1 text-green-dark">Special Edition</div>
                            {neededThemed.map((cup) => neededRow(cup))}
                          </>
                        )}
                      </div>
                    )}

                    {hasOwned && (
                      <>
                        <div className="text-xs font-semibold text-green-starbucks mt-2 mb-1 border-t border-gray-200 pt-2">
                          Already owned
                        </div>
                        {ownedCityGroups.map(({ base, members }) => {
                          const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                          return (
                            <div key={base.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="underline cursor-pointer">
                                {base.name}{versionSuffix}
                              </button>
                              {" "}· {base.series} · {base.year}
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                            </div>
                          );
                        })}
                        {[...ownedState, ...ownedCountry, ...ownedThemed].map((cup) => {
                          const scopeSuffix = cup.scope === "state" || cup.scope === "country"
                            ? ` (${cup.scope})` : "";
                          return (
                            <div key={cup.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="underline cursor-pointer">
                                {cup.name}{scopeSuffix}
                              </button>
                              {" "}· {cup.series} · {cup.year}
                              {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })()}
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Nearby Starbucks pins — blue — tap shows popup with directions link and relevant cups */}
      {stores.map((store) => {
        const { neededCity, neededState, neededCountry, ownedCity, ownedState, ownedCountry } =
          getCupsForStore(store, cups);
        // Group city cups by lat/lng so each city location gets its own sub-header.
        // Variant grouping runs across the full set (needed + owned) per location so
        // a base in one bucket and its variant in the other still collapse correctly.
        // "Already owned" wins if ANY member is owned.
        const cityByLatLng = new Map<string, CupWithOwnership[]>();
        for (const cup of [...neededCity, ...ownedCity]) {
          const key = `${cup.lat},${cup.lng}`;
          cityByLatLng.set(key, [...(cityByLatLng.get(key) ?? []), cup]);
        }
        const cityLocations = Array.from(cityByLatLng.values()).map((locationCups) => {
          const byYearDesc = (a: CupWithOwnership, b: CupWithOwnership) => b.year - a.year;
          const locationName = [...locationCups].sort(byYearDesc)[0].name;
          const groups = groupByVariant(locationCups);
          return {
            locationName,
            neededGroups: groups.filter(({ members }) => members.every((c) => !c.isOwned)),
            ownedGroups:  groups.filter(({ members }) => members.some((c) => c.isOwned)),
          };
        });
        const hasNeeded = cityLocations.some((l) => l.neededGroups.length > 0) || neededState.length > 0 || neededCountry.length > 0;
        const hasOwned  = cityLocations.some((l) => l.ownedGroups.length > 0)  || ownedState.length > 0  || ownedCountry.length > 0;
        const hasCups = hasNeeded || hasOwned;

        return (
          <CircleMarker
            key={store.place_id}
            center={[store.lat, store.lng]}
            radius={10}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#3b82f6",
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm min-w-[180px] max-h-[60vh] overflow-y-auto pr-1">
                <div className="font-semibold">☕ {store.name}</div>
                <div className="text-gray-500 text-xs">{store.address}</div>
                <a
                  href={`https://maps.apple.com/?daddr=${store.lat},${store.lng}&dirflg=d`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 text-xs underline"
                >
                  Get directions →
                </a>

                {hasCups && (
                  <div className="border-t border-gray-200 mt-2 pt-2">
                    {hasNeeded && (
                      <>
                        {cityLocations.map(({ locationName, neededGroups }) => neededGroups.length === 0 ? null : (
                          <div key={locationName}>
                            <div className="font-semibold mt-1 mb-1">{locationName}</div>
                            {neededGroups.map(({ base, members }) => {
                              const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                              const anyNeedsReplacing = members.some((c) => c.ownedRecord?.needs_replacing);
                              return (
                                <div key={base.id} className="mb-1.5">
                                  <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                                    {base.name}{versionSuffix}
                                  </button>
                                  <div className="text-gray-500 text-xs">
                                    {base.series} · {base.year}
                                    {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                                  </div>
                                  <div className="text-map-orange text-xs">{anyNeedsReplacing ? "⚠ Needs replacing" : "Needed"}</div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {neededState.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededState[0].name} <span className="font-normal text-gray-400 text-xs">(state)</span>
                            </div>
                            {neededState.map((cup) => (
                              <div key={cup.id} className="mb-1.5">
                                <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                                  {cup.name}
                                </button>
                                <div className="text-gray-500 text-xs">
                                  {cup.series} · {cup.year}
                                  {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                                </div>
                                <div className="text-map-orange text-xs">{cup.ownedRecord?.needs_replacing ? "⚠ Needs replacing" : "Needed"}</div>
                              </div>
                            ))}
                          </>
                        )}
                        {neededCountry.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededCountry[0].name} <span className="font-normal text-gray-400 text-xs">(country)</span>
                            </div>
                            {neededCountry.map((cup) => (
                              <div key={cup.id} className="mb-1.5">
                                <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                                  {cup.name}
                                </button>
                                <div className="text-gray-500 text-xs">
                                  {cup.series} · {cup.year}
                                  {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                                </div>
                                <div className="text-map-orange text-xs">{cup.ownedRecord?.needs_replacing ? "⚠ Needs replacing" : "Needed"}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}

                    {hasOwned && (
                      <>
                        <div className={`text-xs font-semibold text-green-starbucks mb-1 ${hasNeeded ? "mt-2" : ""}`}>
                          Already owned
                        </div>
                        {cityLocations.flatMap(({ ownedGroups }) => ownedGroups).map(({ base, members }) => {
                          const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                          return (
                            <div key={base.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="underline cursor-pointer">
                                {base.name}{versionSuffix}
                              </button>
                              {" "}· {base.series} · {base.year}
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                            </div>
                          );
                        })}
                        {[...ownedState, ...ownedCountry].map((cup) => {
                          const scopeLabel = ` (${cup.scope})`;
                          return (
                            <div key={cup.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="underline cursor-pointer">
                                {cup.name}{scopeLabel}
                              </button>
                              {" "}· {cup.series} · {cup.year}
                              {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark">ornament</span>}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
    <MapBottomSheet cups={visibleCups} />
    </div>
  );
}
