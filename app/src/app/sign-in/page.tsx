import Image from "next/image";
import { signIn } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";

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
        <Image src="/icons/icon-192.png" alt="Cup Collector" width={96} height={96} className="mb-4 mx-auto" />
        <h1 className="text-3xl font-bold text-white mb-2">Cup Collector</h1>
        <p className="text-white/60 text-sm">Track your Starbucks cup collection</p>
      </div>

      {bypassEnabled ? (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <p className="text-white/60 text-xs text-center uppercase tracking-widest">Dev bypass</p>
          {households.length === 0 && (
            <p className="text-white/40 text-xs text-center">No households found — is PocketBase running?</p>
          )}
          {households.map((household) => (
            <div key={household.id} className="flex flex-col gap-2">
              <p className="text-white/50 text-xs uppercase tracking-wider">{household.name}</p>
              {(["owner", "viewer"] as const).map((role) => (
                <form
                  key={role}
                  action={async () => {
                    "use server";
                    await signIn("dev-bypass", {
                      role,
                      household: household.group_slug,
                      redirectTo: "/map",
                    });
                  }}
                >
                  <button type="submit" className="w-full px-8 py-3 bg-gold text-green-dark font-bold rounded-xl cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all shadow-lg text-base capitalize">
                    {household.name} — {role}
                  </button>
                </form>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("pocketid", { redirectTo: "/map" });
          }}
        >
          <button type="submit" className="px-8 py-3 bg-gold text-green-dark font-bold rounded-xl cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all shadow-lg text-base">
            Sign in with PocketID
          </button>
        </form>
      )}
    </div>
  );
}
