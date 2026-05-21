import type { UserRole } from "@/types";

// Groups in PocketID follow the convention "cup_collector_{slug}_{role}".
// The "cup_collector_" prefix namespaces groups so other apps sharing the same
// PocketID instance don't interfere. The slug links to households.group_slug in
// PocketBase; the role suffix is "owner" or "viewer".
// Example: "cup_collector_smith_family_owner"

export const GROUP_PREFIX = "cup_collector_";

export interface HouseholdMembership {
  slug: string;
  role: "owner" | "viewer";
}

// Parse JWT groups into household memberships. Groups without the app prefix
// are silently ignored — they belong to other PocketID clients.
export function parseHouseholdGroups(groups: string[]): HouseholdMembership[] {
  return groups.flatMap((g): HouseholdMembership[] => {
    if (!g.startsWith(GROUP_PREFIX)) return [];
    const rest = g.slice(GROUP_PREFIX.length); // e.g. "smith_family_owner"
    if (rest.endsWith("_owner")) return [{ slug: rest.slice(0, -6), role: "owner" }];
    if (rest.endsWith("_viewer")) return [{ slug: rest.slice(0, -7), role: "viewer" }];
    return [];
  });
}

// Derive a UserRole from a household membership (used in UI permission checks).
export function roleFromMembership(membership: HouseholdMembership | null | undefined): UserRole {
  if (!membership) return "none";
  return membership.role; // "owner" | "viewer" — both are valid UserRole values
}

// Check whether a role has write access.
export function canWrite(role: UserRole): boolean {
  return role === "owner";
}
