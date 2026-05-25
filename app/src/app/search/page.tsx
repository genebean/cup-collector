"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { CupCard } from "@/components/CupCard";
import { groupByVariant } from "@/lib/variants";
import type { Cup, OwnedCup, CupWithOwnership } from "@/types";

export default function SearchPage() {
  const { data: session } = useSession();
  const householdId = session?.user?.householdId ?? null;
  const [search, setSearch] = useState("");

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

  const ownedCupIds = useMemo(() => new Set(ownedCups.map((o) => o.cup_id)), [ownedCups]);

  const resultGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    const matched = cups
      .filter(
        (c) =>
          (!c.is_duplicate || ownedCupIds.has(c.id)) &&
          (
            c.name.toLowerCase().includes(q) ||
            c.country.toLowerCase().includes(q) ||
            c.series.toLowerCase().includes(q) ||
            c.region?.toLowerCase().includes(q)
          )
      )
      .map((cup): CupWithOwnership => ({
        ...cup,
        isOwned: ownedCupIds.has(cup.id),
        ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
      }));
    return groupByVariant(matched);
  }, [cups, ownedCups, ownedCupIds, search]);

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <div className="mb-2">
          <h1 className="font-bold text-lg leading-tight">Search</h1>
          {session?.user?.householdName && (
            <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
          )}
        </div>
        <input
          type="search"
          placeholder="City, country, or series…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-hidden"
        />
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {!search.trim() ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">Start typing to search cups.</div>
        ) : resultGroups.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16">No cups found for &ldquo;{search}&rdquo;.</div>
        ) : (
          resultGroups.map(({ base, members }) => (
            <CupCard
              key={base.id}
              cup={base}
              variantCount={members.length > 1 ? members.length : undefined}
              ownedVariants={members.filter((c) => c.isOwned).length}
            />
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
}
