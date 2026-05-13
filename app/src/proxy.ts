export { auth as proxy } from "@/app/auth";

// Protect all routes except public ones.
// Auth.js proxy redirects unauthenticated users to the sign-in page.
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|icons|sign-in|auth-error|favicon.ico).*)",
  ],
};
