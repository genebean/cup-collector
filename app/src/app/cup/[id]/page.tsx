"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getPocketBase, getFileUrl } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import type { Cup, OwnedCup, NearbyStore, Household } from "@/types";

export default function CupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [household, setHousehold] = useState<Household | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  // Resolve household and write permission for this user
  useEffect(() => {
    if (!session?.user?.pocketIdSub) return;
    const pb = getPocketBase();
    const sub = session.user.pocketIdSub;
    pb.collection("households")
      .getFirstListItem<Household>(`member_sub_1="${sub}" || member_sub_2="${sub}" || viewer_subs~"${sub}"`)
      .then((h) => {
        setHousehold(h);
        setCanWrite(h.member_sub_1 === sub || h.member_sub_2 === sub);
      })
      .catch(() => {});
  }, [session]);

  const { data: cup, isLoading } = useQuery<Cup>({
    queryKey: ["cup", id],
    queryFn: () => getPocketBase().collection("cups").getOne<Cup>(id),
  });

  const { data: ownedRecord } = useQuery<OwnedCup | null>({
    queryKey: ["owned_cup", id, household?.id],
    queryFn: async () => {
      if (!household) return null;
      try {
        return await getPocketBase()
          .collection("owned_cups")
          .getFirstListItem<OwnedCup>(`cup_id="${id}" && household_id="${household.id}"`);
      } catch {
        return null; // Record not found = not owned
      }
    },
    enabled: !!household,
  });

  const isOwned = !!ownedRecord;

  // Fetch nearby Starbucks using the cup's city coordinates
  const { data: storesData } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores-cup", cup?.lat, cup?.lng],
    queryFn: () =>
      fetch(`/api/nearby-starbucks?lat=${cup!.lat}&lng=${cup!.lng}&radius=3000`).then((r) =>
        r.json()
      ),
    enabled: !!cup?.lat && !!cup?.lng,
  });

  // Mark as owned — optimistic UI: button reflects new state immediately
  const markOwned = useMutation({
    mutationFn: () =>
      fetch("/api/owned-cups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: id }),
      }).then((r) => { if (!r.ok) throw new Error("Failed to mark owned"); return r.json(); }),
    onMutate: async () => {
      // Optimistically set as owned before server confirms
      await queryClient.cancelQueries({ queryKey: ["owned_cup", id, household?.id] });
      queryClient.setQueryData(["owned_cup", id, household?.id], { id: "optimistic" });
    },
    onError: () => {
      // Roll back on error
      queryClient.setQueryData(["owned_cup", id, household?.id], null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, household?.id] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", household?.id] });
    },
  });

  // Remove from collection — optimistic UI
  const removeOwned = useMutation({
    mutationFn: () =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, { method: "DELETE" })
        .then((r) => { if (!r.ok) throw new Error("Failed to remove"); }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["owned_cup", id, household?.id] });
      queryClient.setQueryData(["owned_cup", id, household?.id], null);
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", id, household?.id], ownedRecord);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, household?.id] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", household?.id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading…
      </div>
    );
  }

  if (!cup) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Cup not found.
      </div>
    );
  }

  const imageUrl = cup.image
    ? getFileUrl(cup.collectionId, cup.id, cup.image)
    : null;

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-green-dark text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-xl">←</button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{cup.city}</h1>
          <p className="text-xs text-white/60">{cup.series} · {cup.year}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Hero image */}
        <div className="w-full h-56 bg-green-starbucks flex items-center justify-center">
          {imageUrl ? (
            <Image src={imageUrl} alt={`${cup.city} cup`} fill className="object-contain" unoptimized />
          ) : (
            <span className="text-white text-6xl font-bold opacity-30">
              {cup.city.charAt(0)}
            </span>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Metadata */}
          <div className="bg-white rounded-xl p-4 space-y-2 text-sm">
            <Row label="City" value={cup.city} />
            {cup.region && <Row label="Region" value={cup.region} />}
            <Row label="Country" value={cup.country} />
            <Row label="Series" value={cup.series} />
            <Row label="Year" value={String(cup.year)} />
            {cup.notes && <Row label="Notes" value={cup.notes} />}
          </div>

          {/* Ownership toggle — hidden from viewers */}
          {canWrite && (
            <div>
              {isOwned ? (
                <button
                  onClick={() => removeOwned.mutate()}
                  disabled={removeOwned.isPending}
                  className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 font-semibold"
                >
                  {removeOwned.isPending ? "Removing…" : "Remove from Collection"}
                </button>
              ) : (
                <button
                  onClick={() => markOwned.mutate()}
                  disabled={markOwned.isPending}
                  className="w-full py-3 rounded-xl bg-green-starbucks text-white font-semibold"
                >
                  {markOwned.isPending ? "Saving…" : "✓ Mark as Owned"}
                </button>
              )}
            </div>
          )}

          {/* Nearby Starbucks */}
          {storesData?.stores && storesData.stores.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-700 mb-2">Nearby Starbucks</h2>
              <div className="space-y-2">
                {storesData.stores.map((store) => (
                  <div key={store.place_id} className="bg-white rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{store.name}</div>
                      <div className="text-xs text-gray-500">{store.address}</div>
                    </div>
                    <a
                      href={`https://maps.apple.com/?daddr=${store.lat},${store.lng}&dirflg=d`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-3 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium flex-shrink-0"
                    >
                      Maps →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
