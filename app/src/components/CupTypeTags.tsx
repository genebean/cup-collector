import type { CupScope } from "@/types";

interface CupTypeTagsProps {
  item_type: string;
  scope: CupScope;
}

// Renders the ornament and scope (state/country/themed) type pills for a cup.
// Used in CupCard and MapBottomSheet wherever the cup type needs to be labeled.
export function CupTypeTags({ item_type, scope }: CupTypeTagsProps) {
  return (
    <>
      {item_type === "ornament" && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-green-dark dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0">
          ornament
        </span>
      )}
      {(scope === "state" || scope === "country" || scope === "themed") && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 flex-shrink-0 capitalize">
          {scope}
        </span>
      )}
    </>
  );
}
