"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import { CupCard } from "@/components/CupCard";
import type { Cup, OwnedCup, CupWithOwnership } from "@/types";

export default function SearchPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [householdId, setHouseholdId] = useState<string | null>(null);

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
      getPocketBase().collection("cups").getFullList({ sort: "city" })
        .then((r) => r as Cup[]),
  });

  const { data: ownedCups = [] } = useQuery<OwnedCup[]>({
    queryKey: ["owned_cups", householdId],
    queryFn: () =>
      getPocketBase().collection("owned_cups")
        .getFullList({ filter: `household_id="${householdId}"` })
        .then((r) => r as OwnedCup[]),
    enabled: !!householdId,
  });

  const ownedCupIds = new Set(ownedCups.map((o) => o.cup_id));

  const results: CupWithOwnership[] = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return cups
      .filter(
        (c) =>
          c.city.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          c.series.toLowerCase().includes(q) ||
          c.region?.toLowerCase().includes(q)
      )
      .map((cup) => ({
        ...cup,
        isOwned: ownedCupIds.has(cup.id),
        ownedRecord: ownedCups.find((o) => o.cup_id === cup.id),
      }));
  }, [cups, ownedCups, ownedCupIds, search]);

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-green-dark text-white px-4 py-3 flex-shrink-0">
        <h1 className="font-bold text-lg mb-2">Search</h1>
        <input
          type="search"
          placeholder="City, country, or series…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-none"
        />
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {!search.trim() ? (
          <div className="text-center text-gray-400 py-16">Start typing to search cups.</div>
        ) : results.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No cups found for &ldquo;{search}&rdquo;.</div>
        ) : (
          results.map((cup) => <CupCard key={cup.id} cup={cup} />)
        )}
      </main>

      <BottomNav />
    </div>
  );
}
