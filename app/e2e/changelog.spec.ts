import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("changelog page", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("renders changelog content from CHANGELOG.md", async ({ page }) => {
    await page.goto("/changelog");

    // Page chrome header
    await expect(page.getByRole("banner").getByRole("heading", { name: "Changelog" })).toBeVisible();

    // Rendered markdown — intro paragraph from CHANGELOG.md header
    const main = page.locator("main");
    await expect(main.getByText("All notable changes to Cup Collector are documented here.")).toBeVisible();

    // Version heading — shape: [1.0.0] - YYYY-MM-DD
    await expect(main.getByRole("heading", { name: /1\.0\.0/ })).toBeVisible();

    // At least one category heading exists
    await expect(main.getByRole("heading", { name: /Features|Bug Fixes|Documentation/i }).first()).toBeVisible();
  });

  test("settings page links to changelog", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Changelog" }).click();
    await expect(page).toHaveURL("/changelog");
  });
});
