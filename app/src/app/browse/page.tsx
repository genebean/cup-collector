"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { haversineMi } from "@/lib/geo";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CupCard } from "@/components/CupCard";
import type { Cup, OwnedCup, CupWithOwnership } from "@/types";

type StatusFilter = "all" | "needed" | "owned";

export default function BrowsePage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const householdId = session?.user?.householdId ?? null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [seriesFilter, setSeriesFilter] = useState("");   // "" = no filter
  const [countryFilter, setCountryFilter] = useState(""); // "" = no filter
  const [nearMe, setNearMe] = useState(false);
  const [search, setSearch] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

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
  const countryList = [...new Set(cups.map((c) => c.country))].sort();

  const displayedCups: CupWithOwnership[] = useMemo(() => {
    let result: CupWithOwnership[] = cups.map((cup) => ({
      ...cup,
      isOwned: ownedCupIds.has(cup.id),
      ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
    }));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.city.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          c.series.toLowerCase().includes(q)
      );
    }

    if (statusFilter === "needed") result = result.filter((c) => !c.isOwned);
    if (statusFilter === "owned")  result = result.filter((c) => c.isOwned);
    if (seriesFilter)              result = result.filter((c) => c.series === seriesFilter);
    if (countryFilter)             result = result.filter((c) => c.country === countryFilter);

    // Near Me — explicit opt-in sort toggle
    if (nearMe && userLocation) {
      result.sort((a, b) => {
        if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;
        return haversineMi(userLocation, a) - haversineMi(userLocation, b);
      });
    }

    return result;
  }, [cups, ownedCups, ownedCupIds, statusFilter, seriesFilter, countryFilter, nearMe, search, userLocation]);

  const ownedCount = ownedCupIds.size;
  const totalCount = cups.length;

  const chipClass = (active: boolean) =>
    `flex-shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
      active
        ? "bg-gold text-green-dark border-gold"
        : "border-white/30 text-white/80 hover:border-white/60"
    }`;

  const selectClass = (active: boolean) =>
    `w-full appearance-none text-xs font-medium px-3 py-1 pr-7 rounded-full border bg-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/50 transition-colors ${
      active
        ? "bg-gold text-green-dark border-gold"
        : "border-white/30 text-white/80 hover:border-white/60"
    }`;

  return (
    <div className="flex flex-col h-screen dark:bg-gray-900">
      <OfflineBanner />

      <header className="bg-green-dark text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-tight">Browse</h1>
            {session?.user?.householdName && (
              <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
            )}
          </div>
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

        {/* Series + Country selects — side by side, full width on mobile */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <select
              value={seriesFilter}
              onChange={(e) => setSeriesFilter(e.target.value)}
              className={selectClass(!!seriesFilter)}
            >
              <option value="">Series…</option>
              {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-white/60">▾</span>
          </div>

          <div className="relative flex-1">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className={selectClass(!!countryFilter)}
            >
              <option value="">Country…</option>
              {countryList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-white/60">▾</span>
          </div>
        </div>

        {/* Status chips + Near Me — always fit on one row */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
          <button className={chipClass(statusFilter === "all")} onClick={() => setStatusFilter("all")}>All</button>
          <button className={chipClass(statusFilter === "needed")} onClick={() => setStatusFilter("needed")}>Still Need</button>
          <button className={chipClass(statusFilter === "owned")} onClick={() => setStatusFilter("owned")}>Already Have</button>
          {userLocation && (
            <button className={chipClass(nearMe)} onClick={() => setNearMe((v) => !v)}>Near Me</button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {displayedCups.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">No cups match your search.</div>
        ) : (
          displayedCups.map((cup) => <CupCard key={cup.id} cup={cup} />)
        )}
      </main>

      <BottomNav />
    </div>
  );
}
