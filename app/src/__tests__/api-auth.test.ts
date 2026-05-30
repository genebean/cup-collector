import { describe, it, expect } from "vitest";
import { isAuthorizedWriter } from "@/lib/roles";

// requireWriter() in lib/api-auth.ts calls auth() which cannot be mocked per
// project convention. It is covered by the Playwright e2e suite.
// Only isAuthorizedWriter() (the pure logic extracted into lib/roles.ts) is tested here.

describe("isAuthorizedWriter", () => {
  it("returns false for null session", () => {
    expect(isAuthorizedWriter(null)).toBe(false);
  });

  it("returns false when user is null", () => {
    expect(isAuthorizedWriter({ user: null })).toBe(false);
  });

  it("returns false when pocketIdSub is missing", () => {
    expect(isAuthorizedWriter({ user: { householdRole: "owner" } })).toBe(false);
  });

  it("returns false when pocketIdSub is empty string", () => {
    expect(isAuthorizedWriter({ user: { pocketIdSub: "", householdRole: "owner" } })).toBe(false);
  });

  it("returns false when householdRole is viewer", () => {
    expect(isAuthorizedWriter({ user: { pocketIdSub: "sub_123", householdRole: "viewer" } })).toBe(false);
  });

  it("returns false when householdRole is null", () => {
    expect(isAuthorizedWriter({ user: { pocketIdSub: "sub_123", householdRole: null } })).toBe(false);
  });

  it("returns true when pocketIdSub is set and householdRole is owner", () => {
    expect(isAuthorizedWriter({ user: { pocketIdSub: "sub_123", householdRole: "owner" } })).toBe(true);
  });
});
