"use client";

import { useEffect, useState } from "react";

// Shows a subtle banner when the device has no network connection.
// Never blocks the UI — the app keeps showing cached data while offline.
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    // Set initial state based on current browser status
    setIsOffline(!navigator.onLine);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-center text-xs py-1 font-medium">
      You&apos;re offline — showing cached data
    </div>
  );
}
