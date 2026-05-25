"use client";

// Leaflet cannot run server-side — dynamic import with ssr: false is required.
// See src/components/MapView.tsx for the actual map implementation.
import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useNearbyRadius, RADIUS_OPTIONS } from "@/hooks/useNearbyRadius";
import { chipMetersForZoom } from "@/lib/nearby-radius";
import type { Cup, OwnedCup, CupWithOwnership, NearbyStore, CollectionPrefs } from "@/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const EMPTY_PREFS: CollectionPrefs = {};

export default function MapPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const householdId = session?.user?.householdId ?? null;
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { radiusMeters, setRadius } = useNearbyRadius();
  const [worldViewTick, setWorldViewTick] = useState(0);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  // Radius used for a manual "Search here" — captured from the zoom-based chip
  // at click time. Kept separate from radiusMeters so it doesn't trigger ZoomUpdater.
  const [searchRadius, setSearchRadius] = useState(radiusMeters);

  // Request geolocation on mount — falls back gracefully if denied
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        console.warn("[map] geolocation error:", err.code, err.message);
      }
    );
  }, []);

  // Fetch all cups from the catalog
  const { data: cups = [] } = useQuery<Cup[]>({
    queryKey: ["cups"],
    queryFn: () =>
      getPocketBase()
        .collection("cups")
        .getFullList({ sort: "name" })
        .then((records) => records as unknown as Cup[]),
  });

  // Fetch which cups this household owns
  const { data: ownedCups = [] } = useQuery<OwnedCup[]>({
    queryKey: ["owned_cups", householdId],
    queryFn: () =>
      getPocketBase()
        .collection("owned_cups")
        .getFullList({ filter: `household_id="${householdId}"` })
        .then((records) => records as unknown as OwnedCup[]),
    enabled: !!householdId,
  });

  const { data: prefs = EMPTY_PREFS } = useQuery<CollectionPrefs>({
    queryKey: ["household-prefs"],
    queryFn: () => fetch("/api/household-prefs").then((r) => r.json()),
    enabled: !!householdId,
  });

  // "Search here" uses the current map center; falls back to GPS location for auto-fetch.
  // Changing the radius clears the manual search so it reverts to GPS mode.
  const storeLat = searchCenter?.lat ?? userLocation?.lat;
  const storeLng = searchCenter?.lng ?? userLocation?.lng;
  // Manual searches use searchRadius (zoom-based at click time); GPS auto-fetch uses radiusMeters.
  const effectiveRadius = searchCenter ? searchRadius : radiusMeters;

  const { data: storesData, isFetching: isFetchingStores } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores", storeLat, storeLng, effectiveRadius],
    queryFn: () =>
      fetch(`/api/nearby-starbucks?lat=${storeLat}&lng=${storeLng}&radius=${effectiveRadius}`).then((r) =>
        r.json()
      ),
    enabled: !!(storeLat && storeLng),
  });

  function handleSearchHere() {
    try {
      const pos = JSON.parse(sessionStorage.getItem("map_position") ?? "null");
      if (pos?.lat !== undefined && pos?.lng !== undefined) {
        // Capture the zoom-based chip radius into searchRadius — avoids calling
        // setRadius (which changes targetZoom and triggers ZoomUpdater's flyTo).
        setSearchRadius(mapZoom !== null ? activeChipMeters : radiusMeters);
        setSearchCenter({ lat: pos.lat, lng: pos.lng });
      }
    } catch { /* ignore */ }
  }

  // Subscribe to realtime owned_cups changes — updates all connected devices
  useEffect(() => {
    if (!householdId) return;
    const pb = getPocketBase();
    pb.collection("owned_cups").subscribe("*", (e) => {
      if (e.record.household_id === householdId) {
        queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
      }
    });
    return () => { pb.collection("owned_cups").unsubscribe("*"); };
  }, [householdId, queryClient]);

  // Merge cups with ownership status for map rendering, respecting collection prefs
  const ownedCupIds = useMemo(() => new Set(ownedCups.map((o) => o.cup_id)), [ownedCups]);
  const cupsWithOwnership = useMemo<CupWithOwnership[]>(() =>
    cups
      .filter((c) => {
        const owned = ownedCupIds.has(c.id);
        // Owned cups always show; only hide unowned cups from excluded series/types
        if (!owned) {
          if (c.is_duplicate) return false;
          if (prefs.excluded_series?.includes(c.series)) return false;
          if (prefs.excluded_types?.includes(c.item_type || "mug")) return false;
        }
        // City cups need real coords for a pin; state/country/themed appear in city popups
        return c.scope === "state" || c.scope === "country" || c.scope === "themed" || (!!c.lat && !!c.lng);
      })
      .map((cup) => ({
        ...cup,
        isOwned: ownedCupIds.has(cup.id),
        ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
      })),
    [cups, ownedCups, ownedCupIds, prefs]
  );

  const stores = storesData?.stores ?? [];
  const targetZoom = RADIUS_OPTIONS.find((o) => o.meters === radiusMeters)?.zoom ?? 11;

  // Which chip to visually highlight: driven by current map zoom so the chip
  // progresses through 2mi → 5mi → 10mi → 25mi as the user zooms in/out.
  // Falls back to the last explicitly selected radius when zoom isn't yet known.
  const activeChipMeters = mapZoom !== null ? chipMetersForZoom(mapZoom) : radiusMeters;

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <OfflineBanner />

      {/* App header */}
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-tight">Cup Collector</h1>
            {session?.user?.householdName && (
              <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
            )}
          </div>
          {/* Globe button — zooms to world view of full collection */}
          <button
            className="text-xl"
            title="World view"
            onClick={() => setWorldViewTick((t) => t + 1)}
          >
            🌍
          </button>
        </div>
        {/* Controls row — radius chips (GPS only) on left, Search here always on right */}
        <div className="flex items-center justify-between mt-2">
          {userLocation ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Nearby:</span>
              <div className="flex gap-1">
                {RADIUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.meters}
                    onClick={() => { setRadius(opt.meters); setSearchCenter(null); }}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      activeChipMeters === opt.meters
                        ? "bg-gold text-green-dark border-gold font-semibold"
                        : "border-white/30 text-white/70 hover:border-white/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : <div />}

          <button
            onClick={handleSearchHere}
            className="text-xs px-2 py-0.5 rounded-full border border-white/30 text-white/70 hover:border-white/60 hover:text-white active:bg-white/20 transition-colors"
          >
            Search here
          </button>
        </div>

        {searchCenter && !isFetchingStores && stores.length === 0 && (
          <p className="text-xs text-white/60 text-center pt-1">
            No Starbucks found within {RADIUS_OPTIONS.find((o) => o.meters === effectiveRadius)?.label ?? "range"} of the center of the map
          </p>
        )}
      </header>

      {/* z-0 creates a stacking context that isolates Leaflet's internal z-indices */}
      <div className="flex-1 relative z-0">
        <MapView
          cups={cupsWithOwnership}
          stores={stores}
          userLocation={userLocation}
          targetZoom={targetZoom}
          worldViewTick={worldViewTick}
          onZoomChange={setMapZoom}
        />
      </div>

      <BottomNav />
    </div>
  );
}
