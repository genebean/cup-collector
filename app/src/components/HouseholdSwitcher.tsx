"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HouseholdOption } from "@/app/auth";

export function HouseholdSwitcher({ memberships, currentId }: { memberships: HouseholdOption[]; currentId: string }) {
  const { update } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function switchTo(id: string) {
    if (id === currentId || pending) return;
    setPending(id);
    await update({ selectedHouseholdId: id });
    router.refresh();
    setPending(null);
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {memberships.map((m) => {
        const isActive = m.id === currentId;
        const isLoading = pending === m.id;
        return (
          <button
            key={m.id}
            onClick={() => switchTo(m.id)}
            disabled={isActive || !!pending}
            className="w-full flex justify-between items-center px-4 py-3 text-sm disabled:cursor-default hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          >
            <span className={`font-medium ${isActive ? "text-green-starbucks dark:text-green-400" : "text-gray-800 dark:text-gray-100"}`}>
              {m.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isLoading ? "Switching…" : isActive ? "Active" : m.role === "owner" ? "Owner" : "Viewer"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
