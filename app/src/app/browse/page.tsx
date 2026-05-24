"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { haversineMi } from "@/lib/geo";
import { buildSeriesOptions } from "@/lib/browse";
import { groupByVariant } from "@/lib/variants";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CupCard } from "@/components/CupCard";
import type { Cup, OwnedCup, CupWithOwnership, CupScope, CollectionPrefs } from "@/types";

type StatusFilter = "all" | "needed" | "owned";
type ScopeFilter = "" | CupScope;
const EMPTY_PREFS: CollectionPrefs = {};

export default function BrowsePage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const householdId = session?.user?.householdId ?? null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [seriesFilter, setSeriesFilter] = useState("");   // "" = no filter; "Series|ornament" for ornaments
  const [countryFilter, setCountryFilter] = useState(""); // "" = no filter
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(""); // "" = no filter
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
      getPocketBase().collection("cups").getFullList({ sort: "country,name" })
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

  const { data: prefs = EMPTY_PREFS } = useQuery<CollectionPrefs>({
    queryKey: ["household-prefs"],
    queryFn: () => fetch("/api/household-prefs").then((r) => r.json()),
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

  // Owned cups always show; unowned cups from excluded series/types or marked as duplicates are hidden.
  const displayableCups = useMemo(() => cups.filter((c) => {
    if (ownedCupIds.has(c.id)) return true;
    if (c.is_duplicate) return false;
    if (prefs.excluded_series?.includes(c.series)) return false;
    if (prefs.excluded_types?.includes(c.item_type || "mug")) return false;
    return true;
  }), [cups, ownedCupIds, prefs]);

  const seriesOptions = useMemo(() => buildSeriesOptions(displayableCups), [displayableCups]);
  const { pinnedCountries, otherCountries } = useMemo(() => {
    const all = [...new Set(displayableCups.map((c) => c.country).filter(Boolean))];
    const pinned = ["United States", "Canada", "Mexico"].filter((c) => all.includes(c));
    return { pinnedCountries: pinned, otherCountries: all.filter((c) => !pinned.includes(c)).sort() };
  }, [displayableCups]);

  const displayedGroups = useMemo(() => {
    const withOwnership: CupWithOwnership[] = displayableCups.map((cup) => ({
      ...cup,
      isOwned: ownedCupIds.has(cup.id),
      ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
    }));

    let groups = groupByVariant(withOwnership);

    if (search.trim()) {
      const q = search.toLowerCase();
      groups = groups.filter(({ members }) =>
        members.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.country.toLowerCase().includes(q) ||
            c.series.toLowerCase().includes(q)
        )
      );
    }

    // Status filter operates at group level: "needed" = any member unowned/needs-replacing
    if (statusFilter === "needed") {
      groups = groups.filter(({ members }) =>
        members.some((c) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false))
      );
    }
    if (statusFilter === "owned") {
      groups = groups.filter(({ members }) => members.some((c) => c.isOwned));
    }

    if (seriesFilter) {
      const [filterSeries, filterType] = seriesFilter.split("|");
      groups = groups.filter(({ base }) => base.series === filterSeries);
      if (filterType) groups = groups.filter(({ base }) => (base.item_type || "mug") === filterType);
    }
    if (countryFilter) groups = groups.filter(({ base }) => base.country === countryFilter);
    if (scopeFilter)   groups = groups.filter(({ base }) => (base.scope || "city") === scopeFilter);

    // Near Me — explicit opt-in sort toggle; use base cup coordinates
    if (nearMe && userLocation) {
      groups.sort((a, b) => {
        const aAllOwned = a.members.every((c) => c.isOwned);
        const bAllOwned = b.members.every((c) => c.isOwned);
        if (aAllOwned !== bAllOwned) return aAllOwned ? 1 : -1;
        return haversineMi(userLocation, a.base) - haversineMi(userLocation, b.base);
      });
    }

    return groups;
  }, [displayableCups, ownedCups, ownedCupIds, statusFilter, seriesFilter, countryFilter, scopeFilter, nearMe, search, userLocation]);

  const ownedCount = useMemo(() => displayableCups.filter((c) => ownedCupIds.has(c.id)).length, [displayableCups, ownedCupIds]);
  const totalCount = displayableCups.length;
  const hasScopedCups = displayableCups.some((c) => c.scope === "state" || c.scope === "country" || c.scope === "themed");

  const chipClass = (active: boolean) =>
    `flex-shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
      active
        ? "bg-gold text-green-dark border-gold"
        : "border-white/30 text-white/80 hover:border-white/60"
    }`;

  const selectClass = (active: boolean) =>
    `w-full appearance-none text-xs font-medium px-3 py-1 pr-7 rounded-full border cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-white/50 transition-colors ${
      active
        ? "bg-gold text-green-dark border-gold"
        : "bg-transparent border-white/30 text-white/80 hover:border-white/60"
    }`;

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <OfflineBanner />

      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
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
          className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-hidden"
        />

        {/* Series + Country + Scope selects — all three on one row */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <select
              value={seriesFilter}
              onChange={(e) => setSeriesFilter(e.target.value)}
              className={selectClass(!!seriesFilter)}
            >
              <option value="">Series…</option>
              {seriesOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              {pinnedCountries.length > 0 && (
                <optgroup label="─────────────">
                  {pinnedCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              )}
              {otherCountries.length > 0 && (
                <optgroup label="─────────────">
                  {otherCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              )}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-white/60">▾</span>
          </div>

          {hasScopedCups && (
            <div className="relative flex-1">
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
                className={selectClass(!!scopeFilter)}
              >
                <option value="">Scope…</option>
                <option value="city">Cities</option>
                <option value="state">States</option>
                <option value="country">Countries</option>
                <option value="themed">Themed</option>
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-white/60">▾</span>
            </div>
          )}
        </div>

        {/* Status chips + Near Me */}
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
        {displayedGroups.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">No cups match your search.</div>
        ) : (
          displayedGroups.map(({ base, members }) => (
            <CupCard
              key={base.id}
              cup={base}
              variantCount={members.length > 1 ? members.length : undefined}
              ownedVariants={members.length > 1 ? members.filter((c) => c.isOwned).length : undefined}
            />
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
}
