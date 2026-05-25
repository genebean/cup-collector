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
import { groupByVariant } from "@/lib/variants";
import { getCupsForStore } from "@/lib/store-cups";

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
  flyTick?: number;
  onZoomChange?: (zoom: number) => void;
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

// Reports zoom level to the parent on mount and after each zoom animation completes.
function ZoomTracker({ onZoomChange }: { onZoomChange?: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() { onZoomChange?.(map.getZoom()); },
  });
  useEffect(() => { onZoomChange?.(map.getZoom()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
// flyTick increments on every chip click so the fly always triggers, even
// when targetZoom didn't change (e.g. clicking the already-selected chip).
function ZoomUpdater({ location, zoom, flyTick }: { location: { lat: number; lng: number } | null; zoom: number; flyTick: number }) {
  const map = useMap();
  const prevTick = useRef(0);

  useEffect(() => {
    if (!location || flyTick === 0) return;
    if (flyTick !== prevTick.current) {
      prevTick.current = flyTick;
      map.flyTo([location.lat, location.lng], zoom, { duration: 1 });
    }
  }, [flyTick, zoom, location, map]);

  return null;
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

    const matchingState = region
      ? stateCups.filter((s) => s.region === region && s.country_code === country_code)
      : [];
    const matchingCountry = country_code
      ? countryCups.filter((c) => c.country_code === country_code)
      : [];
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

export default function MapView({ cups, stores, userLocation, targetZoom, worldViewTick = 0, flyTick = 0, onZoomChange }: MapViewProps) {
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
      <ZoomUpdater location={userLocation} zoom={targetZoom} flyTick={flyTick} />
      <WorldViewResetter tick={worldViewTick} />
      <ZoomTracker onZoomChange={onZoomChange} />
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
          <Popup autoPan={false}>You are here</Popup>
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
            <Popup autoPanPaddingBottomRight={[5, 72]}>
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

                const neededStateGroups  = groupByVariant(neededState);
                const neededCountryGroups = groupByVariant(neededCountry);
                const ownedStateGroups   = groupByVariant(ownedState);
                const ownedCountryGroups = groupByVariant(ownedCountry);

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
                        {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
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
                      {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                    </div>
                    <div className="text-map-orange">
                      {cup.ownedRecord?.needs_replacing ? "⚠ Needs replacing" : "Needed"}
                    </div>
                  </div>
                );

                const hasNeeded = neededCityGroups.length > 0 || neededStateGroups.length > 0 || neededCountryGroups.length > 0 || neededThemed.length > 0;
                const hasOwned  = ownedCityGroups.length > 0 || ownedStateGroups.length > 0 || ownedCountryGroups.length > 0 || ownedThemed.length > 0;

                return (
                  <div className="text-sm min-w-[160px] max-h-[60vh] overflow-y-auto pr-1">
                    <div className="font-semibold flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0 text-map-orange">
                        <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8 8 0 1 0-16 0c0 3.63 1.556 6.326 3.5 8.327a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                      </svg>
                      {locationName}
                    </div>

                    {hasNeeded && (
                      <div className="border-t border-gray-200 mt-2 pt-2">
                        {neededCityGroups.map((g) => cityGroupRow(g))}

                        {neededStateGroups.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededState[0].region || neededState[0].name} <span className="font-normal text-gray-400 text-xs">(state)</span>
                            </div>
                            {neededStateGroups.map((g) => cityGroupRow(g))}
                          </>
                        )}

                        {neededCountryGroups.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededCountry[0].country || neededCountry[0].name} <span className="font-normal text-gray-400 text-xs">(country)</span>
                            </div>
                            {neededCountryGroups.map((g) => cityGroupRow(g))}
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
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                            </div>
                          );
                        })}
                        {[...ownedStateGroups, ...ownedCountryGroups].map(({ base, members }) => {
                          const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                          const scopeSuffix = base.scope === "state" || base.scope === "country" ? ` (${base.scope})` : "";
                          return (
                            <div key={base.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="underline cursor-pointer">
                                {base.name}{versionSuffix}{scopeSuffix}
                              </button>
                              {" "}· {base.series} · {base.year}
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                            </div>
                          );
                        })}
                        {ownedThemed.map((cup) => (
                          <div key={cup.id} className="text-xs text-gray-500 mb-0.5">
                            ✓{" "}
                            <button onClick={() => router.push(`/cup/${cup.slug || cup.id}`)} className="underline cursor-pointer">
                              {cup.name}
                            </button>
                            {" "}· {cup.series} · {cup.year}
                            {cup.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                          </div>
                        ))}
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
        // Variant grouping runs across ALL nearby city cups so that a variant and
        // its base collapse even when they have different lat/lng coordinates.
        // Each group is then bucketed by its most recent member's location so the
        // location sub-headers reflect where the user should actually go.
        // "Already owned" wins if ANY member of the group is owned.
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
        const cityLocations = Array.from(locationBuckets.values());
        const neededStateGroups  = groupByVariant(neededState);
        const neededCountryGroups = groupByVariant(neededCountry);
        const ownedStateGroups   = groupByVariant(ownedState);
        const ownedCountryGroups = groupByVariant(ownedCountry);
        const hasNeeded = cityLocations.some((l) => l.neededGroups.length > 0) || neededStateGroups.length > 0 || neededCountryGroups.length > 0;
        const hasOwned  = cityLocations.some((l) => l.ownedGroups.length > 0)  || ownedStateGroups.length > 0  || ownedCountryGroups.length > 0;
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
            <Popup autoPanPaddingBottomRight={[5, 72]}>
              <div className="text-sm min-w-[180px] max-h-[60vh] overflow-y-auto pr-1">
                <div className="font-semibold flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0 text-green-starbucks">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                  </svg>
                  {store.name}
                </div>
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
                                    {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                                  </div>
                                  <div className="text-map-orange text-xs">{anyNeedsReplacing ? "⚠ Needs replacing" : "Needed"}</div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {neededStateGroups.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededState[0].region || neededState[0].name} <span className="font-normal text-gray-400 text-xs">(state)</span>
                            </div>
                            {neededStateGroups.map(({ base, members }) => {
                              const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                              const anyNeedsReplacing = members.some((c) => c.ownedRecord?.needs_replacing);
                              return (
                                <div key={base.id} className="mb-1.5">
                                  <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                                    {base.name}{versionSuffix}
                                  </button>
                                  <div className="text-gray-500 text-xs">
                                    {base.series} · {base.year}
                                    {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                                  </div>
                                  <div className="text-map-orange text-xs">{anyNeedsReplacing ? "⚠ Needs replacing" : "Needed"}</div>
                                </div>
                              );
                            })}
                          </>
                        )}
                        {neededCountryGroups.length > 0 && (
                          <>
                            <div className="font-semibold mt-2 mb-1">
                              {neededCountry[0].country || neededCountry[0].name} <span className="font-normal text-gray-400 text-xs">(country)</span>
                            </div>
                            {neededCountryGroups.map(({ base, members }) => {
                              const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                              const anyNeedsReplacing = members.some((c) => c.ownedRecord?.needs_replacing);
                              return (
                                <div key={base.id} className="mb-1.5">
                                  <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="font-medium text-green-starbucks underline text-left cursor-pointer">
                                    {base.name}{versionSuffix}
                                  </button>
                                  <div className="text-gray-500 text-xs">
                                    {base.series} · {base.year}
                                    {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                                  </div>
                                  <div className="text-map-orange text-xs">{anyNeedsReplacing ? "⚠ Needs replacing" : "Needed"}</div>
                                </div>
                              );
                            })}
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
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
                            </div>
                          );
                        })}
                        {[...ownedStateGroups, ...ownedCountryGroups].map(({ base, members }) => {
                          const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                          const scopeLabel = ` (${base.scope})`;
                          return (
                            <div key={base.id} className="text-xs text-gray-500 mb-0.5">
                              ✓{" "}
                              <button onClick={() => router.push(`/cup/${base.slug || base.id}`)} className="underline cursor-pointer">
                                {base.name}{versionSuffix}{scopeLabel}
                              </button>
                              {" "}· {base.series} · {base.year}
                              {base.item_type === "ornament" && <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">ornament</span>}
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
