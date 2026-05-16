"use client";

// Leaflet cannot run server-side — dynamic import with ssr: false is required.
// See src/components/MapView.tsx for the actual map implementation.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useNearbyRadius, RADIUS_OPTIONS } from "@/hooks/useNearbyRadius";
import type { Cup, OwnedCup, CupWithOwnership, NearbyStore } from "@/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const householdId = session?.user?.householdId ?? null;
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { radiusMeters, setRadius } = useNearbyRadius();
  const [worldViewTick, setWorldViewTick] = useState(0);

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
        .getFullList({ sort: "city" })
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

  // Fetch nearby Starbucks when location is known; re-fetches when radius changes
  const { data: storesData } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores", userLocation?.lat, userLocation?.lng, radiusMeters],
    queryFn: () =>
      fetch(
        `/api/nearby-starbucks?lat=${userLocation!.lat}&lng=${userLocation!.lng}&radius=${radiusMeters}`
      ).then((r) => r.json()),
    enabled: !!userLocation,
  });

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

  // Merge cups with ownership status for map rendering
  const ownedCupIds = new Set(ownedCups.map((o) => o.cup_id));
  const cupsWithOwnership: CupWithOwnership[] = cups
    .filter((c) => c.lat && c.lng) // Only cups with coordinates get a pin
    .map((cup) => ({
      ...cup,
      isOwned: ownedCupIds.has(cup.id),
      ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
    }));

  const stores = storesData?.stores ?? [];
  const targetZoom = RADIUS_OPTIONS.find((o) => o.meters === radiusMeters)?.zoom ?? 11;

  return (
    <div className="flex flex-col h-screen">
      <OfflineBanner />

      {/* App header */}
      <header className="bg-green-dark text-white px-4 py-3 flex-shrink-0">
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
        {/* Radius selector — only shown when location is active */}
        {userLocation && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-white/50">Nearby:</span>
            <div className="flex gap-1">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.meters}
                  onClick={() => setRadius(opt.meters)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    radiusMeters === opt.meters
                      ? "bg-gold text-green-dark border-gold font-semibold"
                      : "border-white/30 text-white/70 hover:border-white/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
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
        />
      </div>

      <BottomNav />
    </div>
  );
}
