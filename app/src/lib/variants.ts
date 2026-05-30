import type { Cup, CupWithOwnership } from "@/types";

// A group of cups that are variants of the same physical location cup.
// `base` is the canonical entry (no variant_of set, or an orphaned variant
// whose base is absent from the current list). `members` always starts with
// the base and is sorted alphabetically by name after that.
// Generic so callers can pass Cup[] or CupWithOwnership[] and get typed members back.
export interface VariantGroup<T extends Cup = Cup> {
  base: T;
  members: T[]; // length >= 1; base is always members[0]
}

// Group a flat list of cups into variant groups.
//
// Rules:
//   - A cup with variant_of set (and is_unique false) belongs to the group
//     headed by the cup whose id === variant_of.
//   - A cup with is_unique true is always its own single-member group,
//     regardless of whether variant_of is set.
//   - A cup whose variant_of points to an id not present in the list
//     (orphaned variant) is treated as its own base.
//   - Cups with no variant_of and no children are single-member groups.
//
// The function preserves the original order of base cups; variant members
// within each group are sorted alphabetically by name.
export function groupByVariant<T extends Cup>(cups: T[]): VariantGroup<T>[] {
  const byId = new Map(cups.map((c) => [c.id, c]));

  // Collect confirmed children for each base id.
  // "Confirmed" means: variant_of is set, is_unique is false, and the base
  // is present in the list.
  const childrenOf = new Map<string, T[]>();
  for (const cup of cups) {
    if (cup.is_unique || !cup.variant_of) continue;
    if (!byId.has(cup.variant_of)) continue; // orphan — handled as own base below
    const arr = childrenOf.get(cup.variant_of) ?? [];
    arr.push(cup);
    childrenOf.set(cup.variant_of, arr);
  }

  const groups: VariantGroup<T>[] = [];
  for (const cup of cups) {
    // Non-unique cup with a known base in the list → skip; it appears as a child
    if (!cup.is_unique && cup.variant_of && byId.has(cup.variant_of)) continue;

    const children = [...(childrenOf.get(cup.id) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    groups.push({ base: cup, members: [cup, ...children] });
  }

  return groups;
}

// A group "needs action" when there is no good owned copy — every member is either
// unowned or owned but flagged for replacement. Owning any member in good condition covers the group.
export function groupNeedsAction(members: CupWithOwnership[]): boolean {
  return members.every((c) => !c.isOwned || (c.ownedRecord?.needs_replacing ?? false));
}

// Returns the member with the highest trailing variant number (e.g. "Atlanta 3" > "Atlanta 2" > "Atlanta").
// Tiebreaks by year (descending). For a single-member group this is always members[0].
export function findRepresentative<T extends Cup>(members: T[]): T {
  return members.reduce((best, c) => {
    const numBest = +(best.name.match(/\s+(\d+)$/) ?? [0, 0])[1];
    const numC = +(c.name.match(/\s+(\d+)$/) ?? [0, 0])[1];
    if (numC > numBest) return c;
    if (numBest > numC) return best;
    return (c.year ?? 0) >= (best.year ?? 0) ? c : best;
  });
}
