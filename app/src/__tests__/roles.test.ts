import { describe, it, expect } from "vitest";
import { parseHouseholdGroups, roleFromMembership, canWrite } from "@/lib/roles";

describe("parseHouseholdGroups", () => {
  it("parses an owner group", () => {
    expect(parseHouseholdGroups(["cup_collector_my_household_owner"])).toEqual([
      { slug: "my_household", role: "owner" },
    ]);
  });

  it("parses a viewer group", () => {
    expect(parseHouseholdGroups(["cup_collector_my_household_viewer"])).toEqual([
      { slug: "my_household", role: "viewer" },
    ]);
  });

  it("ignores groups from other apps (no cup_collector_ prefix)", () => {
    expect(parseHouseholdGroups(["admin", "superuser", "other-app-owner"])).toEqual([]);
  });

  it("returns empty for empty groups", () => {
    expect(parseHouseholdGroups([])).toEqual([]);
  });

  it("parses multiple household memberships", () => {
    const result = parseHouseholdGroups([
      "cup_collector_home_owner",
      "cup_collector_work_viewer",
      "irrelevant-other-app-group",
    ]);
    expect(result).toEqual([
      { slug: "home", role: "owner" },
      { slug: "work", role: "viewer" },
    ]);
  });

  it("handles multi-word slugs", () => {
    expect(parseHouseholdGroups(["cup_collector_my_test_household_owner"])).toEqual([
      { slug: "my_test_household", role: "owner" },
    ]);
  });

  it("ignores prefixed groups with unknown role suffix", () => {
    expect(parseHouseholdGroups(["cup_collector_my_household_collaborator"])).toEqual([]);
  });
});

describe("roleFromMembership", () => {
  it("returns 'owner' for owner membership", () => {
    expect(roleFromMembership({ slug: "home", role: "owner" })).toBe("owner");
  });

  it("returns 'viewer' for viewer membership", () => {
    expect(roleFromMembership({ slug: "home", role: "viewer" })).toBe("viewer");
  });

  it("returns 'none' for null", () => {
    expect(roleFromMembership(null)).toBe("none");
  });

  it("returns 'none' for undefined", () => {
    expect(roleFromMembership(undefined)).toBe("none");
  });
});

describe("canWrite", () => {
  it("returns true for owner", () => {
    expect(canWrite("owner")).toBe(true);
  });

  it("returns false for viewer", () => {
    expect(canWrite("viewer")).toBe(false);
  });

  it("returns false for none", () => {
    expect(canWrite("none")).toBe(false);
  });
});
