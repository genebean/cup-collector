import { auth, signOut } from "@/app/auth";
import { redirect } from "next/navigation";
import { resolveRole } from "@/lib/roles";
import { BottomNav } from "@/components/BottomNav";

// Settings is a server component — reads session and role server-side,
// no client-side JS needed for this static page.
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.pocketIdSub) redirect("/sign-in");

  const { role, household } = await resolveRole(session.user.pocketIdSub);
  if (role === "none") redirect("/access-denied");

  const roleLabels = {
    owner: "Owner",
    collaborator: "Collaborator",
    viewer: "Viewer",
  };

  return (
    <div className="flex flex-col h-screen bg-cream">
      <header className="bg-green-dark text-white px-4 py-3 flex-shrink-0">
        <h1 className="font-bold text-lg">Settings</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 px-4 py-4 space-y-4">
        {/* Account info */}
        <Section title="Account">
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Role" value={roleLabels[role] ?? role} />
        </Section>

        {/* Household info */}
        {household && (
          <Section title="Household">
            <Row label="Name" value={household.name} />
          </Section>
        )}

        {/* App info */}
        <Section title="App">
          <Row label="Version" value={process.env.npm_package_version ?? "0.1.0"} />
        </Section>

        {/* Sign out */}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 font-semibold"
          >
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
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
        {title}
      </h2>
      <div className="bg-white rounded-xl divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
