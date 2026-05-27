import fs from "fs";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { auth } from "@/app/auth";
import { BottomNav } from "@/components/BottomNav";

function readChangelog(): string {
  // In the Nix build, CHANGELOG.md is copied into the app source root.
  // In local dev, it lives one level up at the repo root.
  for (const candidate of [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "..", "CHANGELOG.md"),
  ]) {
    try {
      return fs.readFileSync(candidate, "utf-8");
    } catch {
      // try next
    }
  }
  return "# Changelog\n\nNo changelog generated yet. Run `cc-gen-changelog` to generate it.";
}

export const metadata = { title: "Changelog" };

export default async function ChangelogPage() {
  const session = await auth();
  if (!session?.user?.householdId) redirect("/sign-in");

  const content = readChangelog();

  return (
    <div className="flex flex-col h-screen bg-cream dark:bg-gray-900">
      <header className="bg-green-dark text-white px-4 py-3 header-safe-top flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-white/80 hover:text-white text-sm"
            aria-label="Back to settings"
          >
            ←
          </Link>
          <h1 className="font-bold text-lg leading-tight">Changelog</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 px-4 py-6">
        <div className="max-w-2xl mx-auto prose prose-sm dark:prose-invert
          prose-headings:font-bold
          prose-h1:text-xl prose-h1:mb-4 prose-h1:text-gray-900 dark:prose-h1:text-gray-100
          prose-h2:text-base prose-h2:mt-8 prose-h2:mb-2 prose-h2:text-green-starbucks dark:prose-h2:text-green-400 prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-gray-700 prose-h2:pb-1
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1 prose-h3:text-gray-700 dark:prose-h3:text-gray-300 prose-h3:uppercase prose-h3:tracking-wide
          prose-ul:my-1 prose-li:my-0.5 prose-li:text-sm prose-li:text-gray-700 dark:prose-li:text-gray-300
          prose-p:text-sm prose-p:text-gray-600 dark:prose-p:text-gray-400
          prose-a:text-green-starbucks dark:prose-a:text-green-400 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-800 dark:prose-strong:text-gray-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
