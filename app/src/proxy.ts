export { auth as proxy } from "@/app/auth";

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|icons|sign-in|auth-error|access-denied|favicon.ico|docs).*)",
  ],
};
