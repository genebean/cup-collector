import type { UserRole } from "@/types";

// Groups in PocketID follow the convention "{household-slug}-owner" and
// "{household-slug}-viewer". The slug links to the households.group_slug field
// in PocketBase, so household membership is managed entirely in PocketID —
// no raw OIDC subs needed when adding members.

export interface HouseholdMembership {
  slug: string;
  role: "owner" | "viewer";
}

// Parse JWT groups into household memberships. Groups that don't match the
// convention are silently ignored (they may be unrelated PocketID groups).
export function parseHouseholdGroups(groups: string[]): HouseholdMembership[] {
  return groups.flatMap((g): HouseholdMembership[] => {
    if (g.endsWith("-owner")) return [{ slug: g.slice(0, -6), role: "owner" }];
    if (g.endsWith("-viewer")) return [{ slug: g.slice(0, -7), role: "viewer" }];
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
