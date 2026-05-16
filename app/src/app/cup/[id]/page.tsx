"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { getPocketBase, getFileUrl } from "@/lib/pocketbase";
import { useNearbyRadius } from "@/hooks/useNearbyRadius";
import { BottomNav } from "@/components/BottomNav";
import type { Cup, OwnedCup, NearbyStore } from "@/types";

export default function CupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const householdId = session?.user?.householdId ?? null;

  // Condition edit state — null = form closed; object = form open with draft values.
  // Initialized from ownedRecord when the user opens the form, so no useEffect sync needed.
  const [conditionDraft, setConditionDraft] = useState<{
    needs_replacing: boolean;
    replacement_note: string;
    acquired_store_name: string;
    acquired_store_address: string;
  } | null>(null);
  const editingCondition = conditionDraft !== null;

  // Confirmation prompt for overwriting an already-recorded acquisition store
  const [storeConfirm, setStoreConfirm] = useState<{
    text: string;
    onConfirm: () => void;
  } | null>(null);

  const canWrite = session?.user?.householdRole === "owner";
  const { radiusMeters } = useNearbyRadius();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const { data: cup, isLoading } = useQuery<Cup>({
    queryKey: ["cup", id],
    queryFn: () => getPocketBase().collection("cups").getOne<Cup>(id),
  });

  const { data: ownedRecord } = useQuery<OwnedCup | null>({
    queryKey: ["owned_cup", id, householdId],
    queryFn: async () => {
      if (!householdId) return null;
      try {
        return await getPocketBase()
          .collection("owned_cups")
          .getFirstListItem<OwnedCup>(`cup_id="${id}" && household_id="${householdId}"`);
      } catch {
        return null; // Record not found = not owned
      }
    },
    enabled: !!householdId,
  });

  const isOwned = !!ownedRecord;

  // Fetch nearby Starbucks using the cup's city coordinates
  const { data: storesData } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores-cup", cup?.lat, cup?.lng, radiusMeters],
    queryFn: () =>
      fetch(`/api/nearby-starbucks?lat=${cup!.lat}&lng=${cup!.lng}&radius=${radiusMeters}`).then((r) =>
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
      await queryClient.cancelQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.setQueryData(["owned_cup", id, householdId], { id: "optimistic" });
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", id, householdId], null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  // Remove from collection — optimistic UI
  const removeOwned = useMutation({
    mutationFn: () =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, { method: "DELETE" })
        .then((r) => { if (!r.ok) throw new Error("Failed to remove"); }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.setQueryData(["owned_cup", id, householdId], null);
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", id, householdId], ownedRecord);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  // Update condition + optional store info on an existing owned record
  const updateCondition = useMutation({
    mutationFn: (update: { needs_replacing: boolean; replacement_note: string; acquired_store_name: string; acquired_store_address: string }) =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      }).then((r) => { if (!r.ok) throw new Error("Failed to update condition"); return r.json(); }),
    onSettled: () => {
      setConditionDraft(null);
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  // Record the Starbucks where the cup was acquired — pre-populated from the nearby list
  const recordStore = useMutation({
    mutationFn: (store: NearbyStore) =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acquired_store_name: store.name,
          acquired_store_address: store.address,
          acquired_store_lat: store.lat,
          acquired_store_lng: store.lng,
        }),
      }).then((r) => { if (!r.ok) throw new Error("Failed to record store"); return r.json(); }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
    },
  });

  // Mark as owned AND record acquisition store in one action (for unowned cups)
  const markOwnedAtStore = useMutation({
    mutationFn: async (store: NearbyStore) => {
      const r1 = await fetch("/api/owned-cups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: id }),
      });
      if (!r1.ok) throw new Error("Failed to mark owned");
      const newRecord = await r1.json();
      const r2 = await fetch(`/api/owned-cups?id=${newRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acquired_store_name: store.name,
          acquired_store_address: store.address,
          acquired_store_lat: store.lat,
          acquired_store_lng: store.lng,
        }),
      });
      if (!r2.ok) throw new Error("Failed to record store");
      return r2.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.setQueryData(["owned_cup", id, householdId], { id: "optimistic" });
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", id, householdId], null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  // Upload personal photo for an owned cup
  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("own_photo", file);
      const r = await fetch(`/api/owned-cups?id=${ownedRecord!.id}`, {
        method: "PATCH",
        body: form,
      });
      if (!r.ok) throw new Error("Failed to upload photo");
      return r.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", id, householdId] });
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

  const ownPhotoUrl = ownedRecord?.own_photo
    ? getFileUrl(ownedRecord.collectionId, ownedRecord.id, ownedRecord.own_photo)
    : null;
  const imageUrl = ownPhotoUrl ?? (cup.image
    ? getFileUrl(cup.collectionId, cup.id, cup.image)
    : null);

  return (
    <div className="flex flex-col h-screen dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-xl">←</button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{cup.city}</h1>
          <p className="text-xs text-white/60">{cup.series} · {cup.year}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Hero image — shows own_photo when present, falls back to catalog image.
            Tapping the image when one exists opens a full-size lightbox. */}
        <div
          className={`relative w-full h-56 bg-green-starbucks flex items-center justify-center ${imageUrl ? "cursor-zoom-in" : ""}`}
          onClick={() => { if (imageUrl) setLightboxOpen(true); }}
        >
          {imageUrl ? (
            <Image src={imageUrl} alt={`${cup.city} cup`} fill className="object-contain" unoptimized />
          ) : (
            <span className="text-white text-6xl font-bold opacity-30">
              {cup.city.charAt(0)}
            </span>
          )}
          {/* Camera button — owners only, visible once the real owned record is confirmed */}
          {canWrite && isOwned && ownedRecord && ownedRecord.id !== "optimistic" && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto.mutate(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
                disabled={uploadPhoto.isPending}
                aria-label="Upload personal photo"
                className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadPhoto.isPending ? (
                  <span className="text-xs">…</span>
                ) : (
                  <span className="text-base">📷</span>
                )}
              </button>
            </>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Metadata */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
            <Row label="City" value={cup.city} />
            {cup.region && <Row label="Region" value={cup.region} />}
            <Row label="Country" value={cup.country} />
            <Row label="Series" value={cup.series} />
            <Row label="Year" value={String(cup.year)} />
            {cup.notes && <Row label="Notes" value={cup.notes} />}
          </div>

          {/* Mark as Owned — standalone; only shown when not owned */}
          {canWrite && !isOwned && (
            <button
              onClick={() => markOwned.mutate()}
              disabled={markOwned.isPending}
              className="w-full py-3 bg-gold text-green-dark font-bold rounded-xl cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {markOwned.isPending ? "Saving…" : "✓ Mark as Owned"}
            </button>
          )}

          {/* Owned state: unified card with condition info + remove button.
              Condition section only appears once the optimistic record is replaced.
              Read-only view is shown to all roles; edit controls are owner-only. */}
          {isOwned && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-sm">
              {ownedRecord && ownedRecord.id !== "optimistic" && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-700 dark:text-gray-200">Condition</h2>
                    {canWrite && !editingCondition && (
                      <button
                        onClick={() => setConditionDraft({
                          needs_replacing: ownedRecord.needs_replacing ?? false,
                          replacement_note: ownedRecord.replacement_note ?? "",
                          acquired_store_name: ownedRecord.acquired_store_name ?? "",
                          acquired_store_address: ownedRecord.acquired_store_address ?? "",
                        })}
                        className="text-xs text-green-starbucks font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {canWrite && editingCondition && conditionDraft ? (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={conditionDraft.needs_replacing}
                          onChange={(e) =>
                            setConditionDraft((d) => d ? {
                              ...d,
                              needs_replacing: e.target.checked,
                              replacement_note: e.target.checked ? d.replacement_note : "",
                            } : d)
                          }
                          className="rounded"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Needs replacing</span>
                      </label>

                      {conditionDraft.needs_replacing && (
                        <input
                          type="text"
                          placeholder="Reason (optional) — e.g. cracked lid"
                          value={conditionDraft.replacement_note}
                          onChange={(e) =>
                            setConditionDraft((d) => d ? { ...d, replacement_note: e.target.value } : d)
                          }
                          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-green-starbucks"
                        />
                      )}

                      {/* Manual acquisition store entry */}
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Where acquired</p>
                        <input
                          type="text"
                          placeholder="Store name"
                          value={conditionDraft.acquired_store_name}
                          onChange={(e) =>
                            setConditionDraft((d) => d ? { ...d, acquired_store_name: e.target.value } : d)
                          }
                          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-green-starbucks"
                        />
                        <input
                          type="text"
                          placeholder="Address"
                          value={conditionDraft.acquired_store_address}
                          onChange={(e) =>
                            setConditionDraft((d) => d ? { ...d, acquired_store_address: e.target.value } : d)
                          }
                          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-green-starbucks"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setConditionDraft(null)}
                          className="flex-1 py-2 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            const hadStore = !!ownedRecord.acquired_store_name;
                            const nameChanged = conditionDraft.acquired_store_name !== (ownedRecord.acquired_store_name ?? "");
                            const addrChanged = conditionDraft.acquired_store_address !== (ownedRecord.acquired_store_address ?? "");
                            if (hadStore && (nameChanged || addrChanged)) {
                              setStoreConfirm({
                                text: `Replace "${ownedRecord.acquired_store_name}" with "${conditionDraft.acquired_store_name || "(none)"}"?`,
                                onConfirm: () => { updateCondition.mutate(conditionDraft); setStoreConfirm(null); },
                              });
                            } else {
                              updateCondition.mutate(conditionDraft);
                            }
                          }}
                          disabled={updateCondition.isPending}
                          className="flex-1 py-2 bg-green-dark text-white rounded-lg text-sm font-medium cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updateCondition.isPending ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {ownedRecord.needs_replacing ? (
                        <div className="text-orange-600 dark:text-orange-400 font-medium">
                          ⚠ Needs replacing
                          {ownedRecord.replacement_note && (
                            <span className="font-normal text-gray-500 dark:text-gray-400"> — {ownedRecord.replacement_note}</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-green-starbucks font-medium">✓ In good condition</div>
                      )}
                      {ownedRecord.acquired_store_name && (
                        <div className="text-xs mt-1 space-y-0.5">
                          <div className="text-gray-500 dark:text-gray-400">
                            Acquired at: {ownedRecord.acquired_store_name}
                          </div>
                          {ownedRecord.acquired_store_address && (
                            <a
                              href={
                                ownedRecord.acquired_store_lat && ownedRecord.acquired_store_lng
                                  ? `https://maps.apple.com/?daddr=${ownedRecord.acquired_store_lat},${ownedRecord.acquired_store_lng}&dirflg=d`
                                  : `https://maps.apple.com/?q=${encodeURIComponent(ownedRecord.acquired_store_address)}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 underline block"
                            >
                              {ownedRecord.acquired_store_address}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {canWrite && <div className="border-t border-gray-100 dark:border-gray-700 mt-4 mb-1" />}
                </>
              )}

              {canWrite && (
                <button
                  onClick={() => removeOwned.mutate()}
                  disabled={removeOwned.isPending}
                  className="w-full py-2.5 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removeOwned.isPending ? "Removing…" : "Remove from Collection"}
                </button>
              )}
            </div>
          )}

          {/* Nearby Starbucks.
              When the cup is owned, each store row includes an "Acquired here" button
              to record where the cup was obtained. */}
          {storesData?.stores && storesData.stores.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Nearby Starbucks</h2>
              <div className="space-y-2">
                {storesData.stores.map((store) => {
                  // Match by name AND coordinates — names like "Starbucks Coffee Company" are
                  // not unique, but lat/lng are. Both come from the same Places API response
                  // so exact equality is safe here.
                  const isAcquiredHere =
                    ownedRecord?.acquired_store_name === store.name &&
                    ownedRecord?.acquired_store_lat === store.lat &&
                    ownedRecord?.acquired_store_lng === store.lng;
                  return (
                    <div key={store.place_id} className="bg-white dark:bg-gray-800 rounded-xl p-3 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium dark:text-gray-100">{store.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{store.address}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Record acquisition store — only shown when owned and can write */}
                        {canWrite && (!isOwned || (ownedRecord && ownedRecord.id !== "optimistic")) && (
                          <button
                            onClick={() => {
                              if (!isOwned) {
                                markOwnedAtStore.mutate(store);
                              } else {
                                const hasOther = !!ownedRecord!.acquired_store_name && !isAcquiredHere;
                                if (hasOther) {
                                  setStoreConfirm({
                                    text: `Replace "${ownedRecord!.acquired_store_name}" with "${store.name}"?`,
                                    onConfirm: () => { recordStore.mutate(store); setStoreConfirm(null); },
                                  });
                                } else {
                                  recordStore.mutate(store);
                                }
                              }
                            }}
                            disabled={recordStore.isPending || markOwnedAtStore.isPending}
                            title={isAcquiredHere ? "Recorded as acquisition store" : "Mark as where this cup was acquired"}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              isAcquiredHere
                                ? "bg-green-100 dark:bg-green-900/30 text-green-starbucks"
                                : "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-starbucks"
                            }`}
                          >
                            {isAcquiredHere ? "✓ Acquired here" : "Acquired here"}
                          </button>
                        )}
                        <a
                          href={`https://maps.apple.com/?daddr=${store.lat},${store.lng}&dirflg=d`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-medium"
                        >
                          Maps →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Overwrite-store confirmation modal */}
      {storeConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-8 sm:pb-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">{storeConfirm.text}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStoreConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={storeConfirm.onConfirm}
                className="flex-1 py-2.5 bg-green-dark text-white rounded-xl text-sm font-semibold cursor-pointer hover:brightness-110"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — full-size image, scales down to fit, never upscales */}
      {lightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          aria-label="Close full-size image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${cup.city} cup — full size`}
            style={{ maxWidth: "100vw", maxHeight: "100dvh", width: "auto", height: "auto", objectFit: "contain" }}
          />
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}
