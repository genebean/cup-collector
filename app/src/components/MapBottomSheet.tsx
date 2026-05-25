"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CupWithOwnership } from "@/types";
import { groupByVariant } from "@/lib/variants";

interface Props {
  cups: CupWithOwnership[];
}

export function MapBottomSheet({ cups }: Props) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const groups = groupByVariant(cups);

  return (
    <div
      data-testid="bottom-sheet"
      className={`fixed bottom-[var(--bottom-nav-height)] left-0 right-0 z-[1100] transition-transform duration-300 ease-in-out ${
        expanded ? "translate-y-0" : "translate-y-[calc(100%-2.5rem)]"
      }`}
    >
      {/* Handle / summary row */}
      <button
        className="w-full flex flex-col items-center bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.2)] pt-2 pb-2"
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? "Collapse cup list" : "Expand cup list"}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mb-1" />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {groups.length} cup{groups.length !== 1 ? "s" : ""} in view
        </span>
      </button>

      {/* Scrollable cup list */}
      <div className="bg-white dark:bg-gray-800 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No cups visible — pan or zoom to find cups
          </p>
        ) : (
          groups.map(({ base, members }) => {
            const anyNeedsReplacing = members.some((c) => c.isOwned && c.ownedRecord?.needs_replacing);
            const anyOwned = members.some((c) => c.isOwned);
            const isGreen = anyOwned && !anyNeedsReplacing;
            const versionSuffix = members.length > 1 ? ` (${members.length} versions)` : "";
            return (
              <button
                key={base.id}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600"
                aria-label={`View ${base.name} cup`}
                onClick={() => router.push(`/cup/${base.slug || base.id}`)}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isGreen ? "#00704A" : "#f97316" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium dark:text-gray-100 truncate">{base.name}{versionSuffix}</span>
                    {base.item_type === "ornament" && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-gold-light text-green-dark flex-shrink-0">
                        ornament
                      </span>
                    )}
                    {(base.scope === "state" || base.scope === "country" || base.scope === "themed") && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0 capitalize">
                        {base.scope}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {base.series} · {base.year}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium flex-shrink-0 ${
                    isGreen ? "text-green-starbucks dark:text-green-400" : "text-map-orange dark:text-orange-400"
                  }`}
                >
                  {anyNeedsReplacing ? "Needs Replacing" : anyOwned ? "Owned" : "Needed"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
