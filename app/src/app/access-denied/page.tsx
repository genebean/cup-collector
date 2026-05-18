import { signOut } from "@/app/auth";

export default function AccessDeniedPage() {
  return (
    <div className="flex flex-col min-h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3">
        <h1 className="font-bold text-lg">Cup Collector</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="text-5xl mb-4">☕</div>
        <h2 className="text-xl font-bold text-green-dark dark:text-green-400 mb-2">Access Not Granted</h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm max-w-xs mb-2">
          Your account is authenticated but hasn&apos;t been added to an access group yet.
        </p>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mb-8">
          Ask the app owner to add you to a{" "}
          <strong>cup-collector-&lt;household&gt;-owner</strong> or{" "}
          <strong>cup-collector-&lt;household&gt;-viewer</strong> group in PocketID.
        </p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="px-6 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 font-semibold rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 transition-colors text-sm"
          >
            Sign Out
          </button>
        </form>
      </main>
    </div>
  );
}
