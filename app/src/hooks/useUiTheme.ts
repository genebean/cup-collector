"use client";

import { useSyncExternalStore, useEffect } from "react";

export type UiThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "ui_theme";

// Fires whenever stored preference or OS dark-mode preference changes.
// The custom "ui-theme-change" event is dispatched by setTheme() below, so all
// hook instances on the page re-read localStorage in the same tick.
function subscribeToTheme(cb: () => void) {
  window.addEventListener("ui-theme-change", cb);
  window.addEventListener("storage", cb); // cross-tab sync
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener("ui-theme-change", cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

function readPreference(): UiThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function resolveIsDark(pref: UiThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useUiTheme() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    readPreference,
    () => "system" as UiThemePreference, // SSR snapshot — no localStorage on server
  );

  const isDark = useSyncExternalStore(
    subscribeToTheme,
    () => resolveIsDark(readPreference()),
    () => false,
  );

  // Apply/remove .dark class on <html> — controls all dark: Tailwind utilities.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function setTheme(pref: UiThemePreference) {
    localStorage.setItem(STORAGE_KEY, pref);
    window.dispatchEvent(new Event("ui-theme-change"));
  }

  return { preference, setTheme, isDark };
}
