import NextAuth from "next-auth";
import type { JWT as _JWT } from "next-auth/jwt"; // import required for module augmentation below

// Extend the built-in session/token types to include our PocketID subject claim.
// The `sub` from PocketID is the stable user identifier used for role resolution.
declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      pocketIdSub: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    pocketIdSub?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: "pocketid",
      name: "PocketID",
      type: "oidc",
      // POCKETID_ISSUER_URL — your self-hosted PocketID instance, e.g. https://id.yourdomain.com
      issuer: process.env.POCKETID_ISSUER_URL,
      clientId: process.env.POCKETID_CLIENT_ID,
      clientSecret: process.env.POCKETID_CLIENT_SECRET,
    },
  ],
  callbacks: {
    // Store the PocketID subject claim in the JWT on first sign-in.
    // `profile` is only available during the initial OIDC exchange.
    async jwt({ token, profile }) {
      if (profile) {
        token.pocketIdSub = profile.sub as string;
      }
      return token;
    },
    // Expose pocketIdSub on the session object so any server component or
    // API route can read it via `const session = await auth()`.
    async session({ session, token }) {
      if (token.pocketIdSub) {
        session.user.pocketIdSub = token.pocketIdSub;
      }
      return session;
    },
  },
  pages: {
    // Custom sign-in page — shows the "Sign in with PocketID" button
    signIn: "/sign-in",
    // Custom error page for OIDC failures
    error: "/auth-error",
  },
});
