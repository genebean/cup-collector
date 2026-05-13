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
import type { Cup, OwnedCup, CupWithOwnership, NearbyStore } from "@/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  // Request geolocation on mount — falls back gracefully if denied
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {/* Permission denied — map stays at world view, no error shown */}
    );
  }, []);

  // Fetch household ID for this user (needed to scope owned_cups queries)
  useEffect(() => {
    if (!session?.user?.pocketIdSub) return;
    const pb = getPocketBase();
    const sub = session.user.pocketIdSub;
    pb.collection("households")
      .getFirstListItem(`member_sub_1="${sub}" || member_sub_2="${sub}" || viewer_subs~"${sub}"`)
      .then((h) => setHouseholdId(h.id))
      .catch(() => {/* Will redirect via middleware if no household */});
  }, [session]);

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

  // Fetch nearby Starbucks when location is known
  const { data: storesData } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores", userLocation?.lat, userLocation?.lng],
    queryFn: () =>
      fetch(
        `/api/nearby-starbucks?lat=${userLocation!.lat}&lng=${userLocation!.lng}&radius=3000`
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

  return (
    <div className="flex flex-col h-screen">
      <OfflineBanner />

      {/* App header */}
      <header className="bg-green-dark text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="font-bold text-lg">Cup Collector</h1>
        {/* Globe button — zooms to world view of full collection */}
        <button
          className="text-xl"
          title="World view"
          onClick={() => {
            // Handled inside MapView via a ref — placeholder for now
          }}
        >
          🌍
        </button>
      </header>

      {/* Map fills remaining space above bottom nav */}
      <div className="flex-1 relative">
        <MapView
          cups={cupsWithOwnership}
          stores={stores}
          userLocation={userLocation}
        />
      </div>

      <BottomNav />
    </div>
  );
}
