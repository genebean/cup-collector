import Link from "next/link";
import type { CupWithOwnership } from "@/types";
import { getFileUrl } from "@/lib/pocketbase";
import { countryCodeToFlag } from "@/lib/country";

interface CupCardProps {
  cup: CupWithOwnership;
}

// Series-specific accent colors for the placeholder when no image is available
const seriesColors: Record<string, string> = {
  "You Are Here": "bg-green-starbucks",
  "Been There": "bg-blue-600",
};

// Displays a single cup in a list — used on Browse and Search screens.
// Tapping the card navigates to the Cup Detail screen.
export function CupCard({ cup }: CupCardProps) {
  const accentColor = seriesColors[cup.series] ?? (cup.item_type === "ornament" ? "bg-red-600" : "bg-gray-500");

  return (
    <Link
      href={`/cup/${cup.id}`}
      className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 hover:bg-cream dark:hover:bg-gray-700 active:bg-gray-50 dark:active:bg-gray-600 transition-colors"
    >
      {/* Cup image or placeholder */}
      <div
        className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-lg ${
          cup.image ? "" : accentColor
        }`}
        style={
          cup.image
            ? {
                backgroundImage: `url(${getFileUrl(cup.collectionId, cup.id, cup.image)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}
        }
      >
        {!cup.image && cup.name.charAt(0).toUpperCase()}
      </div>

      {/* Cup metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{cup.name}</span>
          {cup.item_type === "ornament" && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 flex-shrink-0">
              ornament
            </span>
          )}
          {(cup.scope === "state" || cup.scope === "country" || cup.scope === "themed") && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0 capitalize">
              {cup.scope}
            </span>
          )}
          {/* Flag emoji from ISO country code */}
          <span className="text-sm" title={cup.country}>
            {countryCodeToFlag(cup.country_code)}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {cup.series} · {cup.year}
          {cup.region ? ` · ${cup.region}` : ""}
        </div>
      </div>

      {/* Ownership status badge.
          Needs-replacing cups show orange like unowned — both are action items. */}
      <div className="flex-shrink-0">
        {cup.isOwned && cup.ownedRecord?.needs_replacing ? (
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
            Needs Replacing
          </span>
        ) : cup.isOwned ? (
          <span className="text-xs font-medium text-green-starbucks dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            Owned
          </span>
        ) : (
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
            Needed
          </span>
        )}
      </div>
    </Link>
  );
}
