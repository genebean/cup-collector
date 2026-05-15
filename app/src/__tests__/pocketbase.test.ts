import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFileUrl, getPocketBase, getAdminPocketBase } from "@/lib/pocketbase";

describe("getFileUrl", () => {
  it("returns empty string when filename is empty", () => {
    expect(getFileUrl("cups", "rec123", "")).toBe("");
  });

  it("builds the correct proxy path", () => {
    expect(getFileUrl("cups_abc", "rec456", "photo.jpg")).toBe(
      "/api/pb/api/files/cups_abc/rec456/photo.jpg"
    );
  });

  it("URL-encodes spaces in filenames", () => {
    expect(getFileUrl("cups", "rec", "my photo.jpg")).toBe(
      "/api/pb/api/files/cups/rec/my%20photo.jpg"
    );
  });

  it("includes collection and record IDs verbatim", () => {
    const url = getFileUrl("col_1a2b", "rec_3c4d", "img.png");
    expect(url).toContain("col_1a2b");
    expect(url).toContain("rec_3c4d");
  });
});

describe("getPocketBase (server-side)", () => {
  it("returns a PocketBase client instance when called server-side", () => {
    // In the node test environment, typeof window === "undefined", so this
    // exercises the server-side branch (direct PocketBase URL, no proxy).
    const pb = getPocketBase();
    expect(pb).toBeDefined();
    expect(typeof pb.collection).toBe("function");
  });
});

describe("getAdminPocketBase", () => {
  let savedEmail: string | undefined;
  let savedPassword: string | undefined;

  beforeEach(() => {
    savedEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    savedPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
  });

  afterEach(() => {
    process.env.POCKETBASE_ADMIN_EMAIL = savedEmail;
    process.env.POCKETBASE_ADMIN_PASSWORD = savedPassword;
  });

  it("throws when admin credentials are not set", async () => {
    delete process.env.POCKETBASE_ADMIN_EMAIL;
    delete process.env.POCKETBASE_ADMIN_PASSWORD;
    await expect(getAdminPocketBase()).rejects.toThrow(
      "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are required"
    );
  });

  it("throws when only email is set", async () => {
    process.env.POCKETBASE_ADMIN_EMAIL = "admin@test.local";
    delete process.env.POCKETBASE_ADMIN_PASSWORD;
    await expect(getAdminPocketBase()).rejects.toThrow();
  });
});
