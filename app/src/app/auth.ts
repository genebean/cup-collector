import NextAuth from "next-auth";
import type { JWT as _JWT } from "next-auth/jwt"; // import required for module augmentation below

declare module "next-auth" {
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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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
    async jwt({ token, profile }) {
      if (profile) {
        token.pocketIdSub = profile.sub as string;
        token.groups = (profile.groups as string[]) ?? [];
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
