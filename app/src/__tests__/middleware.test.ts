import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveMiddlewareAction } from "@/lib/middleware-logic";

// ── File placement guards ────────────────────────────────────────────────────
// Next.js only picks up route interception from a specific filename.
// In Next.js 15 and earlier the file was middleware.ts; Next.js 16 renamed it
// to proxy.ts (middleware.ts still works with a deprecation warning, but both
// cannot coexist).
//
// These tests read the expected filename(s) from the installed Next.js package
// so they stay correct across version upgrades without manual updates.

const srcDir = join(import.meta.dirname, "..");

// Import as CJS interop — constants.js is CommonJS
const { PROXY_FILENAME, MIDDLEWARE_FILENAME } = await import(
  "next/dist/lib/constants.js"
);

// Preferred filename for this Next.js version
const preferredFile = `${PROXY_FILENAME}.ts`;
const deprecatedFile = `${MIDDLEWARE_FILENAME}.ts`;

describe("Next.js route-interception file placement", () => {
  it(`uses the filename this Next.js version expects: ${preferredFile}`, () => {
    expect(existsSync(join(srcDir, preferredFile))).toBe(true);
  });

  it(`does not use the deprecated filename ${deprecatedFile}`, () => {
    if ((PROXY_FILENAME as string) === MIDDLEWARE_FILENAME) return; // same name in older Next.js — skip
    expect(existsSync(join(srcDir, deprecatedFile))).toBe(false);
  });

  it("does not have both files simultaneously (Next.js throws on conflict)", () => {
    const hasBoth =
      existsSync(join(srcDir, preferredFile)) &&
      existsSync(join(srcDir, deprecatedFile));
    expect(hasBoth).toBe(false);
  });

  it(`exports a named '${PROXY_FILENAME}' handler — default export is not recognised by Next.js ${PROXY_FILENAME}.ts convention`, () => {
    const content = readFileSync(join(srcDir, preferredFile), "utf-8");
    // Matches both `export { auth as proxy }` and `export const proxy = ...`
    expect(content).toMatch(new RegExp(`\\bexport\\b.+\\b${PROXY_FILENAME}\\b`));
  });
});

// ── Routing logic ────────────────────────────────────────────────────────────

describe("resolveMiddlewareAction — public paths", () => {
  it("allows /sign-in without authentication", () => {
    expect(resolveMiddlewareAction("/sign-in", false, [])).toBe("allow");
  });

  it("allows /access-denied without authentication", () => {
    expect(resolveMiddlewareAction("/access-denied", false, [])).toBe("allow");
  });

  it("allows /auth-error without authentication", () => {
    expect(resolveMiddlewareAction("/auth-error", false, [])).toBe("allow");
  });

  it("allows subpaths of public routes", () => {
    expect(resolveMiddlewareAction("/sign-in/callback", false, [])).toBe("allow");
  });
});

describe("resolveMiddlewareAction — unauthenticated", () => {
  it("redirects to /sign-in", () => {
    expect(resolveMiddlewareAction("/map", false, [])).toBe("/sign-in");
    expect(resolveMiddlewareAction("/browse", false, [])).toBe("/sign-in");
    expect(resolveMiddlewareAction("/settings", false, [])).toBe("/sign-in");
    expect(resolveMiddlewareAction("/", false, [])).toBe("/sign-in");
  });
});

describe("resolveMiddlewareAction — authenticated, no groups", () => {
  it("redirects to /access-denied with empty groups", () => {
    expect(resolveMiddlewareAction("/map", true, [])).toBe("/access-denied");
  });

  it("redirects to /access-denied with unrecognised groups", () => {
    expect(resolveMiddlewareAction("/map", true, ["some-other-group"])).toBe("/access-denied");
  });
});

describe("resolveMiddlewareAction — authenticated, valid group", () => {
  beforeEach(() => {
    delete process.env.ROLE_GROUP_OWNER;
    delete process.env.ROLE_GROUP_COLLABORATOR;
    delete process.env.ROLE_GROUP_VIEWER;
  });

  it("allows cup-owner group", () => {
    expect(resolveMiddlewareAction("/map", true, ["cup-owner"])).toBe("allow");
  });

  it("allows cup-collaborator group", () => {
    expect(resolveMiddlewareAction("/map", true, ["cup-collaborator"])).toBe("allow");
  });

  it("allows cup-viewer group", () => {
    expect(resolveMiddlewareAction("/map", true, ["cup-viewer"])).toBe("allow");
  });

  it("allows when user has extra unrecognised groups alongside a known one", () => {
    expect(resolveMiddlewareAction("/map", true, ["other", "cup-viewer"])).toBe("allow");
  });

  it("respects ROLE_GROUP_OWNER env var override", () => {
    process.env.ROLE_GROUP_OWNER = "custom-owner";
    expect(resolveMiddlewareAction("/map", true, ["custom-owner"])).toBe("allow");
    expect(resolveMiddlewareAction("/map", true, ["cup-owner"])).toBe("/access-denied");
  });
});
