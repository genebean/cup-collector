import { describe, it, expect } from "vitest";
import { pocketIdProvider } from "@/lib/pocketid-provider";

describe("pocketIdProvider", () => {
  it("explicitly requests both pkce and state checks", () => {
    // Regression lock: a transitive oauth4webapi bump (3.8.6 -> 3.8.8)
    // silently changed its default checks to PKCE-only, which pocket-id
    // rejects with "invalid_state" on every /authorize call. Left
    // unspecified, this is one dependency bump away from breaking again -
    // and silently, since an existing session cookie masks it until it
    // expires. Pin it here instead of trusting the library's default.
    expect(pocketIdProvider.checks).toContain("state");
    expect(pocketIdProvider.checks).toContain("pkce");
  });
});
