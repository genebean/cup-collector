import PocketBase from "pocketbase";

// Internal PocketBase URL — used server-side only (API routes, import script).
// The browser never connects here directly; it goes through the /api/pb proxy.
const POCKETBASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";

// Browser-side PocketBase client.
// Points at /api/pb (the Next.js proxy) so all requests are auth-gated before
// reaching PocketBase. PocketBase is not publicly exposed.
let browserClient: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (typeof window === "undefined") {
    // Server-side: connect directly to PocketBase via internal URL
    return new PocketBase(POCKETBASE_URL);
  }
  // Browser-side: route through the authenticated proxy
  if (!browserClient) {
    browserClient = new PocketBase(`${window.location.origin}/api/pb`);
  }
  return browserClient;
}

// Server-side admin client — for API routes and the import script only.
// Never expose this client or its credentials to the browser.
export async function getAdminPocketBase(): Promise<PocketBase> {
  const pb = new PocketBase(POCKETBASE_URL);
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are required for admin operations");
  }
  await pb.collection("_superusers").authWithPassword(email, password);
  return pb;
}

// Returns the URL for a PocketBase-stored file.
// Always uses the /api/pb proxy path so the URL is accessible from the browser
// and the file request is auth-gated along with all other PocketBase traffic.
export function getFileUrl(
  collectionId: string,
  recordId: string,
  filename: string
): string {
  if (!filename) return "";
  return `/api/pb/api/files/${collectionId}/${recordId}/${encodeURIComponent(filename)}`;
}
