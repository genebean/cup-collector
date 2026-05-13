import { getPocketBase } from "@/lib/pocketbase";
import type { Household, UserRole } from "@/types";

// Group names must match the PocketID groups assigned to users.
// Defaults work out of the box; override via env vars if needed.
const OWNER_GROUP = process.env.ROLE_GROUP_OWNER ?? "cup-owner";
const COLLABORATOR_GROUP = process.env.ROLE_GROUP_COLLABORATOR ?? "cup-collaborator";
const VIEWER_GROUP = process.env.ROLE_GROUP_VIEWER ?? "cup-viewer";

// Derive a role from the PocketID groups claim (included when "groups" scope is requested).
export function roleFromGroups(groups: string[]): UserRole {
  if (groups.includes(OWNER_GROUP)) return "owner";
  if (groups.includes(COLLABORATOR_GROUP)) return "collaborator";
  if (groups.includes(VIEWER_GROUP)) return "viewer";
  return "none";
}

// Resolve role and fetch the single household record (needed for owned_cups queries).
export async function resolveRole(groups: string[]): Promise<{
  role: UserRole;
  household: Household | null;
}> {
  const role = roleFromGroups(groups);
  if (role === "none") return { role: "none", household: null };

  try {
    const pb = getPocketBase();
    const records = await pb.collection("households").getList<Household>(1, 1);
    return { role, household: records.items[0] ?? null };
  } catch {
    return { role, household: null };
  }
}

// Check whether a role has write access.
export function canWrite(role: UserRole): boolean {
  return role === "owner" || role === "collaborator";
}
