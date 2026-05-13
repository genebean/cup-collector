"use client";

import { useState, useSyncExternalStore } from "react";

export type MapThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "map_theme";

function subscribeToDarkMode(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useMapTheme() {
  const [preference, setPreference] = useState<MapThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  });

  const systemIsDark = useSyncExternalStore(
    subscribeToDarkMode,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );

  function setTheme(pref: MapThemePreference) {
    setPreference(pref);
    localStorage.setItem(STORAGE_KEY, pref);
  }

  const isDark =
    preference === "dark" || (preference === "system" && systemIsDark);

  return { preference, setTheme, isDark };
}
