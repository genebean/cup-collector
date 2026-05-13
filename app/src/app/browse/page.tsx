"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CupCard } from "@/components/CupCard";
import type { Cup, OwnedCup, CupWithOwnership } from "@/types";

type Filter = "all" | "needed" | string; // string covers series/country filter values

export default function BrowsePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  useEffect(() => {
    if (!session?.user?.pocketIdSub) return;
    const pb = getPocketBase();
    const sub = session.user.pocketIdSub;
    pb.collection("households")
      .getFirstListItem(`member_sub_1="${sub}" || member_sub_2="${sub}" || viewer_subs~"${sub}"`)
      .then((h) => setHouseholdId(h.id))
      .catch(() => {});
  }, [session]);

  const { data: cups = [] } = useQuery<Cup[]>({
    queryKey: ["cups"],
    queryFn: () =>
      getPocketBase().collection("cups").getFullList({ sort: "country,city" })
        .then((r) => r as unknown as Cup[]),
  });

  const { data: ownedCups = [] } = useQuery<OwnedCup[]>({
    queryKey: ["owned_cups", householdId],
    queryFn: () =>
      getPocketBase().collection("owned_cups")
        .getFullList({ filter: `household_id="${householdId}"` })
        .then((r) => r as unknown as OwnedCup[]),
    enabled: !!householdId,
  });

  // Realtime subscription — keep owned status in sync across devices
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

  const ownedCupIds = useMemo(() => new Set(ownedCups.map((o) => o.cup_id)), [ownedCups]);
  const seriesList = [...new Set(cups.map((c) => c.series))].sort();

  // Merge ownership, apply search and filter, sort "needed near me" first
  const displayedCups: CupWithOwnership[] = useMemo(() => {
    let result: CupWithOwnership[] = cups.map((cup) => ({
      ...cup,
      isOwned: ownedCupIds.has(cup.id),
      ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
    }));

    // Text search across city, country, series
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.city.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          c.series.toLowerCase().includes(q)
      );
    }

    // Filter chips
    if (filter === "needed") {
      result = result.filter((c) => !c.isOwned);
    } else if (filter !== "all") {
      result = result.filter((c) => c.series === filter);
    }

    // When location is available, float unowned nearby cups to the top
    if (userLocation) {
      result.sort((a, b) => {
        if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;
        const distA = haversineKm(userLocation, a);
        const distB = haversineKm(userLocation, b);
        return distA - distB;
      });
    }

    return result;
  }, [cups, ownedCups, ownedCupIds, filter, search, userLocation]);

  const ownedCount = ownedCupIds.size;
  const totalCount = cups.length;

  return (
    <div className="flex flex-col h-screen">
      <OfflineBanner />

      <header className="bg-green-dark text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg">Browse</h1>
          <span className="text-xs text-white/60">
            {totalCount} cups · {ownedCount} owned
          </span>
        </div>
        {/* Search bar */}
        <input
          type="search"
          placeholder="Search by city, country, or series…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-none"
        />
        {/* Filter chips */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { value: "all", label: "All" },
            { value: "needed", label: "Still Need" },
            ...seriesList.map((s) => ({ value: s, label: s })),
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                filter === value
                  ? "bg-gold text-green-dark border-gold"
                  : "border-white/30 text-white/80 hover:border-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {displayedCups.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No cups match your search.</div>
        ) : (
          displayedCups.map((cup) => <CupCard key={cup.id} cup={cup} />)
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// Approximate distance between two lat/lng points in kilometres (Haversine formula)
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
