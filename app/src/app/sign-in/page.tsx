import Image from "next/image";
import { getAdminPocketBase } from "@/lib/pocketbase";
import SignInButtons from "./SignInButtons";

// Simple sign-in page — a single "Sign in with PocketID" button.
// Auth.js redirects here when middleware finds an unauthenticated request.
// When PLAYWRIGHT_BYPASS_AUTH=1 (dev only), renders a household+role picker instead.
export default async function SignInPage() {
  const bypassEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.PLAYWRIGHT_BYPASS_AUTH === "1";

  let households: { id: string; name: string; group_slug: string }[] = [];
  if (bypassEnabled) {
    try {
      const pb = await getAdminPocketBase();
      const result = await pb.collection("households").getFullList({ sort: "name" });
      households = result.map((h) => ({
        id: h.id,
        name: h.name as string,
        group_slug: h.group_slug as string,
      }));
    } catch {
      // PocketBase unreachable — bypass buttons will still render with empty list
    }
  }

  return (
    <div className="min-h-screen bg-green-dark flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <Image
          src="/icons/icon-192.png"
          alt="Cup Collector"
          width={96}
          height={96}
          className="mb-4 mx-auto"
        />
        <h1 className="text-3xl font-bold text-white mb-2">Cup Collector</h1>
        <p className="text-white/60 text-sm">Track your Starbucks cup collection</p>
      </div>
      <SignInButtons bypassEnabled={bypassEnabled} households={households} />
    </div>
  );
}
