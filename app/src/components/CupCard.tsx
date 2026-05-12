import Link from "next/link";
import type { CupWithOwnership } from "@/types";

interface CupCardProps {
  cup: CupWithOwnership;
}

// Series-specific accent colors for the placeholder when no image is available
const seriesColors: Record<string, string> = {
  "You Are Here": "bg-green-starbucks",
  "Been There": "bg-blue-600",
  "Ornament": "bg-red-600",
};

// Displays a single cup in a list — used on Browse and Search screens.
// Tapping the card navigates to the Cup Detail screen.
export function CupCard({ cup }: CupCardProps) {
  const accentColor = seriesColors[cup.series] ?? "bg-gray-500";

  return (
    <Link
      href={`/cup/${cup.id}`}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 hover:bg-cream active:bg-gray-50 transition-colors"
    >
      {/* Cup image or placeholder */}
      <div
        className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-lg ${
          cup.image ? "" : accentColor
        }`}
        style={
          cup.image
            ? {
                backgroundImage: `url(${cup.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}
        }
      >
        {!cup.image && cup.city.charAt(0).toUpperCase()}
      </div>

      {/* Cup metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 truncate">{cup.city}</span>
          {/* Flag emoji from ISO country code */}
          <span className="text-sm" title={cup.country}>
            {countryCodeToFlag(cup.country_code)}
          </span>
        </div>
        <div className="text-xs text-gray-500 truncate">
          {cup.series} · {cup.year}
          {cup.region ? ` · ${cup.region}` : ""}
        </div>
      </div>

      {/* Ownership status badge */}
      <div className="flex-shrink-0">
        {cup.isOwned ? (
          <span className="text-xs font-medium text-green-starbucks bg-green-50 px-2 py-0.5 rounded-full">
            Owned
          </span>
        ) : (
          <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            Needed
          </span>
        )}
      </div>
    </Link>
  );
}

// Convert ISO 3166-1 alpha-2 country code to flag emoji
// Works by converting each letter to a regional indicator symbol
function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}
