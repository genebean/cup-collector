import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Each test gets a fresh browser context with no cookies by default.
// Unauthenticated tests rely on this — no explicit cookie clearing needed.

test("unauthenticated visit redirects to /sign-in", async ({ page }) => {
  // Use /map rather than / — the root page does a server-side redirect to /map
  // which can race with the middleware's auth redirect in some Playwright configs.
  await page.goto("/map");
  await expect(page).toHaveURL(/\/sign-in/);
});

test.describe("cup-owner", () => {
  test.use({ storageState: join(authDir, "cup-owner.json") });

  test("can access the app without being redirected", async ({ page }) => {
    await page.goto("/map");
    await expect(page).not.toHaveURL(/\/(sign-in|access-denied)/);
  });
});

test.describe("no-group (authenticated but no valid group)", () => {
  test.use({ storageState: join(authDir, "no-group.json") });

  test("is redirected to /access-denied", async ({ page }) => {
    await page.goto("/map");
    await expect(page).toHaveURL(/\/access-denied/);
  });
});
