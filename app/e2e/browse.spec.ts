import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("browse page — real PocketBase data", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("shows seeded cups and correct count in header", async ({ page }) => {
    await page.goto("/browse");

    // Header shows total cup count — 5 cups were seeded in global-setup
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });
  });

  test("seeded cup cities appear in the list", async ({ page }) => {
    await page.goto("/browse");

    // Wait for data to load
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    // All seeded cities must be present
    for (const city of ["Seattle", "Atlanta", "London", "Tokyo", "Sydney"]) {
      await expect(page.getByText(city, { exact: false }).first()).toBeVisible();
    }
  });

  test("search filters cups by city name", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/search/i).fill("Seattle");

    await expect(page.getByText("Seattle", { exact: false }).first()).toBeVisible();
    // Other cities should not appear after filtering
    await expect(page.getByText("Tokyo", { exact: false })).not.toBeVisible();
  });
});
