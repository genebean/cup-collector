"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { countryCodeToFlag } from "@/lib/country";
import { toCupSlug } from "@/lib/slug";
import type { Cup, OwnedCup, CollectionPrefs } from "@/types";

const EMPTY_PREFS: CollectionPrefs = {};

// Derive a display-friendly theme group from a themed cup's notes/series/venue fields.
function getThemeGroup(cup: Cup): string {
  const notes = cup.notes?.toLowerCase() ?? "";
  const series = cup.series?.toLowerCase() ?? "";
  if (notes.includes("star wars")) return "Star Wars";
  if (notes.includes("avengers campus") || notes.includes("black panther") || series === "been there marvel") return "Marvel";
  if (notes.includes("cruise ship")) return "Cruise Ships";
  if (cup.venue_series === "Been There Disney Parks") return "Disney Parks";
  if (cup.venue_series) return cup.venue_series;
  return cup.series;
}

function readStatsDrill(): { country: { name: string; code: string } | null; region: string | null; theme: string | null } {
  try {
    const saved = JSON.parse(sessionStorage.getItem("stats_drill") ?? "{}");
    return { country: saved.country ?? null, region: saved.region ?? null, theme: saved.theme ?? null };
  } catch { return { country: null, region: null, theme: null }; }
}
const R_LARGE = 45;
const R_SMALL = 32;
const CIRC_LARGE = 2 * Math.PI * R_LARGE;
const CIRC_SMALL = 2 * Math.PI * R_SMALL;

function CupSvg({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 34" fill="currentColor" className={className} aria-hidden="true">
      <rect x="3" y="3" width="26" height="4" rx="2" />
      <path d="M4 7h25l-2.5 19H6.5L4 7z" />
      <path d="M29 10 Q38 10 38 18 Q38 26 29 26"
        fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function OrnamentSvg({ className = "" }: { className?: string }) {
  // Cup is rotated -45° around (20,34) so the handle sits at upper-right.
  // Handle tip (36,32) maps to ≈(30,21) after rotation — string starts there.
  return (
    <svg viewBox="0 0 50 52" fill="currentColor" className={className} aria-hidden="true">
      {/* small hanging ring at top */}
      <circle cx="34" cy="4" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* string from ring down to handle tip */}
      <line x1="34" y1="6.5" x2="30" y2="21"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* cup rotated -45° so handle is on the high (upper-right) side */}
      <g transform="rotate(-45, 20, 34)">
        <rect x="4" y="24" width="24" height="4" rx="1.5" />
        <path d="M5 28h22l-2 13H7L5 28z" />
        <path d="M27 26 Q36 26 36 32 Q36 38 27 38"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function ProgressRing({
  owned, total, size, label, icon,
}: {
  owned: number; total: number; size: "large" | "small";
  label: string; icon: React.ReactNode;
}) {
  const r = size === "large" ? R_LARGE : R_SMALL;
  const circumference = size === "large" ? CIRC_LARGE : CIRC_SMALL;
  const dim = size === "large" ? 140 : 104;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  const offset = circumference * (1 - owned / Math.max(total, 1));

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} viewBox="0 0 120 120" className="-rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor"
            className="text-gray-100 dark:text-gray-700" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10"
            stroke="currentColor" className="text-green-starbucks"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-green-starbucks ${size === "large" ? "w-10 h-10" : "w-7 h-7"}`}>
            {icon}
          </div>
        </div>
      </div>
      <div className="mt-1 text-center">
        <div className={`font-bold text-gray-900 dark:text-gray-100 ${size === "large" ? "text-4xl" : "text-2xl"}`}>
          {pct}%
        </div>
        <div className={`text-gray-500 dark:text-gray-400 mt-0.5 ${size === "large" ? "text-sm" : "text-xs"}`}>
          {owned} of {total}
        </div>
        <div className={`font-semibold text-gray-600 dark:text-gray-300 mt-0.5 ${size === "large" ? "text-sm" : "text-xs"}`}>
          {label}
        </div>
      </div>
    </div>
  );
}

const SERIES_LABELS = [
  { series: "You Are Here", label: "You Are Here" },
  { series: "Been There", label: "Been There" },
  { series: "Discovery Series", label: "Discovery Series" },
];

const SERIES_CHIPS = [
  { value: "all", label: "All" },
  { value: "You Are Here", label: "You Are Here" },
  { value: "Been There", label: "Been There" },
  { value: "Discovery Series", label: "Discovery" },
];

export default function StatsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const householdId = session?.user?.householdId ?? null;
  const didRestoreScroll = useRef(false);

  const [countrySeries, setCountrySeries] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; code: string } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

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

  // Save window scroll position for back-navigation restore
  useEffect(() => {
    const handler = () => {
      try { sessionStorage.setItem("stats_scroll", String(Math.round(window.scrollY))); } catch {}
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Restore drill-down state post-mount, but ONLY when returning from a cup detail page.
  // Same flag pattern as browse: markCupNavigation sets stats_return_pending before navigating.
  useEffect(() => {
    const returning = sessionStorage.getItem("stats_return_pending") === "1";
    sessionStorage.removeItem("stats_return_pending");
    if (returning) {
      try {
        const saved = readStatsDrill();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved.country) setSelectedCountry(saved.country);
        if (saved.region) setSelectedRegion(saved.region);
        if (saved.theme) setSelectedTheme(saved.theme);
      } catch {}
    }
  }, []);

  // Persist drill-down state so returning from a cup detail restores the same level.
  useEffect(() => {
    try {
      sessionStorage.setItem("stats_drill", JSON.stringify({
        country: selectedCountry, region: selectedRegion, theme: selectedTheme,
      }));
    } catch {}
  }, [selectedCountry, selectedRegion, selectedTheme]);

  const markCupNavigation = useCallback(() => {
    try { sessionStorage.setItem("stats_return_pending", "1"); } catch {}
  }, []);

  // Restore scroll once data loads (after navigating back from cup detail)
  useEffect(() => {
    if (didRestoreScroll.current || cups.length === 0) return;
    requestAnimationFrame(() => {
      try {
        const pos = Number(sessionStorage.getItem("stats_scroll") ?? 0);
        if (pos > 0) window.scrollTo(0, pos);
      } catch {}
    });
    didRestoreScroll.current = true;
  }, [cups]);

  const ownedCupIds = useMemo(() => new Set(ownedCups.map((o) => o.cup_id)), [ownedCups]);

  const displayable = useMemo(() => cups.filter((c) => {
    if (ownedCupIds.has(c.id)) return true;
    if (c.is_duplicate) return false;
    if (prefs.excluded_series?.includes(c.series)) return false;
    if (prefs.excluded_types?.includes(c.item_type || "mug")) return false;
    return true;
  }), [cups, ownedCupIds, prefs]);

  const displayableMugs = useMemo(() =>
    displayable.filter((c) => (c.item_type || "mug") !== "ornament"),
    [displayable]);

  const displayableOrnaments = useMemo(() =>
    displayable.filter((c) => c.item_type === "ornament"),
    [displayable]);

  const tracksOrnaments = displayableOrnaments.length > 0;
  const mugRingSize = tracksOrnaments ? "small" : "large";

  // In collapsed mode (default), propagate variant ownership up to the base cup
  const statsOwnedIds = useMemo(() => {
    if (showVariants) return ownedCupIds;
    const result = new Set<string>(ownedCupIds);
    for (const c of cups) {
      if (c.variant_of && ownedCupIds.has(c.id)) result.add(c.variant_of);
    }
    return result;
  }, [cups, ownedCupIds, showVariants]);

  // In collapsed mode, only count base cups (variant_of === "") so each location = 1
  const statsMugs = useMemo(() =>
    showVariants
      ? displayableMugs
      : displayableMugs.filter((c) => !c.variant_of),
    [displayableMugs, showVariants]);

  const mugTotal = statsMugs.length;
  const mugOwned = statsMugs.filter((c) => statsOwnedIds.has(c.id)).length;

  const ornTotal = displayableOrnaments.length;
  const ornOwned = displayableOrnaments.filter((c) => ownedCupIds.has(c.id)).length;

  const seriesStats = useMemo(() => SERIES_LABELS.map(({ series, label }) => {
    // Exclude themed cups — they're in the Themed card, not By Series
    const subset = statsMugs.filter((c) => c.series === series && c.scope !== "themed");
    const tot = subset.length;
    const own = subset.filter((c) => statsOwnedIds.has(c.id)).length;
    return { label, tot, own };
  }), [statsMugs, statsOwnedIds]);

  const filteredMugs = useMemo(() => {
    // Exclude themed cups from the By Country card — they have no geographic data
    const base = statsMugs.filter((c) => c.scope !== "themed");
    return countrySeries === "all" ? base : base.filter((c) => c.series === countrySeries);
  }, [statsMugs, countrySeries]);

  // Themed cups grouped by derived theme — excludes city/state/country-scope cups
  const themedCupsData = useMemo(() => {
    const themed = displayableMugs.filter((c) => c.scope === "themed");
    const base = showVariants ? themed : themed.filter((c) => !c.variant_of);
    const map = new Map<string, Cup[]>();
    for (const c of base) {
      const group = getThemeGroup(c);
      const list = map.get(group) ?? [];
      list.push(c);
      map.set(group, list);
    }
    return [...map.entries()]
      .map(([theme, cups]) => ({
        theme,
        cups: cups.sort((a, b) => a.name.localeCompare(b.name)),
        tot: cups.length,
        own: cups.filter((c) => statsOwnedIds.has(c.id)).length,
      }))
      .sort((a, b) => b.own - a.own || b.tot - a.tot);
  }, [displayableMugs, statsOwnedIds, showVariants]);

  const countryStats = useMemo(() => {
    const map = new Map<string, { code: string; tot: number; own: number }>();
    for (const c of filteredMugs) {
      if (!c.country) continue;
      const s = map.get(c.country) ?? { code: c.country_code, tot: 0, own: 0 };
      s.tot++;
      if (statsOwnedIds.has(c.id)) s.own++;
      map.set(c.country, s);
    }
    return [...map.entries()]
      .map(([country, s]) => ({ country, ...s }))
      .sort((a, b) => b.own - a.own || b.tot - a.tot)
      .slice(0, 12);
  }, [filteredMugs, statsOwnedIds]);

  const regionStats = useMemo(() => {
    if (!selectedCountry) return [];
    const map = new Map<string, { tot: number; own: number }>();
    for (const c of filteredMugs) {
      if (c.country !== selectedCountry.name) continue;
      const region = c.region || "Other";
      const s = map.get(region) ?? { tot: 0, own: 0 };
      s.tot++;
      if (statsOwnedIds.has(c.id)) s.own++;
      map.set(region, s);
    }
    return [...map.entries()]
      .map(([region, s]) => ({ region, ...s }))
      .sort((a, b) => a.region.localeCompare(b.region));
  }, [filteredMugs, statsOwnedIds, selectedCountry]);

  // State/province-level cups for the selected region (shown as a summary header in the city view)
  const regionScopeCups = useMemo(() => {
    if (!selectedCountry || !selectedRegion) return [];
    return filteredMugs.filter(
      (c) => c.scope === "state" && c.name === selectedRegion && c.country === selectedCountry.name
    );
  }, [filteredMugs, selectedCountry, selectedRegion]);

  // City breakdown within the selected region
  const cityStats = useMemo(() => {
    if (!selectedCountry || !selectedRegion) return [];
    // Variants share their base cup's name so they roll up under the same city row
    const baseNameById = new Map(cups.map((c) => [c.id, c.name]));
    const baseCupById = new Map(cups.map((c) => [c.id, c]));
    const map = new Map<string, { tot: number; own: number; baseCup: Cup; allCups: Cup[] }>();
    for (const c of filteredMugs) {
      if (c.scope !== "city") continue;
      if (c.country !== selectedCountry.name) continue;
      if (c.region !== selectedRegion) continue;
      const key = c.variant_of ? (baseNameById.get(c.variant_of) ?? c.name) : c.name;
      const baseCup = c.variant_of ? (baseCupById.get(c.variant_of) ?? c) : c;
      const s = map.get(key) ?? { tot: 0, own: 0, baseCup, allCups: [] };
      s.tot++;
      s.allCups.push(c);
      if (statsOwnedIds.has(c.id)) s.own++;
      map.set(key, s);
    }
    return [...map.entries()]
      .map(([city, s]) => ({ city, ...s }))
      .sort((a, b) => a.city.localeCompare(b.city));
  }, [cups, filteredMugs, statsOwnedIds, selectedCountry, selectedRegion]);

  const ornamentCountryStats = useMemo(() => {
    const map = new Map<string, { code: string; tot: number; own: number }>();
    for (const c of displayableOrnaments) {
      if (!c.country) continue;
      const s = map.get(c.country) ?? { code: c.country_code, tot: 0, own: 0 };
      s.tot++;
      if (ownedCupIds.has(c.id)) s.own++;
      map.set(c.country, s);
    }
    return [...map.entries()]
      .map(([country, s]) => ({ country, ...s }))
      .sort((a, b) => b.tot - a.tot)
      .slice(0, 12);
  }, [displayableOrnaments, ownedCupIds]);

  const needsReplacing = ownedCups.filter((o) => o.needs_replacing).length;

  return (
    <div className="min-h-screen bg-cream dark:bg-gray-900">
      <OfflineBanner />

      <header className="bg-green-dark text-white px-4 py-3 header-safe-top sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-xl cursor-pointer">←</button>
        <h1 className="font-bold text-lg">Collection Stats</h1>
      </header>

      <main className="pb-24 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">

        {/* Progress rings */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="flex justify-center gap-10">
            <ProgressRing
              owned={mugOwned} total={mugTotal}
              size={mugRingSize} label="Mugs"
              icon={<CupSvg className="w-full h-full" />}
            />
            {tracksOrnaments && (
              <ProgressRing
                owned={ornOwned} total={ornTotal}
                size="small" label="Ornaments"
                icon={<OrnamentSvg className="w-full h-full" />}
              />
            )}
          </div>
          {needsReplacing > 0 && (
            <Link
              href="/browse?needs_replacing=1"
              className="text-xs text-orange-600 dark:text-orange-400 font-medium underline-offset-2 hover:underline"
            >
              ⚠ {needsReplacing} need{needsReplacing === 1 ? "s" : ""} replacing
            </Link>
          )}
        </div>

        {/* By Series */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">By Series</h2>
          {seriesStats.map(({ label, tot, own }) => {
            if (tot === 0) return null;
            const p = tot > 0 ? own / tot : 0;
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 dark:text-gray-300">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-starbucks rounded-full transition-all duration-500"
                    style={{ width: `${p * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Themed Cups — grouped by franchise/theme, one-level drill-down to individual cups */}
        {themedCupsData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              {selectedTheme ? (
                <>
                  <button
                    onClick={() => setSelectedTheme(null)}
                    className="text-green-starbucks font-semibold text-sm shrink-0"
                  >
                    ← Back
                  </button>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {selectedTheme}
                  </span>
                </>
              ) : (
                <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">Themed Cups</h2>
              )}
            </div>

            {selectedTheme ? (
              // Individual cups in the selected theme
              (() => {
                const entry = themedCupsData.find((e) => e.theme === selectedTheme);
                if (!entry) return null;
                return entry.cups.map((cup) => {
                  const isOwned = statsOwnedIds.has(cup.id);
                  return (
                    <Link
                      key={cup.id}
                      href={`/cup/${toCupSlug(cup)}`}
                      onClick={markCupNavigation}
                      className="flex items-center justify-between text-sm py-0.5"
                    >
                      <span className="text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate pr-2">{cup.name}</span>
                      <span className={`shrink-0 font-semibold text-xs px-2 py-0.5 rounded-full ${
                        isOwned
                          ? "bg-green-starbucks/10 text-green-starbucks"
                          : "bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-400"
                      }`}>
                        {isOwned ? "Owned ›" : "Not owned ›"}
                      </span>
                    </Link>
                  );
                });
              })()
            ) : (
              // Theme group list
              themedCupsData.map(({ theme, tot, own }) => {
                const p = tot > 0 ? own / tot : 0;
                return (
                  <button key={theme} className="w-full text-left" onClick={() => setSelectedTheme(theme)}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{theme}</span>
                      <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot} ›</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${p * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* By Country — mugs, with series filter + region drill-down */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3">
          {/* Card header */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedRegion ? (
              <>
                <button
                  onClick={() => setSelectedRegion(null)}
                  className="text-green-starbucks font-semibold text-sm shrink-0"
                >
                  ← Back
                </button>
                <span className="text-sm text-gray-400 dark:text-gray-500 shrink-0">
                  {countryCodeToFlag(selectedCountry!.code)} {selectedCountry!.name} ›
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {selectedRegion} · by city
                </span>
              </>
            ) : selectedCountry ? (
              <>
                <button
                  onClick={() => setSelectedCountry(null)}
                  className="text-green-starbucks font-semibold text-sm shrink-0"
                >
                  ← Back
                </button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {countryCodeToFlag(selectedCountry.code)} {selectedCountry.name} · by region
                </span>
              </>
            ) : (
              <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">By Country</h2>
            )}
          </div>

          {/* Series filter chips + Variants toggle */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {SERIES_CHIPS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setCountrySeries(value);
                  setSelectedCountry(null);
                  setSelectedRegion(null);
                }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  countrySeries === value
                    ? "bg-green-starbucks text-white border-green-starbucks font-semibold"
                    : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setShowVariants((v) => !v)}
              className={`ml-auto text-xs px-2.5 py-1 rounded-full border transition-colors ${
                showVariants
                  ? "bg-green-starbucks text-white border-green-starbucks font-semibold"
                  : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400"
              }`}
            >
              Variants
            </button>
          </div>

          {/* Country list, region list, or city drill-down */}
          <div className="space-y-3">
            {selectedRegion ? (
              <>
                {/* Region-scope cup summary (e.g. the Georgia state cup) */}
                {regionScopeCups.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2.5 space-y-1.5">
                    <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {selectedRegion} cup
                    </div>
                    {regionScopeCups.map((cup) => {
                      const isOwned = statsOwnedIds.has(cup.id);
                      return (
                        <Link key={cup.id} href={`/cup/${toCupSlug(cup)}`} onClick={markCupNavigation} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-300">{cup.series}{cup.year ? ` · ${cup.year}` : ""}</span>
                          <span className={`font-semibold text-xs px-2 py-0.5 rounded-full ${isOwned ? "bg-green-starbucks/10 text-green-starbucks" : "bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-400"}`}>
                            {isOwned ? "Owned ›" : "Not owned ›"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
                {/* City breakdown */}
                {cityStats.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No city cups in this region.</p>
                ) : (
                  cityStats.map(({ city, tot, own, baseCup, allCups }) => {
                    const p = tot > 0 ? own / tot : 0;
                    const isExpanded = expandedCity === city;

                    // Single cup — navigate directly (original behaviour)
                    if (tot === 1) {
                      return (
                        <Link key={city} href={`/cup/${toCupSlug(baseCup)}`} onClick={markCupNavigation} className="block">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700 dark:text-gray-300">{city}</span>
                            <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot} ›</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${p * 100}%` }} />
                          </div>
                        </Link>
                      );
                    }

                    // Multiple cups — expand inline to show each one
                    return (
                      <div key={city}>
                        <button className="w-full text-left" onClick={() => setExpandedCity(isExpanded ? null : city)}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700 dark:text-gray-300">{city}</span>
                            <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot} {isExpanded ? "▲" : "▼"}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${p * 100}%` }} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mt-1.5 ml-3 space-y-1 border-l-2 border-blue-200 dark:border-blue-800 pl-3">
                            {allCups.map((cup) => {
                              const isOwned = statsOwnedIds.has(cup.id);
                              return (
                                <Link
                                  key={cup.id}
                                  href={`/cup/${toCupSlug(cup)}`}
                                  onClick={markCupNavigation}
                                  className="flex items-center justify-between text-sm py-0.5"
                                >
                                  <span className="text-gray-600 dark:text-gray-300 truncate pr-2">
                                    {cup.series}{cup.year ? ` · ${cup.year}` : ""}
                                  </span>
                                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    isOwned
                                      ? "bg-green-starbucks/10 text-green-starbucks"
                                      : "bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-400"
                                  }`}>
                                    {isOwned ? "Owned ›" : "Not owned ›"}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            ) : selectedCountry ? (
              regionStats.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No region data available.</p>
              ) : (
                regionStats.map(({ region, tot, own }) => {
                  const p = tot > 0 ? own / tot : 0;
                  return (
                    <button
                      key={region}
                      className="w-full text-left"
                      onClick={() => { setSelectedRegion(region); setExpandedCity(null); }}
                    >
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{region}</span>
                        <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot} ›</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${p * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              )
            ) : (
              countryStats.map(({ country, code, tot, own }) => {
                const p = tot > 0 ? own / tot : 0;
                return (
                  <button
                    key={country}
                    className="w-full text-left"
                    onClick={() => setSelectedCountry({ name: country, code })}
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">
                        {countryCodeToFlag(code)} {country}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot} ›</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${p * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Ornaments by Country — separate card, only when tracking ornaments */}
        {tracksOrnaments && ornamentCountryStats.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <OrnamentSvg className="w-4 h-5 text-green-starbucks" />
              <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">Ornaments by Country</h2>
            </div>
            {ornamentCountryStats.map(({ country, code, tot, own }) => {
              const p = tot > 0 ? own / tot : 0;
              return (
                <div key={country}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">
                      {countryCodeToFlag(code)} {country}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 tabular-nums">{own}/{tot}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${p * 100}%` }}
                    />
                  </div>
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
