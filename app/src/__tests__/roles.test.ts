import { describe, it, expect } from "vitest";
import { parseHouseholdGroups, roleFromMembership, canWrite } from "@/lib/roles";

describe("parseHouseholdGroups", () => {
  it("parses an owner group", () => {
    expect(parseHouseholdGroups(["my-household-owner"])).toEqual([
      { slug: "my-household", role: "owner" },
    ]);
  });

  it("parses a viewer group", () => {
    expect(parseHouseholdGroups(["my-household-viewer"])).toEqual([
      { slug: "my-household", role: "viewer" },
    ]);
  });

  it("ignores unrelated groups", () => {
    expect(parseHouseholdGroups(["admin", "superuser"])).toEqual([]);
  });

  it("returns empty for empty groups", () => {
    expect(parseHouseholdGroups([])).toEqual([]);
  });

  it("parses multiple household memberships", () => {
    const result = parseHouseholdGroups(["home-owner", "work-viewer", "irrelevant"]);
    expect(result).toEqual([
      { slug: "home", role: "owner" },
      { slug: "work", role: "viewer" },
    ]);
  });

  it("handles slugs with hyphens", () => {
    expect(parseHouseholdGroups(["my-test-household-owner"])).toEqual([
      { slug: "my-test-household", role: "owner" },
    ]);
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
