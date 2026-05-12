import PocketBase from "pocketbase";

// POCKETBASE_URL must be set in .env.local (dev) or the NixOS envFile (prod).
// See .env.example for the full list of required variables.
const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";

// Browser-side PocketBase client — used in client components for realtime
// subscriptions and user-initiated reads/writes.
// Exported as a singleton to avoid creating multiple connections.
let browserClient: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (typeof window === "undefined") {
    // Server-side: create a fresh instance per request (no singleton, no state leak)
    return new PocketBase(POCKETBASE_URL);
  }
  // Browser-side: reuse a single instance so realtime subscriptions persist
  if (!browserClient) {
    browserClient = new PocketBase(POCKETBASE_URL);
  }
  return browserClient;
}

// Server-side client authenticated as admin — for the import script and admin
// API routes only. Never send this token to the browser.
export function getAdminPocketBase(): PocketBase {
  const pb = new PocketBase(POCKETBASE_URL);
  const adminToken = process.env.POCKETBASE_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error("POCKETBASE_ADMIN_TOKEN is not set — required for admin operations");
  }
  // Directly set the admin auth token without going through the login flow
  pb.authStore.save(adminToken, null);
  return pb;
}

// Resolves a PocketBase file token to a full URL.
// Use this anywhere you need to display a cup image.
export function getFileUrl(
  collectionId: string,
  recordId: string,
  filename: string
): string {
  if (!filename) return "";
  const pb = getPocketBase();
  return pb.files.getUrl({ collectionId, id: recordId }, filename);
}
