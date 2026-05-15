import { describe, it, expect, vi } from "vitest";
import { roleFromGroups, canWrite, resolveRole } from "@/lib/roles";

// Mock getPocketBase so resolveRole's catch path can be exercised without a
// running server. This tests error-handling logic, not database behaviour.
vi.mock("@/lib/pocketbase", () => ({
  getPocketBase: vi.fn(() => ({
    collection: () => ({
      getList: vi.fn().mockRejectedValue(new Error("connection refused")),
    }),
  })),
}));

describe("roleFromGroups", () => {
  it("returns 'owner' for cup-owner group", () => {
    expect(roleFromGroups(["cup-owner"])).toBe("owner");
  });

  it("returns 'collaborator' for cup-collaborator group", () => {
    expect(roleFromGroups(["cup-collaborator"])).toBe("collaborator");
  });

  it("returns 'viewer' for cup-viewer group", () => {
    expect(roleFromGroups(["cup-viewer"])).toBe("viewer");
  });

  it("returns 'none' for empty groups", () => {
    expect(roleFromGroups([])).toBe("none");
  });

  it("returns 'none' for unrecognised groups", () => {
    expect(roleFromGroups(["admin", "superuser"])).toBe("none");
  });

  it("owner takes priority when user has multiple groups", () => {
    expect(roleFromGroups(["cup-viewer", "cup-owner"])).toBe("owner");
  });

  it("collaborator takes priority over viewer", () => {
    expect(roleFromGroups(["cup-viewer", "cup-collaborator"])).toBe("collaborator");
  });
});

describe("canWrite", () => {
  it("returns true for owner", () => {
    expect(canWrite("owner")).toBe(true);
  });

  it("returns true for collaborator", () => {
    expect(canWrite("collaborator")).toBe(true);
  });

  it("returns false for viewer", () => {
    expect(canWrite("viewer")).toBe(false);
  });

  it("returns false for none", () => {
    expect(canWrite("none")).toBe(false);
  });
});


describe("resolveRole", () => {
  it("returns none role and null household immediately for unrecognised groups (no PocketBase call)", async () => {
    const result = await resolveRole([]);
    expect(result.role).toBe("none");
    expect(result.household).toBeNull();
  });

  it("returns the correct role and null household when PocketBase throws", async () => {
    // getPocketBase is mocked to throw — exercises the catch block.
    const result = await resolveRole(["cup-viewer"]);
    expect(result.role).toBe("viewer");
    expect(result.household).toBeNull();
  });

  it("returns owner role and null household when PocketBase throws", async () => {
    const result = await resolveRole(["cup-owner"]);
    expect(result.role).toBe("owner");
    expect(result.household).toBeNull();
  });
});
