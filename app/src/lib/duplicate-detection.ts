import type { Cup } from "@/types";

export interface DuplicateGroup {
  key: string;   // human-readable group label
  cups: Cup[];
}

// Strip a trailing " 2", " 3", " 10" etc. from a cup name to get its base location.
// "Atlanta 2" → "Atlanta",  "Disney Springs 2" → "Disney Springs",  "Atlanta" → "Atlanta"
export function baseName(name: string): string {
  return name.replace(/\s+\d+$/, "").trim();
}

// Two cups are potential duplicates when they share the same series, country_code,
// scope, region, item_type, AND their names share the same base (one is "Atlanta",
// the other is "Atlanta 2"). A mug and an ornament are never duplicates of each other.
// Owned-cup status is irrelevant here — the admin sees all.
// Variant cups (variant_of !== "") are intentional entries and are excluded — only
// distinct base cups can be true duplicates of each other.
export function detectDuplicateGroups(cups: Cup[]): DuplicateGroup[] {
  type BucketKey = string;
  const buckets = new Map<BucketKey, Cup[]>();

  for (const cup of cups.filter((c) => !c.variant_of)) {
    const scope    = cup.scope     || "city";
    const region   = cup.region    || "";
    const itemType = cup.item_type || "mug";
    const key      = `${cup.series}|${cup.country_code}|${scope}|${region}|${itemType}|${baseName(cup.name)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(cup);
    buckets.set(key, bucket);
  }

  const groups: DuplicateGroup[] = [];
  for (const [, members] of buckets) {
    if (members.length < 2) continue;
    // Sort so the "plain" name (no trailing number) comes first
    members.sort((a, b) => a.name.localeCompare(b.name));
    const rep = members[0];
    const scopeLabel = rep.scope && rep.scope !== "city" ? ` (${rep.scope})` : "";
    const regionPart = rep.region ? ` · ${rep.region}` : "";
    const typeLabel = (rep.item_type || "mug") !== "mug" ? ` · ${rep.item_type}` : "";
    groups.push({
      key: `${rep.series} · ${baseName(rep.name)}${regionPart} · ${rep.country}${scopeLabel}${typeLabel}`,
      cups: members,
    });
  }

  groups.sort((a, b) => a.key.localeCompare(b.key));
  return groups;
}
