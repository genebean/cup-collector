import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT as _JWT } from "next-auth/jwt"; // import required for module augmentation below
import { getAdminPocketBase } from "@/lib/pocketbase";
import { parseHouseholdGroups } from "@/lib/roles";

export interface HouseholdOption {
  id: string;
  name: string;
  role: "owner" | "viewer";
}

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
      householdId?: string | null;
      householdName?: string | null;
      householdRole?: "owner" | "viewer" | null;
      // All households the user belongs to — populated at sign-in.
      // Length > 1 means the household switcher should be shown.
      householdMemberships?: HouseholdOption[];
    };
  }
  interface JWT {
    pocketIdSub?: string;
    groups?: string[];
    householdId?: string | null;
    householdName?: string | null;
    householdRole?: "owner" | "viewer" | null;
    householdMemberships?: HouseholdOption[];
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
            household: { label: "Household", type: "text" },
          },
          authorize(credentials, req) {
            // signIn() passes credentials as form body; e2e tests post directly
            // with URL query params — check both so both paths work.
            const params = new URL(req.url).searchParams;
            const role = (credentials.role as string | undefined) ?? params.get("role") ?? "viewer";
            const household = (credentials.household as string | undefined) ?? params.get("household") ?? "test-household";
            return {
              id: `dev-${household}-${role}`,
              name: `Dev ${role} (${household})`,
              email: `dev-${role}@playwright.local`,
              groups: [`cup-collector-${household}-${role}`],
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
      // Unauthenticated: let Auth.js redirect to /sign-in (return false).
      if (!session?.user) return false;
      // Authenticated but no resolved household: redirect to /access-denied.
      const user = session.user as { householdId?: string | null };
      if (!user.householdId) {
        return Response.redirect(new URL("/access-denied", request.url));
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      if (profile) {
        // OIDC path: groups come from the PocketID profile claim
        token.pocketIdSub = profile.sub as string;
        token.groups = (profile.groups as string[]) ?? [];
      } else if (account?.provider === "dev-bypass") {
        // Dev bypass path: groups are set by authorize() and available on
        // the user object (only present during initial sign-in).
        token.groups = ((user as { groups?: string[] }).groups) ?? [];
        token.pocketIdSub = (user?.id ?? "dev-viewer") as string;
      }

      // Handle household switch triggered from client via session.update().
      if (trigger === "update") {
        const selectedId = (session as { selectedHouseholdId?: string })?.selectedHouseholdId;
        if (selectedId) {
          const memberships = (token.householdMemberships as HouseholdOption[]) ?? [];
          const selected = memberships.find((m) => m.id === selectedId);
          if (selected) {
            token.householdId = selected.id;
            token.householdName = selected.name;
            token.householdRole = selected.role;
          }
        }
      }

      // Resolve all households once at sign-in (householdId === undefined means not yet
      // looked up; null means looked up but nothing found — skip on subsequent refreshes).
      if (token.groups && token.householdId === undefined) {
        const memberships = parseHouseholdGroups(token.groups as string[]);
        if (memberships.length > 0) {
          const pb = await getAdminPocketBase();
          const resolved = await Promise.all(
            memberships.map(async ({ slug, role }) => {
              try {
                const h = await pb.collection("households")
                  .getFirstListItem(`group_slug="${slug}"`);
                return { id: h.id as string, name: h.name as string, role } satisfies HouseholdOption;
              } catch {
                return null;
              }
            })
          );
          const valid = resolved.filter((h): h is HouseholdOption => h !== null);
          if (valid.length > 0) {
            token.householdMemberships = valid;
            token.householdId = valid[0].id;
            token.householdName = valid[0].name;
            token.householdRole = valid[0].role;
          } else {
            token.householdMemberships = [];
            token.householdId = null;
            token.householdRole = null;
          }
        } else {
          token.householdMemberships = [];
          token.householdId = null;
          token.householdRole = null;
        }
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
      if (typeof t.householdId === "string" || t.householdId === null) {
        session.user.householdId = t.householdId as string | null;
      }
      if (typeof t.householdName === "string" || t.householdName === null) {
        session.user.householdName = t.householdName as string | null;
      }
      if (t.householdRole === "owner" || t.householdRole === "viewer" || t.householdRole === null) {
        session.user.householdRole = t.householdRole as "owner" | "viewer" | null;
      }
      if (Array.isArray(t.householdMemberships)) {
        session.user.householdMemberships = t.householdMemberships as HouseholdOption[];
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
    error: "/auth-error",
  },
});
