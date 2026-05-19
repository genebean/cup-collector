"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import { BottomNav } from "@/components/BottomNav";
import type { CollectionPrefs } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function isExcludedSeries(prefs: CollectionPrefs, series: string) {
  return (prefs.excluded_series ?? []).includes(series);
}
function isExcludedType(prefs: CollectionPrefs, type: string) {
  return (prefs.excluded_types ?? []).includes(type);
}

// ── Toggle component ───────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={[
        "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-dark",
        checked ? "bg-green-dark" : "bg-gray-300 dark:bg-gray-600",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PrefRow({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</p>
        {sublabel && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CollectionPrefsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isOwner = session?.user?.householdRole === "owner";

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/sign-in");
  }, [status, router]);

  const { data: prefs = {}, isLoading: prefsLoading } = useQuery<CollectionPrefs>({
    queryKey: ["household-prefs"],
    queryFn: () => fetch("/api/household-prefs").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  const { data: seriesList = [], isLoading: seriesLoading } = useQuery<string[]>({
    queryKey: ["series-list"],
    queryFn: () =>
      getPocketBase()
        .collection("cups")
        .getFullList({ fields: "series" })
        .then((r) =>
          [...new Set(r.map((c) => c.series as string).filter(Boolean))].sort()
        ),
    enabled: status === "authenticated",
  });

  const save = useMutation({
    mutationFn: (newPrefs: CollectionPrefs) =>
      fetch("/api/household-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPrefs),
      }).then((r) => r.json()),
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ["household-prefs"] });
      const previous = queryClient.getQueryData<CollectionPrefs>(["household-prefs"]);
      queryClient.setQueryData(["household-prefs"], newPrefs);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["household-prefs"], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["household-prefs"] }),
  });

  function toggleSeries(series: string) {
    const current = prefs.excluded_series ?? [];
    const isExcluded = current.includes(series);
    save.mutate({
      ...prefs,
      excluded_series: isExcluded ? current.filter((s) => s !== series) : [...current, series],
    });
  }

  function toggleType(type: string) {
    const current = prefs.excluded_types ?? [];
    const isExcluded = current.includes(type);
    save.mutate({
      ...prefs,
      excluded_types: isExcluded ? current.filter((t) => t !== type) : [...current, type],
    });
  }

  const loading = prefsLoading || seriesLoading || status === "loading";

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-white/80 hover:text-white active:text-white/60 text-xl leading-none"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <h1 className="font-bold text-lg leading-tight">What I Collect</h1>
            {session?.user?.householdName && (
              <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 px-4 py-4 space-y-4">
        {!isOwner && status === "authenticated" && (
          <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
            Only the household owner can change collection preferences.
          </p>
        )}

        {/* Item Types */}
        <Section title="Item Types">
          <PrefRow
            label="Mugs"
            sublabel="Always tracked"
            checked={true}
            disabled={true}
          />
          <PrefRow
            label="Ornaments"
            checked={!isExcludedType(prefs, "ornament")}
            onChange={isOwner ? () => toggleType("ornament") : undefined}
            disabled={!isOwner || loading}
          />
        </Section>

        {/* Series */}
        <Section title="Series">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-7 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                </div>
              ))
            : seriesList.map((series) => (
                <PrefRow
                  key={series}
                  label={series}
                  checked={!isExcludedSeries(prefs, series)}
                  onChange={isOwner ? () => toggleSeries(series) : undefined}
                  disabled={!isOwner}
                />
              ))}
        </Section>

        {save.isError && (
          <p className="text-sm text-red-600 dark:text-red-400 px-1">
            Failed to save — please try again.
          </p>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
        {title}
      </h2>
      <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
        {children}
      </div>
    </div>
  );
}
