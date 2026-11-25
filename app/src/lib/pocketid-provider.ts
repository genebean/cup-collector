// Kept separate from auth.ts (not inlined there) so this is directly
// unit-testable without constructing the full NextAuth() instance, which
// would otherwise pull in next-auth's whole module chain - see
// src/__tests__/pocketid-provider.test.ts, which locks in `checks` below.
export const pocketIdProvider = {
  id: "pocketid",
  name: "PocketID",
  type: "oidc" as const,
  issuer: process.env.POCKETID_ISSUER_URL,
  clientId: process.env.POCKETID_CLIENT_ID,
  clientSecret: process.env.POCKETID_CLIENT_SECRET,
  authorization: { params: { scope: "openid profile email groups" } },
  // Explicit, not left to oauth4webapi's default: a transitive bump
  // from 3.8.6 to 3.8.8 silently stopped sending the OAuth `state`
  // param (PKCE-only), which pocket-id 2.19.1 rejects outright
  // ("invalid_state" on every /authorize call). Went unnoticed for
  // ~2 months because the default 30-day, auto-renewing session
  // cookie meant no one hit a fresh /authorize round-trip until it
  // finally expired.
  checks: ["pkce", "state"] as ("pkce" | "state")[],
};
