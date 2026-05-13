"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { roleFromGroups, canWrite } from "@/lib/roles";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";

interface ImportResult {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  errors: number;
  preview: string[];
}

export default function AdminImportPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = new FormData(e.currentTarget);
      const res = await fetch("/api/admin/import", { method: "POST", body: data });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;
  if (!canWrite(roleFromGroups(session.user.groups ?? []))) {
    router.replace("/access-denied");
    return null;
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-green-dark text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link href="/settings" className="text-xl">←</Link>
        <h1 className="font-bold text-lg">Import Cups</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong className="block mb-1">Prefer the CLI for large imports</strong>
          <code className="bg-amber-100 px-1 rounded text-xs">import-cups --file cups.csv --dry-run</code>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
            <input
              type="file"
              name="csv"
              accept=".csv"
              required
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-green-starbucks file:text-white file:font-medium file:cursor-pointer"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" name="dry_run" defaultChecked className="rounded" />
            Dry run (preview only — no changes written)
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gold text-green-dark font-bold rounded-xl cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing…" : "Upload and Preview"}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 text-sm ${result.dryRun ? "bg-blue-50 border border-blue-200 text-blue-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
              <strong className="block mb-2">{result.dryRun ? "Dry run complete — no changes written" : "Import complete"}</strong>
              <div className="space-y-0.5">
                <div>{result.dryRun ? "Would create" : "Created"}: {result.created}</div>
                <div>{result.dryRun ? "Would update" : "Updated"}: {result.updated}</div>
                {result.errors > 0 && <div className="text-red-600">Errors: {result.errors}</div>}
                <div className="text-xs opacity-70 mt-1">{result.rows} rows parsed</div>
              </div>
            </div>

            {result.preview.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Preview
                </div>
                <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {result.preview.map((line, i) => (
                    <li key={i} className={`px-4 py-2 text-xs font-mono ${line.startsWith("UPDATE") ? "text-amber-700" : "text-green-700"}`}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400">
          Expected columns: city, region, country, country_code, series, year, lat, lng, image_url, notes
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
