import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("map bottom sheet", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("handle renders and sheet expands and collapses on tap", async ({ page }) => {
    await page.goto("/map");

    // Bottom sheet handle is visible in the default collapsed state
    const expandButton = page.getByRole("button", { name: "Expand cup list" });
    await expect(expandButton).toBeVisible({ timeout: 10_000 });

    // Handle must sit above the bottom nav, not hidden behind it
    const navBox = await page.locator("nav.bottom-nav").boundingBox();
    const handleBox = await expandButton.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(handleBox!.y + handleBox!.height).toBeLessThanOrEqual(navBox!.y + 1);

    // Cup count label is shown in the handle bar
    await expect(page.getByText(/\d+ cups? in view/)).toBeVisible();

    // Tap to expand — aria-label flips to Collapse
    await expandButton.click();
    await expect(page.getByRole("button", { name: "Collapse cup list" })).toBeVisible();

    // Tap to collapse — aria-label flips back to Expand
    await page.getByRole("button", { name: "Collapse cup list" }).click();
    await expect(page.getByRole("button", { name: "Expand cup list" })).toBeVisible();
  });

  test("cup rows navigate to cup detail", async ({ page }) => {
    await page.goto("/map");

    const expandButton = page.getByRole("button", { name: "Expand cup list" });
    await expect(expandButton).toBeVisible({ timeout: 10_000 });
    await expandButton.click();

    // Wait for the 300ms slide-up CSS transition to fully complete before interacting.
    // Without this, headless Playwright under CPU load (multiple workers) can click
    // during the animation and hit the BottomNav "Map" link behind the sheet instead
    // of the cup row button.
    await page.waitForFunction(() => {
      const sheet = document.querySelector("[data-testid='bottom-sheet']");
      if (!sheet) return false;
      return new DOMMatrix(window.getComputedStyle(sheet).transform).m42 === 0;
    }, { timeout: 5_000 });

    const firstRow = page.getByRole("button", { name: /^View .+ cup$/ }).first();
    const hasRows = await firstRow.isVisible({ timeout: 2_000 }).catch(() => false);
    if (hasRows) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/cup\//, { timeout: 10_000 });
    } else {
      // No cups in current viewport — empty state message is shown
      await expect(page.getByText("No cups visible")).toBeVisible();
    }
  });
});
