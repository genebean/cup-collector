"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getPocketBase } from "@/lib/pocketbase";
import { groupedStoreCups } from "@/lib/store-cups";
import { isDisplayableCup } from "@/lib/collection-prefs";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { BottomNav } from "@/components/BottomNav";
import type { Cup, OwnedCup, CupWithOwnership, CollectionPrefs, NearbyStore } from "@/types";

const EMPTY_PREFS: CollectionPrefs = {};

function OrnamentBadge() {
  return (
    <span className="ml-1 text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300">
      ornament
    </span>
  );
}

function StoreCard({ store, cups }: { store: NearbyStore; cups: CupWithOwnership[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { cityLocations, neededStateGroups, neededCountryGroups, ownedStateGroups, ownedCountryGroups } =
    useMemo(() => groupedStoreCups(store, cups), [store, cups]);

  const totalNeeded =
    cityLocations.reduce((n, l) => n + l.neededGroups.length, 0) +
    neededStateGroups.length +
    neededCountryGroups.length;
  const totalOwned =
    cityLocations.reduce((n, l) => n + l.ownedGroups.length, 0) +
    ownedStateGroups.length +
    ownedCountryGroups.length;
  const hasCups = totalNeeded + totalOwned > 0;

  const cupSummary = hasCups
    ? [
        totalNeeded > 0 ? `${totalNeeded} needed` : null,
        totalOwned > 0 ? `${totalOwned} owned` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No catalog cups here";

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl mx-3 mb-3 overflow-hidden">
      {/* Store header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{store.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{store.address}</div>
          </div>
          <a
            href={`https://maps.apple.com/?daddr=${store.lat},${store.lng}&dirflg=d`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 underline whitespace-nowrap mt-0.5"
          >
            Directions →
          </a>
        </div>

        {/* Cup summary / toggle */}
        {hasCups ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-green-starbucks dark:text-green-400"
          >
            <span>{cupSummary}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{cupSummary}</p>
        )}
      </div>

      {/* Expanded cups list */}
      {expanded && hasCups && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-sm space-y-3">
          {/* Needed cups */}
          {(cityLocations.some((l) => l.neededGroups.length > 0) ||
            neededStateGroups.length > 0 ||
            neededCountryGroups.length > 0) && (
            <div>
              <div className="text-xs font-semibold text-map-orange mb-2 uppercase tracking-wide">Needed</div>
              {cityLocations.map(({ locationName, neededGroups }) =>
                neededGroups.length === 0 ? null : (
                  <div key={locationName} className="mb-2">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{locationName}</div>
                    {neededGroups.map(({ base, members }) => {
                      const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
                      const anyNeedsReplacing = members.some((c) => c.ownedRecord?.needs_replacing);
                      return (
                        <button
                          key={base.id}
                          onClick={() => router.push(`/cup/${base.slug || base.id}`)}
                          className="block w-full text-left py-1"
                        >
                          <span className="font-medium text-green-starbucks underline">
                            {base.name}{versionSuffix}
                          </span>
                          {base.item_type === "ornament" && <OrnamentBadge />}
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {base.series} · {base.year}
                            {anyNeedsReplacing && <span className="ml-1 text-map-orange">⚠ Needs replacing</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
              {neededStateGroups.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    State cups
                  </div>
                  {neededStateGroups.map(({ base, members }) => (
                    <button
                      key={base.id}
                      onClick={() => router.push(`/cup/${base.slug || base.id}`)}
                      className="block w-full text-left py-1"
                    >
                      <span className="font-medium text-green-starbucks underline">
                        {base.name}{members.length > 1 ? ` (${members.length} versions)` : ""}
                      </span>
                      {base.item_type === "ornament" && <OrnamentBadge />}
                      <div className="text-xs text-gray-500 dark:text-gray-400">{base.series} · {base.year}</div>
                    </button>
                  ))}
                </div>
              )}
              {neededCountryGroups.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Country cups
                  </div>
                  {neededCountryGroups.map(({ base, members }) => (
                    <button
                      key={base.id}
                      onClick={() => router.push(`/cup/${base.slug || base.id}`)}
                      className="block w-full text-left py-1"
                    >
                      <span className="font-medium text-green-starbucks underline">
                        {base.name}{members.length > 1 ? ` (${members.length} versions)` : ""}
                      </span>
                      {base.item_type === "ornament" && <OrnamentBadge />}
                      <div className="text-xs text-gray-500 dark:text-gray-400">{base.series} · {base.year}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Owned cups */}
          {(cityLocations.some((l) => l.ownedGroups.length > 0) ||
            ownedStateGroups.length > 0 ||
            ownedCountryGroups.length > 0) && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="text-xs font-semibold text-green-starbucks mb-2 uppercase tracking-wide">Already owned</div>
              {cityLocations.flatMap((l) => l.ownedGroups).map(({ base, members }) => (
                <button
                  key={base.id}
                  onClick={() => router.push(`/cup/${base.slug || base.id}`)}
                  className="block w-full text-left py-0.5 text-xs text-gray-500 dark:text-gray-400"
                >
                  ✓ {base.name}{members.length > 1 ? ` (${members.length} versions)` : ""}
                  {base.item_type === "ornament" && <OrnamentBadge />}
                  {" "}· {base.series} · {base.year}
                </button>
              ))}
              {[...ownedStateGroups, ...ownedCountryGroups].map(({ base, members }) => (
                <button
                  key={base.id}
                  onClick={() => router.push(`/cup/${base.slug || base.id}`)}
                  className="block w-full text-left py-0.5 text-xs text-gray-500 dark:text-gray-400"
                >
                  ✓ {base.name}{members.length > 1 ? ` (${members.length} versions)` : ""} ({base.scope})
                  {base.item_type === "ornament" && <OrnamentBadge />}
                  {" "}· {base.series} · {base.year}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StoreLocatorPage() {
  const { data: session } = useSession();
  const householdId = session?.user?.householdId ?? null;
  const [query, setQuery] = useState(() => {
    try { return sessionStorage.getItem("search_query") ?? ""; } catch { return ""; }
  });
  const [submittedQuery, setSubmittedQuery] = useState(() => {
    try { return sessionStorage.getItem("search_submitted") ?? ""; } catch { return ""; }
  });
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem("search_query", query); } catch {}
  }, [query]);

  useEffect(() => {
    try { sessionStorage.setItem("search_submitted", submittedQuery); } catch {}
  }, [submittedQuery]);

  const { data: cups = [] } = useQuery<Cup[]>({
    queryKey: ["cups"],
    queryFn: () =>
      getPocketBase().collection("cups").getFullList({ sort: "name" })
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

  const { data: storeData, isFetching: storesLoading } = useQuery({
    queryKey: ["search-stores", submittedQuery],
    queryFn: () =>
      fetch(`/api/search-stores?q=${encodeURIComponent(submittedQuery)}`).then((r) => r.json()),
    enabled: !!submittedQuery,
  });

  const stores: NearbyStore[] = useMemo(() => storeData?.stores ?? [], [storeData]);

  const { onScroll: onSearchScroll } = useScrollRestoration("search_scroll", stores.length > 0, mainRef);

  const ownedCupIds = useMemo(() => new Set(ownedCups.map((o) => o.cup_id)), [ownedCups]);

  const cupsWithOwnership = useMemo<CupWithOwnership[]>(() =>
    cups
      .filter(
        (c) =>
          isDisplayableCup(c, prefs)
      )
      .map((cup) => ({
        ...cup,
        isOwned: ownedCupIds.has(cup.id),
        ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
      })),
    [cups, ownedCups, ownedCupIds, prefs]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) setSubmittedQuery(q);
  };

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <div className="mb-3">
          <h1 className="font-bold text-lg leading-tight">Find Stores</h1>
          {session?.user?.householdName && (
            <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="City or address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              data-1p-ignore
              className="w-full rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={() => { setQuery(""); setSubmittedQuery(""); }}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-opacity ${query ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>
          <button
            type="submit"
            disabled={!query.trim()}
            className="px-4 py-2 bg-gold text-green-dark text-sm font-semibold rounded-lg disabled:opacity-40"
          >
            Search
          </button>
        </form>
      </header>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto pt-3 pb-24"
        onScroll={onSearchScroll}
      >
        {!submittedQuery && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16 px-6">
            <div className="text-3xl mb-3">☕</div>
            <p className="text-sm">Search a city to find nearby Starbucks stores and the cups available there.</p>
            <p className="text-xs mt-2 opacity-70">Try "Nashville, TN" or "Paris, France"</p>
          </div>
        )}

        {submittedQuery && storesLoading && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">
            Searching for stores in {submittedQuery}…
          </div>
        )}

        {submittedQuery && !storesLoading && stores.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16 px-6 text-sm">
            No Starbucks stores found near &ldquo;{submittedQuery}&rdquo;.
          </div>
        )}

        {!storesLoading && stores.length > 0 && (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500 px-4 mb-3">
              {stores.length} store{stores.length !== 1 ? "s" : ""} near {submittedQuery}
            </p>
            {stores.map((store) => (
              <StoreCard key={store.place_id} store={store} cups={cupsWithOwnership} />
            ))}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
