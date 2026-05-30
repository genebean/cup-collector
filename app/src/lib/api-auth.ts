import { auth } from "@/app/auth";
import { isAuthorizedWriter } from "@/lib/roles";
import type { Session } from "next-auth";

// Server-side guard for owner-only API routes. Returns the full session on
// success or null if the user is unauthenticated or not an owner.
// Callers should return a 403 response when this returns null.
//
// Not directly unit-tested — Auth.js cannot be mocked per project convention.
// Auth-gated behavior is covered by the Playwright e2e suite.
// The underlying isAuthorizedWriter() logic is unit-tested in lib/roles.ts.
export async function requireWriter(): Promise<Session | null> {
  const session = await auth();
  if (!isAuthorizedWriter(session)) return null;
  return session;
}
