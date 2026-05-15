import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT as _JWT } from "next-auth/jwt"; // import required for module augmentation below

declare module "next-auth" {
  interface User {
    groups?: string[];
  }
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      pocketIdSub?: string;
      groups?: string[];
    };
  }
  interface JWT {
    pocketIdSub?: string;
    groups?: string[];
  }
}

// The dev-bypass Credentials provider is only included in development when
// PLAYWRIGHT_BYPASS_AUTH=1 is set. This conditional is at module scope so
// Next.js dead-code-eliminates the provider from the production bundle
// (nix build runs with NODE_ENV=production — the provider never ships).
const devBypassEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.PLAYWRIGHT_BYPASS_AUTH === "1";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: devBypassEnabled
    ? [
        Credentials({
          id: "dev-bypass",
          name: "Dev Bypass",
          credentials: {
            role: { label: "Role", type: "text" },
          },
          authorize(_credentials, req) {
            // Read role from the URL query param — query params are reliably
            // forwarded by Auth.js to authorize(), unlike parsed form bodies.
            const role = new URL(req.url).searchParams.get("role") ?? "cup-viewer";
            return {
              id: `dev-${role}`,
              name: `Dev ${role}`,
              email: `dev-${role}@playwright.local`,
              groups: [role],
            };
          },
        }),
      ]
    : [
        {
          id: "pocketid",
          name: "PocketID",
          type: "oidc",
          issuer: process.env.POCKETID_ISSUER_URL,
          clientId: process.env.POCKETID_CLIENT_ID,
          clientSecret: process.env.POCKETID_CLIENT_SECRET,
          authorization: { params: { scope: "openid profile email groups" } },
        },
      ],
  callbacks: {
    authorized({ auth: session, request }) {
      if (!session?.user) return false;
      const groups = (session.user as { groups?: string[] }).groups ?? [];
      const knownGroups = [
        process.env.ROLE_GROUP_OWNER ?? "cup-owner",
        process.env.ROLE_GROUP_COLLABORATOR ?? "cup-collaborator",
        process.env.ROLE_GROUP_VIEWER ?? "cup-viewer",
      ];
      if (!groups.some((g) => knownGroups.includes(g))) {
        return Response.redirect(new URL("/access-denied", request.url));
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (profile) {
        // OIDC path: groups come from the PocketID profile claim
        token.pocketIdSub = profile.sub as string;
        token.groups = (profile.groups as string[]) ?? [];
      } else if (account?.provider === "dev-bypass") {
        // Dev bypass path: role is encoded in providerAccountId ("dev-{role}")
        // account is only set during sign-in, so this only runs once per session.
        const id = (account.providerAccountId ?? "") as string;
        token.groups = [id.replace(/^dev-/, "")];
        // Set a synthetic sub so requireWriter() and marked_by_sub work in tests.
        // providerAccountId is "dev-cup-owner" etc. — stable across test runs.
        token.pocketIdSub = id;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      if (typeof t.pocketIdSub === "string") {
        session.user.pocketIdSub = t.pocketIdSub;
      }
      if (Array.isArray(t.groups)) {
        session.user.groups = t.groups as string[];
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
    error: "/auth-error",
  },
});
