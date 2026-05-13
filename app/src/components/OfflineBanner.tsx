"use client";

import { useSyncExternalStore } from "react";

// Shows a subtle banner when the device has no network connection.
// Never blocks the UI — the app keeps showing cached data while offline.
function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OfflineBanner() {
  // useSyncExternalStore handles SSR (server snapshot = false) and subscribes to
  // online/offline events without useState or effects.
  const isOffline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-center text-xs py-1 font-medium">
      You&apos;re offline — showing cached data
    </div>
  );
}
