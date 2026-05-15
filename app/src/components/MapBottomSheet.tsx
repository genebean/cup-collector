"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CupWithOwnership } from "@/types";

interface Props {
  cups: CupWithOwnership[];
}

export function MapBottomSheet({ cups }: Props) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  return (
    <div
      className={`fixed bottom-16 left-0 right-0 z-[1100] transition-transform duration-300 ease-in-out ${
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
          {cups.length} cup{cups.length !== 1 ? "s" : ""} in view
        </span>
      </button>

      {/* Scrollable cup list */}
      <div className="bg-white dark:bg-gray-800 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
        {cups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No cups visible — pan or zoom to find cups
          </p>
        ) : (
          cups.map((cup) => {
            const needsReplacing = cup.isOwned && cup.ownedRecord?.needs_replacing;
            const isGreen = cup.isOwned && !needsReplacing;
            return (
              <button
                key={cup.id}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600"
                aria-label={`View ${cup.city} cup`}
                onClick={() => router.push(`/cup/${cup.id}`)}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isGreen ? "#00704A" : "#f97316" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium dark:text-gray-100 truncate">{cup.city}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {cup.series} · {cup.year}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium flex-shrink-0 ${
                    isGreen ? "text-green-700 dark:text-green-400" : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  {needsReplacing ? "Needs Replacing" : cup.isOwned ? "Owned" : "Needed"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
