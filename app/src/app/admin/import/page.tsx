import { auth } from "@/app/auth";
import { redirect } from "next/navigation";
import { resolveRole } from "@/lib/roles";

// Admin import screen — not in the normal bottom navigation.
// Protected: only owners and collaborators can access it.
// The preferred path is the CLI script (scripts/import-cups.ts), but this
// page provides a browser-based fallback with dry-run preview.
export default async function AdminImportPage() {
  const session = await auth();
  if (!session?.user?.pocketIdSub) redirect("/sign-in");

  const { role } = await resolveRole(session.user.pocketIdSub);
  if (role === "viewer" || role === "none") redirect("/access-denied");

  return (
    <div className="min-h-screen bg-cream p-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-green-dark mb-2">Import Cups</h1>
        <p className="text-sm text-gray-600 mb-6">
          Upload a CSV file to update the cup catalog. A dry-run preview is shown
          before any changes are written.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <strong className="block mb-1">Prefer the CLI</strong>
          The import script at <code className="bg-amber-100 px-1 rounded">scripts/import-cups.ts</code> gives
          richer output and is safer for large imports. Run it inside{" "}
          <code className="bg-amber-100 px-1 rounded">nix develop</code>:
          <pre className="mt-2 text-xs bg-amber-100 rounded p-2 overflow-x-auto">
            npx ts-node scripts/import-cups.ts --file cups.csv --dry-run
          </pre>
        </div>

        {/* CSV upload form — wired to /api/admin/import */}
        <form action="/api/admin/import" method="POST" encType="multipart/form-data" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CSV File
            </label>
            <input
              type="file"
              name="csv"
              accept=".csv"
              required
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-green-starbucks file:text-white file:font-medium"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" name="dry_run" defaultChecked className="rounded" />
            Dry run (preview only — no changes written)
          </label>
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-green-starbucks text-white font-semibold"
          >
            Upload and Preview
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400">
          Expected CSV columns: city, region, country, country_code, series, year, lat, lng, image_url, notes
        </p>
      </div>
    </div>
  );
}
