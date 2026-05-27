import { auth, signOut } from "@/app/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { UiThemeSelector } from "@/components/UiThemeSelector";
import { HouseholdSwitcher } from "@/components/HouseholdSwitcher";
import Link from "next/link";

// Settings is a server component — reads session server-side,
// no client-side JS needed for this static page.
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.householdId) redirect("/sign-in");

  const role = session.user.householdRole;
  const roleLabel = role === "owner" ? "Owner" : role === "viewer" ? "Viewer" : "No access";

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <h1 className="font-bold text-lg leading-tight">Settings</h1>
        {session.user.householdName && (
          <p className="text-xs text-white/60 leading-tight">{session.user.householdName}</p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-24 px-4 py-4 space-y-4">
        {/* Account info */}
        <Section title="Account">
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Role" value={roleLabel} />
        </Section>

        {/* Household info */}
        {session.user.householdName && (
          <Section title="Household">
            {(session.user.householdMemberships?.length ?? 0) > 1 ? (
              <HouseholdSwitcher
                memberships={session.user.householdMemberships!}
                currentId={session.user.householdId!}
              />
            ) : (
              <Row label="Name" value={session.user.householdName} />
            )}
          </Section>
        )}

        {/* Appearance — controls the UI light/dark mode; map tiles follow automatically */}
        <Section title="Appearance">
          <UiThemeSelector />
        </Section>

        {/* App info */}
        <Section title="App">
          <Row label="Version" value={process.env.npm_package_version ?? "0.1.0"} />
          <Link
            href="/docs"
            className="flex justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
          >
            <span className="font-medium text-green-starbucks dark:text-green-400">Documentation</span>
            <span className="text-green-starbucks dark:text-green-400">→</span>
          </Link>
        </Section>

        {/* Collection preferences — visible to all roles; editing is owner-only (enforced by the page) */}
        <Section title="Collection">
            <Link
              href="/settings/collection"
              className="flex justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
            >
              <span className="font-medium text-green-starbucks dark:text-green-400">What I Collect</span>
              <span className="text-green-starbucks dark:text-green-400">→</span>
            </Link>
        </Section>

        {/* Admin tools — owners only */}
        {role === "owner" && (
          <Section title="Admin">
            <Link
              href="/admin/import"
              className="flex justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
            >
              <span className="font-medium text-green-starbucks dark:text-green-400">Import Cups</span>
              <span className="text-green-starbucks dark:text-green-400">→</span>
            </Link>
            <Link
              href="/admin/duplicates"
              className="flex justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
            >
              <span className="font-medium text-green-starbucks dark:text-green-400">Duplicate Cups</span>
              <span className="text-green-starbucks dark:text-green-400">→</span>
            </Link>
          </Section>
        )}

        {/* Sign out */}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 font-semibold rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 transition-colors">
            Sign Out
          </button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
        {title}
      </h2>
      <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}
