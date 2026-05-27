import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Checks that key pages render without React hydration mismatches.
// Hydration errors appear as console.error messages during the initial render
// and indicate that SSR HTML didn't match the client's initial render — often
// caused by reading client-only APIs (sessionStorage, window, Date.now()) in
// useState initializers or during render instead of in useEffect.

const PAGES: string[] = ["/browse", "/stats", "/settings", "/map"];

test.describe("hydration checks", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  for (const route of PAGES) {
    test(`${route} — no hydration mismatch on first load`, async ({ page }) => {
      const hydrationErrors: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        if (
          msg.type() === "error" &&
          (text.includes("Hydration failed") ||
            text.includes("hydrated but some attributes") ||
            text.includes("did not match") ||
            text.includes("hydration-mismatch"))
        ) {
          hydrationErrors.push(text);
        }
      });

      page.on("pageerror", (err) => {
        if (
          err.message.includes("Hydration failed") ||
          err.message.includes("hydration")
        ) {
          hydrationErrors.push(err.message);
        }
      });

      await page.goto(route);
      // DOMContentLoaded is enough — hydration errors fire synchronously during mount
      await page.waitForLoadState("domcontentloaded");
      // Brief settle to let React finish the synchronous hydration pass
      await page.waitForTimeout(500);

      expect(hydrationErrors, `Hydration errors on ${route}`).toEqual([]);
    });
  }
});
