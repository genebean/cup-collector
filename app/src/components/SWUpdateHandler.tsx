"use client";

import { useEffect } from "react";

// Reloads the page when a new service worker takes control so clients
// always run JS that matches the deployed server's action hashes.
// Without this, clients with stale in-memory JS send outdated server
// action IDs and get UnrecognizedActionError until they manually refresh.
export default function SWUpdateHandler() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);
  return null;
}
