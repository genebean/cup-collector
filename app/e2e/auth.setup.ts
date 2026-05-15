import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Saved state files are loaded by smoke.spec.ts and future tests via
// `test.use({ storageState: ... })`. The directory is gitignored.
const authDir = join(import.meta.dirname, "../playwright/.auth");

// Roles to pre-authenticate. Each produces one storageState JSON file.
// "no-group" is intentionally not a known role — it tests the access-denied path.
const ROLES = ["cup-owner", "cup-viewer", "no-group"] as const;

for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ request }) => {
    mkdirSync(authDir, { recursive: true });

    // Step 1: Fetch the CSRF token. Auth.js v5 uses a double-submit cookie
    // pattern — the token from the JSON response must match the cookie value.
    // The APIRequestContext carries cookies automatically across calls.
    const csrfRes = await request.get("/api/auth/csrf");
    expect(csrfRes.ok()).toBeTruthy();
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    // Step 2: POST to the dev-bypass callback with role as a URL query param.
    // Auth.js reliably forwards query params to authorize() via the URL it
    // constructs for the provider — more reliable than the parsed form body.
    const signInRes = await request.post(
      `/api/auth/callback/dev-bypass?role=${encodeURIComponent(role)}`,
      {
        form: { csrfToken },
        maxRedirects: 0,
      }
    );
    expect([200, 302]).toContain(signInRes.status());

    // Step 3: Persist the cookies (session token) for this role.
    await request.storageState({
      path: join(authDir, `${role}.json`),
    });
  });
}
