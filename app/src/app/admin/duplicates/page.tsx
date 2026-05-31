"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
import type { Cup } from "@/types";
import type { DuplicateGroup } from "@/lib/duplicate-detection";
import { getFileUrl } from "@/lib/pocketbase";
import { buildSeriesOptions } from "@/lib/browse";
import { buildCsv } from "@/lib/csv";
import { canWrite } from "@/lib/roles";

interface DuplicatesData {
  groups: DuplicateGroup[];
  marked: Cup[];
  all: Cup[];
}

export default function AdminDuplicatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"potential" | "marked" | "find">("potential");

  if (status === "loading") return null;
  if (status === "unauthenticated" || !canWrite(session?.user?.householdRole ?? "none")) {
    router.push("/");
    return null;
  }

  return <DuplicatesContent queryClient={queryClient} activeTab={activeTab} setActiveTab={setActiveTab} />;
}

function DuplicatesContent({
  queryClient,
  activeTab,
  setActiveTab,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  activeTab: "potential" | "marked" | "find";
  setActiveTab: (t: "potential" | "marked" | "find") => void;
}) {
  const [findSearch, setFindSearch] = useState("");
  const [findSeriesFilter, setFindSeriesFilter] = useState("");
  const [confirmingGroupKey, setConfirmingGroupKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DuplicatesData>({
    queryKey: ["admin-duplicates"],
    queryFn: () => fetch("/api/admin/duplicates").then((r) => r.json()),
  });

  const mutation = useMutation({
    mutationFn: ({ cup_id, is_duplicate }: { cup_id: string; is_duplicate: boolean }) =>
      fetch("/api/admin/duplicates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_id, is_duplicate }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-duplicates"] }),
  });

  const confirmMutation = useMutation({
    mutationFn: (cup_ids: string[]) =>
      fetch("/api/admin/duplicates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cup_ids, duplicate_ok: true }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-duplicates"] }),
  });

  const seriesOptions = useMemo(() => buildSeriesOptions(data?.all ?? []), [data]);

  const findResults = useMemo(() => {
    const q = findSearch.toLowerCase().trim();
    const hasQuery = q.length >= 2;
    const hasSeries = !!findSeriesFilter;
    if (!hasQuery && !hasSeries) return null;
    const [filterSeries, filterType] = findSeriesFilter.split("|");
    return (data?.all ?? [])
      .filter((c) =>
        (!hasSeries || (c.series === filterSeries && (!filterType || (c.item_type || "mug") === filterType))) &&
        (!hasQuery || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [data, findSearch, findSeriesFilter]);

  function downloadReport() {
    if (!data?.marked.length) return;
    const csv = buildCsv(
      ["name", "series", "year", "item_type", "country", "region", "more_info_url", "hobbydb_url"],
      data.marked.map((c) => [c.name, c.series, c.year, c.item_type || "mug", c.country, c.region, c.more_info_url, c.hobbydb_url])
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "duplicate-cups.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-green-starbucks dark:text-green-400 text-sm">← Settings</Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Duplicate Cups</h1>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Cups flagged as duplicates are hidden from Browse, Map, and Search (unless you own them).
          Potential duplicates are detected by finding multiple cups in the same series and location.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("potential")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "potential"
                ? "bg-green-starbucks text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
            }`}
          >
            Potential ({data?.groups.length ?? 0} groups)
          </button>
          <button
            onClick={() => setActiveTab("marked")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "marked"
                ? "bg-green-starbucks text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
            }`}
          >
            Marked ({data?.marked.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("find")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "find"
                ? "bg-green-starbucks text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
            }`}
          >
            Find &amp; Mark
          </button>
        </div>

        {isLoading && (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">Loading…</p>
        )}

        {!isLoading && activeTab === "potential" && (
          <>
            {data?.groups.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
                No potential duplicates detected in the current catalog.
              </p>
            ) : (
              <div className="space-y-4">
                {data?.groups.map((group) => (
                  <div key={group.key} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{group.key}</span>
                      {confirmingGroupKey === group.key ? (
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Sure?</span>
                          <button
                            onClick={() => setConfirmingGroupKey(null)}
                            className="px-2 py-0.5 text-xs rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { setConfirmingGroupKey(null); confirmMutation.mutate(group.cups.map((c) => c.id)); }}
                            disabled={confirmMutation.isPending}
                            className="px-2 py-0.5 text-xs rounded-full bg-green-starbucks text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingGroupKey(group.key)}
                          disabled={confirmMutation.isPending}
                          className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-green-starbucks hover:text-green-starbucks dark:hover:text-green-400 transition-colors disabled:opacity-50"
                        >
                          Confirm as unique
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {group.cups.map((cup) => (
                        <CupRow
                          key={cup.id}
                          cup={cup}
                          showThumb
                          onToggle={(is_duplicate) => mutation.mutate({ cup_id: cup.id, is_duplicate })}
                          pending={mutation.isPending}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!isLoading && activeTab === "marked" && (
          <>
            {data?.marked.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
                No cups have been marked as duplicates yet.
              </p>
            ) : (
              <>
                <button
                  onClick={downloadReport}
                  className="mb-4 w-full py-2 bg-green-starbucks text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Download CSV report ({data?.marked.length} cups)
                </button>
                <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                  {data?.marked.map((cup) => (
                    <CupRow
                      key={cup.id}
                      cup={cup}
                      onToggle={(is_duplicate) => mutation.mutate({ cup_id: cup.id, is_duplicate })}
                      pending={mutation.isPending}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!isLoading && activeTab === "find" && (
          <>
            <div className="flex gap-2 mb-4">
              <input
                type="search"
                placeholder="Name or country…"
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
                className="flex-1 min-w-0 rounded-xl px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-starbucks"
              />
              <select
                value={findSeriesFilter}
                onChange={(e) => setFindSeriesFilter(e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-starbucks"
              >
                <option value="">All series</option>
                {seriesOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {findResults === null ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">Type a name or select a series to search.</p>
            ) : findResults.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">No cups found.</p>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {findResults.map((cup) => (
                  <CupRow
                    key={cup.id}
                    cup={cup}
                    showThumb
                    onToggle={(is_duplicate) => mutation.mutate({ cup_id: cup.id, is_duplicate })}
                    pending={mutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function CupRow({
  cup,
  showThumb = false,
  onToggle,
  pending,
}: {
  cup: Cup;
  showThumb?: boolean;
  onToggle: (is_duplicate: boolean) => void;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const thumbUrl = cup.image ? getFileUrl(cup.collectionId, cup.id, cup.image) + "?thumb=60x60" : "";
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      {showThumb && (
        <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-gray-400">{cup.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {cup.name}
          {cup.item_type === "ornament" && (
            <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">(ornament)</span>
          )}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {cup.series} · {cup.year}{cup.more_info_url ? " · " : ""}
          {cup.more_info_url && (
            <a href={cup.more_info_url} target="_blank" rel="noreferrer" className="text-green-starbucks dark:text-green-400 hover:underline">
              source ↗
            </a>
          )}
        </p>
      </div>
      {confirming ? (
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Sure?</span>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-1 text-xs rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => { setConfirming(false); onToggle(true); }}
            disabled={pending}
            className="px-2 py-1 text-xs rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            Mark
          </button>
        </div>
      ) : (
        <button
          onClick={() => cup.is_duplicate ? onToggle(false) : setConfirming(true)}
          disabled={pending}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
            cup.is_duplicate
              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {cup.is_duplicate ? "✓ Duplicate" : "Mark duplicate"}
        </button>
      )}
    </div>
  );
}
