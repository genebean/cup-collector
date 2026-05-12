import { getPocketBase } from "@/lib/pocketbase";
import type { Household, UserRole } from "@/types";

// Resolve the current user's role by looking up their PocketID sub in the
// household record. Called server-side on authenticated requests.
//
// Role resolution rules (from spec §02):
//   sub == member_sub_1 or member_sub_2  →  "owner" or "collaborator" (full write)
//   sub in viewer_subs                   →  "viewer" (read-only)
//   no match                             →  "none" (redirect to access-denied)
export async function resolveRole(pocketIdSub: string): Promise<{
  role: UserRole;
  household: Household | null;
}> {
  const pb = getPocketBase();

  try {
    // Fetch the household where this user appears in any role field.
    // PocketBase filter syntax: || is OR, ~ is "contains" for JSON arrays.
    const records = await pb.collection("households").getList<Household>(1, 1, {
      filter: `member_sub_1="${pocketIdSub}" || member_sub_2="${pocketIdSub}" || viewer_subs~"${pocketIdSub}"`,
    });

    if (records.totalItems === 0) {
      return { role: "none", household: null };
    }

    const household = records.items[0];

    if (
      household.member_sub_1 === pocketIdSub ||
      household.member_sub_2 === pocketIdSub
    ) {
      // Both primary members have full read+write access.
      // We label member_sub_1 "owner" and member_sub_2 "collaborator" for display,
      // but the actual permissions are identical.
      const role: UserRole =
        household.member_sub_1 === pocketIdSub ? "owner" : "collaborator";
      return { role, household };
    }

    // viewer_subs is stored as a JSON array in PocketBase
    const viewerSubs: string[] =
      typeof household.viewer_subs === "string"
        ? JSON.parse(household.viewer_subs)
        : (household.viewer_subs ?? []);

    if (viewerSubs.includes(pocketIdSub)) {
      return { role: "viewer", household };
    }

    return { role: "none", household: null };
  } catch (err) {
    console.error("Role resolution failed:", err);
    return { role: "none", household: null };
  }
}

// Check whether a role has write access.
// Used to guard "Mark as Owned" and photo upload controls.
// Viewers must not see write controls — enforced here AND in PocketBase rules.
export function canWrite(role: UserRole): boolean {
  return role === "owner" || role === "collaborator";
}
