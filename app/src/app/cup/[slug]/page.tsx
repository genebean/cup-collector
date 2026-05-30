"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { getPocketBase, getFileUrl } from "@/lib/pocketbase";
import { looksLikeId } from "@/lib/slug";
import { findRepresentative } from "@/lib/variants";
import { useNearbyRadius } from "@/hooks/useNearbyRadius";
import { BottomNav } from "@/components/BottomNav";
import type { Cup, OwnedCup, NearbyStore } from "@/types";

export default function CupDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const householdId = session?.user?.householdId ?? null;

  // Support the legacy /cup/{id} path: detect a bare PocketBase ID and redirect
  // to the canonical slug URL once the cup has loaded.
  const isId = looksLikeId(slug);

  // storeConfirm is used by the nearby Starbucks "Acquired here" flow (solo cups only).
  const [storeConfirm, setStoreConfirm] = useState<{
    oldName: string;
    oldAddress: string;
    newName: string;
    newAddress: string;
    onConfirm: () => void;
  } | null>(null);

  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const canWrite = session?.user?.householdRole === "owner";
  const { radiusMeters } = useNearbyRadius();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const { data: cup, isLoading } = useQuery<Cup>({
    queryKey: ["cup", slug],
    queryFn: () =>
      isId
        ? getPocketBase().collection("cups").getOne<Cup>(slug)
        : getPocketBase().collection("cups").getFirstListItem<Cup>(`slug="${slug}"`),
  });

  // If we arrived via a bare PocketBase ID and the cup has a stored slug,
  // redirect to the canonical slug URL.
  useEffect(() => {
    if (isId && cup?.slug) router.replace(`/cup/${cup.slug}`);
  }, [isId, cup?.slug, router]);

  // ownedRecord for the URL cup — used by the Starbucks "Acquired here" section
  // (solo cups only) and to show own_photo in the hero for solo owned cups.
  const id = cup?.id ?? slug; // cup.id is stable once loaded; slug is the fallback for ID paths
  const { data: ownedRecord } = useQuery<OwnedCup | null>({
    queryKey: ["owned_cup", id, householdId],
    queryFn: async () => {
      if (!householdId) return null;
      try {
        return await getPocketBase()
          .collection("owned_cups")
          .getFirstListItem<OwnedCup>(`cup_id="${id}" && household_id="${householdId}"`);
      } catch {
        return null;
      }
    },
    enabled: !!householdId && !!cup,
  });

  const isOwned = !!ownedRecord;

  // For themed/fictional cups (lat=0, lng=0) use the device location so nearby
  // stores still populate — the user needs to record where they bought the cup.
  useEffect(() => {
    if (!cup || (cup.lat && cup.lng)) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    );
  }, [cup]);

  const storesLat = (cup?.lat && cup?.lng) ? cup.lat : userLocation?.lat;
  const storesLng = (cup?.lat && cup?.lng) ? cup.lng : userLocation?.lng;
  const { data: storesData } = useQuery<{ stores: NearbyStore[] }>({
    queryKey: ["nearby-stores-cup", storesLat, storesLng, radiusMeters],
    queryFn: () =>
      fetch(`/api/nearby-starbucks?lat=${storesLat}&lng=${storesLng}&radius=${radiusMeters}`).then((r) =>
        r.json()
      ),
    enabled: !!(storesLat && storesLng),
  });

  // Variant group — fetch all children of the base cup, and the base cup itself
  // when the current cup is itself a variant.
  const baseCupId = cup?.variant_of || cup?.id;
  const { data: groupChildren = [] } = useQuery<Cup[]>({
    queryKey: ["cup-children", baseCupId],
    queryFn: () =>
      getPocketBase().collection("cups").getFullList<Cup>({
        filter: `variant_of="${baseCupId}"`,
        sort: "name",
      }),
    enabled: !!baseCupId,
  });
  const { data: fetchedBase } = useQuery<Cup | undefined>({
    queryKey: ["cup-base", cup?.variant_of],
    queryFn: () => getPocketBase().collection("cups").getOne<Cup>(cup!.variant_of!),
    enabled: !!cup?.variant_of,
  });

  // All member IDs for the group — used to fetch owned records for the hero photo.
  const groupMemberIds: string[] = [
    baseCupId,
    ...groupChildren.map((c) => c.id),
  ].filter((id): id is string => !!id);

  // Fetch owned records for all group members so the hero can show the first
  // personal photo found across any version.
  const { data: groupOwnedRecords = [] } = useQuery<OwnedCup[]>({
    queryKey: ["group-owned-photos", groupMemberIds.join(","), householdId],
    queryFn: () =>
      getPocketBase()
        .collection("owned_cups")
        .getFullList<OwnedCup>({
          filter:
            groupMemberIds.map((id) => `cup_id="${id}"`).join(" || ") +
            ` && household_id="${householdId}"`,
        }),
    enabled: !!householdId && groupMemberIds.length > 0,
  });

  // Record the Starbucks where the cup was acquired — solo cups only
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

  // Mark as owned AND record acquisition store in one action (for unowned solo cups)
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

  // Toggle is_duplicate — owner-only admin action
  const markDuplicate = useMutation({
    mutationFn: (is_duplicate: boolean) =>
      fetch("/api/admin/duplicates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: id, is_duplicate }),
      }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cup", id] });
    },
  });

  const { data: noteData } = useQuery<{ note: string | null; id: string | null }>({
    queryKey: ["cup_note", id, householdId],
    queryFn: () => fetch(`/api/cup-note?cup_id=${id}`).then((r) => r.json()),
    enabled: !!householdId,
  });
  const savedNote = noteData?.note ?? "";
  const currentNoteDraft = noteDraft ?? savedNote;
  const noteChanged = currentNoteDraft !== savedNote;

  const saveNote = useMutation({
    mutationFn: () =>
      fetch("/api/cup-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: id, note: currentNoteDraft }),
      }).then((r) => { if (!r.ok) throw new Error("Failed to save note"); return r.json(); }),
    onSuccess: () => {
      setNoteDraft(null);
      queryClient.invalidateQueries({ queryKey: ["cup_note", id, householdId] });
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
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cup not found</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">This link may be outdated or the cup may have been removed.</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-green-dark text-white rounded-lg text-sm font-medium cursor-pointer"
        >
          Go back
        </button>
      </div>
    );
  }

  // Resolve variant group (cup is guaranteed non-null past this point)
  const effectiveBase: Cup = fetchedBase ?? cup;
  const groupMembers: Cup[] = cup.variant_of
    ? [effectiveBase, ...groupChildren]
    : [cup, ...groupChildren];
  const isSolo = groupMembers.length === 1;

  const hasCityPin =
    (effectiveBase.scope === "city" || !effectiveBase.scope) &&
    !!effectiveBase.lat && !!effectiveBase.lng;

  function handleViewOnMap() {
    sessionStorage.setItem(
      "map_position",
      JSON.stringify({ lat: effectiveBase.lat, lng: effectiveBase.lng, zoom: 12 })
    );
    router.push("/map");
  }

  // Hero: show the first personal photo found across any group member, falling
  // back to the newest/highest-numbered variant's catalog image.
  const heroSource = findRepresentative(groupMembers);
  const firstOwnedWithPhoto = groupOwnedRecords.find((r) => r.own_photo);
  const ownPhotoUrl = firstOwnedWithPhoto
    ? getFileUrl(firstOwnedWithPhoto.collectionId, firstOwnedWithPhoto.id, firstOwnedWithPhoto.own_photo)
    : null;
  const imageUrl = ownPhotoUrl ??
    (heroSource.image ? getFileUrl(heroSource.collectionId, heroSource.id, heroSource.image) : null);

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-xl cursor-pointer">←</button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{effectiveBase.name}</h1>
          <p className="text-xs text-white/60">
            {effectiveBase.item_type === "ornament" && "Ornament · "}
            {effectiveBase.scope === "state" ? "State Cup · " : effectiveBase.scope === "country" ? "Country Cup · " : effectiveBase.scope === "themed" ? "Special Edition · " : null}
            {effectiveBase.series} · {effectiveBase.year}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Hero — catalog reference image; for solo owned cups shows personal photo.
            Photo upload is done inside the version card below. */}
        <div
          className={`relative w-full h-56 bg-green-starbucks flex items-center justify-center ${imageUrl ? "cursor-zoom-in" : ""}`}
          onClick={() => { if (imageUrl) setLightboxOpen(true); }}
        >
          {imageUrl ? (
            <Image src={imageUrl} alt={`${effectiveBase.name} cup`} fill className="object-contain" unoptimized />
          ) : (
            <span className="text-white text-6xl font-bold opacity-30">
              {effectiveBase.name.charAt(0)}
            </span>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Shared metadata — location, region, country, series, year.
              Notes and source links live in the version card for per-variant display. */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
            <Row label={effectiveBase.scope === "state" ? "State" : effectiveBase.scope === "country" ? "Country" : effectiveBase.scope === "themed" ? "Location" : "City"} value={effectiveBase.name} />
            {effectiveBase.region && <Row label="Region" value={effectiveBase.region} />}
            <Row label="Country" value={effectiveBase.country} />
            <Row label="Series" value={effectiveBase.item_type === "ornament" ? `${effectiveBase.series} Ornaments` : effectiveBase.series} />
            {effectiveBase.sub_collection && <Row label="Collection" value={effectiveBase.sub_collection} />}
            <Row label="Year" value={String(effectiveBase.year)} />
            <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
              {hasCityPin ? (
                <button
                  onClick={handleViewOnMap}
                  className="text-green-starbucks font-medium hover:underline cursor-pointer"
                >
                  📍 View on map
                </button>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">
                  📍 No map pin for this cup type
                </span>
              )}
            </div>
          </div>

          {/* Version cards — always rendered for every cup, solo or grouped.
              Each card owns its photo upload, condition editing, and ownership state. */}
          {!isSolo && <h2 className="font-semibold text-gray-700 dark:text-gray-200">Versions</h2>}
          {groupMembers.map((member) => (
            <VariantMemberCard
              key={member.id}
              cup={member}
              householdId={householdId}
              canWrite={canWrite}
            />
          ))}

          {/* My Notes — visible to all household members; editable by owners only */}
          {!!householdId && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-2">
              <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">My Notes</h2>
              {canWrite ? (
                <>
                  <textarea
                    rows={3}
                    placeholder="Add personal notes about this cup…"
                    value={currentNoteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-hidden focus:border-green-starbucks resize-none"
                  />
                  {noteChanged && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNoteDraft(null)}
                        className="flex-1 py-2 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Discard
                      </button>
                      <button
                        onClick={() => saveNote.mutate()}
                        disabled={saveNote.isPending}
                        className="flex-1 py-2 bg-green-dark text-white rounded-lg text-sm font-medium cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saveNote.isPending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {savedNote || <span className="text-gray-400 italic">No notes yet.</span>}
                </p>
              )}
            </div>
          )}

          {/* Admin — duplicate flag, visible to owners only */}
          {canWrite && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
              <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-2">Admin</h2>
              <button
                onClick={() => cup.is_duplicate ? markDuplicate.mutate(false) : setDuplicateConfirm(true)}
                disabled={markDuplicate.isPending}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  cup.is_duplicate
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {markDuplicate.isPending ? "Saving…" : cup.is_duplicate ? "✓ Marked as duplicate — click to unmark" : "Mark as duplicate"}
              </button>
            </div>
          )}

          {/* Nearby Starbucks.
              "Acquired here" shown for solo cups only — for variant groups, record
              acquisition inside the individual version card's condition section. */}
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
                        {isSolo && canWrite && (!isOwned || (ownedRecord && ownedRecord.id !== "optimistic")) && (
                          <button
                            onClick={() => {
                              if (!isOwned) {
                                markOwnedAtStore.mutate(store);
                              } else {
                                const hasOther = !!ownedRecord!.acquired_store_name && !isAcquiredHere;
                                if (hasOther) {
                                  setStoreConfirm({
                                    oldName: ownedRecord!.acquired_store_name,
                                    oldAddress: ownedRecord!.acquired_store_address ?? "",
                                    newName: store.name,
                                    newAddress: store.address,
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

      {/* Mark-as-duplicate confirmation */}
      {duplicateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Mark as duplicate?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              This cup will be hidden from Browse, Map, and Search for all households that don&apos;t own it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDuplicateConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { setDuplicateConfirm(false); markDuplicate.mutate(true); }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold cursor-pointer hover:brightness-110"
              >
                Mark as duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite-store confirmation — Starbucks "Acquired here" flow, solo cups only */}
      {storeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Replace acquisition store?</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This cup will be linked to a different location.</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-5">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Current</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{storeConfirm.oldName}</p>
                {storeConfirm.oldAddress && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{storeConfirm.oldAddress}</p>
                )}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500 select-none">↓ replace with</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-green-starbucks dark:text-green-400 mb-1">New</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{storeConfirm.newName}</p>
                {storeConfirm.newAddress && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{storeConfirm.newAddress}</p>
                )}
              </div>
            </div>
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
                Update Store
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — full-size hero image */}
      {lightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          aria-label="Close full-size image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${effectiveBase.name} cup — full size`}
            style={{ maxWidth: "100vw", maxHeight: "100dvh", width: "auto", height: "auto", objectFit: "contain" }}
          />
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// Full ownership card — rendered for every cup version (solo or grouped).
// Self-contained: manages photo upload, condition editing, mark owned, and remove.
function VariantMemberCard({
  cup,
  householdId,
  canWrite,
}: {
  cup: Cup;
  householdId: string | null;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [conditionDraft, setConditionDraft] = useState<{
    needs_replacing: boolean;
    replacement_note: string;
    acquired_store_name: string;
    acquired_store_address: string;
  } | null>(null);
  const editingCondition = conditionDraft !== null;

  const [storeConfirm, setStoreConfirm] = useState<{
    oldName: string;
    oldAddress: string;
    newName: string;
    newAddress: string;
    onConfirm: () => void;
  } | null>(null);

  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const { data: ownedRecord } = useQuery<OwnedCup | null>({
    queryKey: ["owned_cup", cup.id, householdId],
    queryFn: async () => {
      if (!householdId) return null;
      try {
        return await getPocketBase()
          .collection("owned_cups")
          .getFirstListItem<OwnedCup>(`cup_id="${cup.id}" && household_id="${householdId}"`);
      } catch {
        return null;
      }
    },
    enabled: !!householdId,
  });

  const isOwned = !!ownedRecord;

  const markOwned = useMutation({
    mutationFn: () =>
      fetch("/api/owned-cups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id: cup.id }),
      }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.setQueryData(["owned_cup", cup.id, householdId], { id: "optimistic" });
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", cup.id, householdId], null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  const removeOwned = useMutation({
    mutationFn: () =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, { method: "DELETE" })
        .then((r) => { if (!r.ok) throw new Error("Failed to remove"); }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.setQueryData(["owned_cup", cup.id, householdId], null);
    },
    onError: () => {
      queryClient.setQueryData(["owned_cup", cup.id, householdId], ownedRecord);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

  const updateCondition = useMutation({
    mutationFn: (update: { needs_replacing: boolean; replacement_note: string; acquired_store_name: string; acquired_store_address: string }) =>
      fetch(`/api/owned-cups?id=${ownedRecord!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      }).then((r) => { if (!r.ok) throw new Error("Failed to update condition"); return r.json(); }),
    onSettled: () => {
      setConditionDraft(null);
      queryClient.invalidateQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.invalidateQueries({ queryKey: ["owned_cups", householdId] });
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "group-owned-photos" });
    },
  });

  const removePhoto = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/owned-cups?id=${ownedRecord!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ own_photo: null }),
      });
      if (!r.ok) throw new Error("Failed to remove photo");
      return r.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owned_cup", cup.id, householdId] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "group-owned-photos" });
    },
  });

  const ownPhotoUrl = ownedRecord?.own_photo
    ? getFileUrl(ownedRecord.collectionId, ownedRecord.id, ownedRecord.own_photo)
    : null;
  const thumbUrl = ownPhotoUrl ?? (cup.image ? getFileUrl(cup.collectionId, cup.id, cup.image) : null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden text-sm">
      {/* Hidden file input — placed outside the thumbnail so programmatic .click()
          doesn't bubble through any parent click handlers */}
      {canWrite && isOwned && ownedRecord?.id !== "optimistic" && (
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadPhoto.mutate(file);
            e.target.value = "";
          }}
        />
      )}

      <div className="flex items-start gap-3 p-4">
        {/* Thumbnail with camera overlay — shows own_photo if available; tap to open lightbox */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <div
            className={`w-full h-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 ${thumbUrl ? "cursor-zoom-in" : ""}`}
            onClick={() => { if (thumbUrl) setLightboxOpen(true); }}
          >
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbUrl} alt={cup.name} loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 font-bold text-2xl">
                {cup.name.charAt(0)}
              </div>
            )}
          </div>
          {canWrite && isOwned && ownedRecord?.id !== "optimistic" && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
                disabled={uploadPhoto.isPending}
                aria-label="Upload personal photo"
                className="absolute bottom-1 right-1 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadPhoto.isPending ? <span className="text-[10px]">…</span> : <span className="text-sm">📷</span>}
              </button>
              {ownPhotoUrl && (
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto.mutate(); }}
                  disabled={removePhoto.isPending}
                  aria-label="Remove personal photo"
                  className="absolute bottom-1 left-1 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removePhoto.isPending ? <span className="text-[10px]">…</span> : <span className="text-sm">🗑️</span>}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100">{cup.name}</div>
          {cup.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cup.notes}</p>
          )}
          {(cup.hobbydb_url || cup.more_info_url) && (
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {cup.hobbydb_url && (
                <a
                  href={cup.hobbydb_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  HobbyDB ↗
                </a>
              )}
              {cup.more_info_url && (() => {
                let host = "More info";
                try { host = new URL(cup.more_info_url).hostname.replace(/^www\./, ""); } catch { /* use fallback */ }
                return (
                  <a
                    href={cup.more_info_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {host} ↗
                  </a>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          {isOwned && ownedRecord?.id !== "optimistic" && (
            ownedRecord?.needs_replacing ? (
              <span className="text-xs font-medium text-gold-dark dark:text-yellow-300 bg-gold-light dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                Needs Replacing
              </span>
            ) : (
              <span className="text-xs font-medium text-green-starbucks dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                Owned
              </span>
            )
          )}
        </div>
      </div>

      {/* Mark as Owned — shown when not yet owned */}
      {!isOwned && canWrite && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
          <button
            onClick={() => markOwned.mutate()}
            disabled={markOwned.isPending}
            className="w-full py-2.5 bg-gold text-green-dark font-bold rounded-lg cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {markOwned.isPending ? "Saving…" : "✓ Mark as Owned"}
          </button>
        </div>
      )}

      {/* Condition section — appears once the optimistic record is replaced.
          Read-only summary for all roles; edit form and remove button for owners. */}
      {isOwned && ownedRecord?.id !== "optimistic" && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 pt-3 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200">Condition</h2>
            {canWrite && !editingCondition && (
              <button
                onClick={() => setConditionDraft({
                  needs_replacing: ownedRecord.needs_replacing ?? false,
                  replacement_note: ownedRecord.replacement_note ?? "",
                  acquired_store_name: ownedRecord.acquired_store_name ?? "",
                  acquired_store_address: ownedRecord.acquired_store_address ?? "",
                })}
                className="text-xs text-green-starbucks font-medium cursor-pointer"
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
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-hidden focus:border-green-starbucks"
                />
              )}

              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Where acquired</p>
                <input
                  type="text"
                  placeholder="Store name"
                  value={conditionDraft.acquired_store_name}
                  onChange={(e) =>
                    setConditionDraft((d) => d ? { ...d, acquired_store_name: e.target.value } : d)
                  }
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-hidden focus:border-green-starbucks"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={conditionDraft.acquired_store_address}
                  onChange={(e) =>
                    setConditionDraft((d) => d ? { ...d, acquired_store_address: e.target.value } : d)
                  }
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-hidden focus:border-green-starbucks"
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
                        oldName: ownedRecord.acquired_store_name,
                        oldAddress: ownedRecord.acquired_store_address ?? "",
                        newName: conditionDraft.acquired_store_name || "(none)",
                        newAddress: conditionDraft.acquired_store_address || "",
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
                <div className="text-gold-dark dark:text-yellow-300 font-medium">
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

          {canWrite && (
            <>
              <div className="border-t border-gray-100 dark:border-gray-700 pt-1" />
              <button
                onClick={() => setRemoveConfirm(true)}
                disabled={removeOwned.isPending}
                className="w-full py-2.5 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {removeOwned.isPending ? "Removing…" : "Remove from Collection"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Remove confirmation modal */}
      {removeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Remove from collection?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              This will delete the owned record for <strong>{cup.name}</strong> including any condition notes and acquisition store.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { setRemoveConfirm(false); removeOwned.mutate(); }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold cursor-pointer hover:brightness-110"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — full-size thumbnail image */}
      {lightboxOpen && thumbUrl && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          aria-label="Close full-size image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt={`${cup.name} cup — full size`}
            style={{ maxWidth: "100vw", maxHeight: "100dvh", width: "auto", height: "auto", objectFit: "contain" }}
          />
        </div>
      )}

      {/* Overwrite-store confirmation — condition editing's store change flow */}
      {storeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Replace acquisition store?</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This cup will be linked to a different location.</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-5">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Current</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{storeConfirm.oldName}</p>
                {storeConfirm.oldAddress && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{storeConfirm.oldAddress}</p>
                )}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500 select-none">↓ replace with</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-green-starbucks dark:text-green-400 mb-1">New</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{storeConfirm.newName}</p>
                {storeConfirm.newAddress && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{storeConfirm.newAddress}</p>
                )}
              </div>
            </div>
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
                Update Store
              </button>
            </div>
          </div>
        </div>
      )}
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
