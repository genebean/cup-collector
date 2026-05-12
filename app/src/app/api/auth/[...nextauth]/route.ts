// Auth.js v5 route handler — handles all /api/auth/* requests:
//   /api/auth/signin, /api/auth/callback/pocketid, /api/auth/signout, etc.
// The OIDC callback URL registered in PocketID must be:
//   https://cups.yourdomain.com/api/auth/callback/pocketid
import { handlers } from "@/app/auth";

export const { GET, POST } = handlers;
