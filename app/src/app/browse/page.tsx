"use client";

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPocketBase } from "@/lib/pocketbase";
import { haversineMi } from "@/lib/geo";
import { buildSeriesOptions } from "@/lib/browse";
import { groupByVariant, groupNeedsAction, findRepresentative } from "@/lib/variants";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CupCard } from "@/components/CupCard";
import { SwipeableRow } from "@/components/SwipeableRow";
import type { Cup, OwnedCup, CupWithOwnership, CupScope, CollectionPrefs } from "@/types";

type StatusFilter = "all" | "needed" | "owned";
type ScopeFilter = "" | CupScope;
const EMPTY_PREFS: CollectionPrefs = {};

export default function BrowsePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const householdId = session?.user?.householdId ?? null;
  const canWrite = session?.user?.householdRole === "owner";

  // All filter state initializes to defaults — sessionStorage and URL params are
  // client-only and cannot be read during SSR; reading them in lazy initializers
  // causes hydration mismatches. Restored in the post-mount effect below.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("");
  const [subCollectionFilter, setSubCollectionFilter] = useState("");
  const [nearMe, setNearMe] = useState(false);
  const [search, setSearch] = useState("");
  const [needsReplacingFilter, setNeedsReplacingFilter] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const didRestoreScroll = useRef(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  // Restore client-only state after mount, but ONLY when returning from a cup detail page.
  // The flag is set in markCupNavigation (below) when a cup card is tapped, so arbitrary
  // navigation to /browse (e.g. from /stats or /settings) always starts fresh.
  useEffect(() => {
    const returning = sessionStorage.getItem("browse_return_pending") === "1";
    sessionStorage.removeItem("browse_return_pending");
    if (returning) {
      try {
        const saved = JSON.parse(sessionStorage.getItem("browse_state") ?? "{}");
        if (saved.statusFilter) setStatusFilter(saved.statusFilter as StatusFilter);
        if (saved.seriesFilter) setSeriesFilter(saved.seriesFilter);
        if (saved.countryFilter) setCountryFilter(saved.countryFilter);
        if (saved.scopeFilter) setScopeFilter(saved.scopeFilter as ScopeFilter);
        if (saved.subCollectionFilter) setSubCollectionFilter(saved.subCollectionFilter);
        if (saved.nearMe === "true") setNearMe(true);
        if (saved.search) setSearch(saved.search);
      } catch {}
    }
    if (new URLSearchParams(window.location.search).get("needs_replacing") === "1") {
      setNeedsReplacingFilter(true);
    }
  }, []);

  // Persist filter state so it's available when the user taps back from a cup detail.
  useEffect(() => {
    try {
      sessionStorage.setItem("browse_state", JSON.stringify({
        statusFilter, seriesFilter, countryFilter, scopeFilter, subCollectionFilter,
        nearMe: String(nearMe), search,
      }));
    } catch {}
  }, [statusFilter, seriesFilter, countryFilter, scopeFilter, subCollectionFilter, nearMe, search]);

  // Set the "returning from cup" flag when tapping a cup card so the restore
  // effect above knows to apply saved state on the next /browse mount.
  const markCupNavigation = useCallback(() => {
    try { sessionStorage.setItem("browse_return_pending", "1"); } catch {}
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

  const toggleOwnership = useCallback(async (cup: CupWithOwnership) => {
    if (cup.ownedRecord?.needs_replacing) {
      await fetch(`/api/owned-cups?id=${cup.ownedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needs_replacing: false }),
      });
    } else if (cup.isOwned && cup.ownedRecord) {
      await fetch(`/api/owned-cups?id=${cup.ownedRecord.id}`, { method: "DELETE" });
    } else {
      await fetch("/api/owned-cups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: cup.id }),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
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
  const subCollectionOptions = useMemo(
    () => [...new Set(displayableCups.map((c) => c.sub_collection).filter(Boolean))].sort(),
    [displayableCups]
  );
  const { pinnedCountries, otherCountries } = useMemo(() => {
    const all = [...new Set(displayableCups.map((c) => c.country).filter(Boolean))];
    const pinned = ["United States", "Canada", "Mexico"].filter((c) => all.includes(c));
    return { pinnedCountries: pinned, otherCountries: all.filter((c) => !pinned.includes(c)).sort() };
  }, [displayableCups]);

  // All displayable groups before any filter — used for owned/total counts so the
  // header stays accurate regardless of which filters are active.
  const baseGroups = useMemo(() => {
    const withOwnership: CupWithOwnership[] = displayableCups.map((cup) => ({
      ...cup,
      isOwned: ownedCupIds.has(cup.id),
      ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
    }));
    return groupByVariant(withOwnership);
  }, [displayableCups, ownedCups, ownedCupIds]);

  const displayedGroups = useMemo(() => {
    let groups = baseGroups;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
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
      groups = groups.filter(({ members }) => groupNeedsAction(members));
    }
    if (statusFilter === "owned") {
      groups = groups.filter(({ members }) => members.some((c) => c.isOwned));
    }

    if (seriesFilter) {
      const [filterSeries, filterType] = seriesFilter.split("|");
      groups = groups.filter(({ base }) => base.series === filterSeries);
      if (filterType) groups = groups.filter(({ base }) => (base.item_type || "mug") === filterType);
    }
    if (countryFilter)         groups = groups.filter(({ base }) => base.country === countryFilter);
    if (scopeFilter)           groups = groups.filter(({ base }) => (base.scope || "city") === scopeFilter);
    if (subCollectionFilter)   groups = groups.filter(({ members }) => members.some((c) => c.sub_collection === subCollectionFilter));

    if (needsReplacingFilter) {
      groups = groups.filter(({ members }) =>
        members.some((c) => c.isOwned && c.ownedRecord?.needs_replacing === true)
      );
    }

    // Near Me — explicit opt-in sort toggle.
    // State/country cups use the distance to the nearest city cup in their
    // region/country rather than their own lat/lng (which is a geographic center
    // that may rank them behind a neighbouring state's center even when the user
    // is standing inside the state).
    if (nearMe && userLocation) {
      const loc = userLocation;
      const cityCupsByRegion = new Map<string, number>();
      const cityCupsByCountry = new Map<string, number>();
      for (const { base } of baseGroups) {
        if (base.scope && base.scope !== "city") continue;
        const d = haversineMi(loc, base);
        if (base.region) {
          const prev = cityCupsByRegion.get(base.region) ?? Infinity;
          if (d < prev) cityCupsByRegion.set(base.region, d);
        }
        if (base.country_code) {
          const prev = cityCupsByCountry.get(base.country_code) ?? Infinity;
          if (d < prev) cityCupsByCountry.set(base.country_code, d);
        }
      }
      const distanceTo = (base: (typeof baseGroups)[number]["base"]): number => {
        if (base.scope === "state" && base.region) return cityCupsByRegion.get(base.region) ?? haversineMi(loc, base);
        if (base.scope === "country" && base.country_code) return cityCupsByCountry.get(base.country_code) ?? haversineMi(loc, base);
        return haversineMi(loc, base);
      };
      groups.sort((a, b) => {
        const aAllGood = a.members.every((c) => c.isOwned && !c.ownedRecord?.needs_replacing);
        const bAllGood = b.members.every((c) => c.isOwned && !c.ownedRecord?.needs_replacing);
        if (aAllGood !== bAllGood) return aAllGood ? 1 : -1;
        return distanceTo(a.base) - distanceTo(b.base);
      });
    }

    return groups;
  }, [baseGroups, statusFilter, seriesFilter, countryFilter, scopeFilter, subCollectionFilter, needsReplacingFilter, nearMe, search, userLocation]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: displayedGroups.length,
    getScrollElement: () => mainRef.current,
    estimateSize: () => 76,
    overscan: 8,
  });

  // Restore scroll position once after the list first renders with data
  useEffect(() => {
    if (didRestoreScroll.current || !mainRef.current || displayedGroups.length === 0) return;
    try {
      const pos = Number(sessionStorage.getItem("browse_scroll") ?? 0);
      if (pos > 0) mainRef.current.scrollTop = pos;
    } catch {}
    didRestoreScroll.current = true;
  }, [displayedGroups]);

  const ownedCount = useMemo(
    () => baseGroups.filter(({ members }) => members.some((c) => c.isOwned)).length,
    [baseGroups]
  );
  const totalCount = baseGroups.length;
  const hasScopedCups = displayableCups.some((c) => c.scope === "state" || c.scope === "country" || c.scope === "themed");
  const hasSubCollections = subCollectionOptions.length > 0;

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
          <Link
            href="/stats"
            className="text-sm text-white/80 bg-white/10 px-2.5 py-1 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
          >
            {ownedCount}/{totalCount} owned ›
          </Link>
        </div>

        {/* Search bar */}
        <div className="relative mt-2">
          <input
            type="text"
            placeholder="Search by city, country, or series…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-hidden"
          />
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-opacity ${search ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        {/* Series + Country selects */}
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
        </div>

        {/* Scope + Sub-collection selects — only shown when applicable */}
        {(hasScopedCups || hasSubCollections) && (
          <div className="flex gap-2 mt-2">
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

            {hasSubCollections && (
              <div className="relative flex-1">
                <select
                  value={subCollectionFilter}
                  onChange={(e) => setSubCollectionFilter(e.target.value)}
                  className={selectClass(!!subCollectionFilter)}
                >
                  <option value="">Collection…</option>
                  {subCollectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-white/60">▾</span>
              </div>
            )}
          </div>
        )}

        {/* Needs-replacing filter banner — always in DOM, shown/hidden via CSS to avoid hydration mismatch */}
        <div className={`items-center justify-between mt-2 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 ${needsReplacingFilter ? "flex" : "hidden"}`}>
          <span className="text-xs font-medium text-orange-200">⚠ Showing cups that need replacing</span>
          <button
            type="button"
            onClick={() => {
              setNeedsReplacingFilter(false);
              router.replace("/browse", { scroll: false });
            }}
            className="text-xs text-orange-200 hover:text-white ml-2"
            aria-label="Clear needs-replacing filter"
          >
            ✕
          </button>
        </div>

        {/* Status chips + Near Me — hidden when needs-replacing banner is active */}
        <div className={`gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide ${needsReplacingFilter ? "hidden" : "flex"}`}>
          <button className={chipClass(statusFilter === "all")} onClick={() => setStatusFilter("all")}>All</button>
          <button className={chipClass(statusFilter === "needed")} onClick={() => setStatusFilter("needed")}>Still Need</button>
          <button className={chipClass(statusFilter === "owned")} onClick={() => setStatusFilter("owned")}>Already Have</button>
          {userLocation && (
            <button className={chipClass(nearMe)} onClick={() => setNearMe((v) => !v)}>Near Me</button>
          )}
        </div>
      </header>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto pb-20"
        onScroll={() => {
          try { sessionStorage.setItem("browse_scroll", String(mainRef.current?.scrollTop ?? 0)); }
          catch {}
        }}
      >
        {displayedGroups.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">No cups match your search.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const { base, members } = displayedGroups[virtualItem.index];
              const representative = findRepresentative(members);
              const card = (
                <CupCard
                  cup={base}
                  variantCount={members.length > 1 ? members.length : undefined}
                  ownedVariants={members.length > 1 ? members.filter((c) => c.isOwned).length : undefined}
                  imageCup={members.length > 1 ? representative : undefined}
                  onClick={markCupNavigation}
                />
              );

              const needsReplacing = representative.ownedRecord?.needs_replacing ?? false;
              const actionLabel = needsReplacing ? "Replaced ✓" : representative.isOwned ? "Unmark" : "Mark Owned";
              const actionColor = representative.isOwned && !needsReplacing ? "bg-orange-500" : "bg-green-starbucks";

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualItem.start}px)` }}
                >
                  {canWrite ? (
                    <SwipeableRow
                      actionLabel={actionLabel}
                      actionColor={actionColor}
                      onAction={() => toggleOwnership(representative)}
                    >
                      {card}
                    </SwipeableRow>
                  ) : (
                    <Fragment>{card}</Fragment>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
