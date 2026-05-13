import { signIn } from "@/app/auth";

// Simple sign-in page — a single "Sign in with PocketID" button.
// Auth.js redirects here when middleware finds an unauthenticated request.
export default function SignInPage() {
  return (
    <div className="min-h-screen bg-green-dark flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">☕</div>
        <h1 className="text-3xl font-bold text-white mb-2">Cup Collector</h1>
        <p className="text-white/60 text-sm">Track your Starbucks cup collection</p>
      </div>

      <form
        action={async () => {
          "use server";
          await signIn("pocketid", { redirectTo: "/map" });
        }}
      >
        <button
          type="submit"
          className="px-8 py-3 bg-gold text-green-dark font-bold rounded-xl text-base shadow-lg"
        >
          Sign in with PocketID
        </button>
      </form>
    </div>
  );
}
