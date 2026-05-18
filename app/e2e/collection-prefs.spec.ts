import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

async function resetPrefs(page: Page) {
  await page.request.post("/api/household-prefs", {
    data: {},
    headers: { "Content-Type": "application/json" },
  });
}

test.describe("collection prefs — cup-owner", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test.afterEach(async ({ page }) => {
    await resetPrefs(page);
  });

  test("settings page has What I Collect link", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /What I Collect/ })).toBeVisible();
  });

  test("collection prefs page loads with Item Types and Series sections", async ({ page }) => {
    await page.goto("/settings/collection");

    await expect(page.getByRole("heading", { name: "Item Types" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Series" })).toBeVisible();

    // Mugs is always-on and disabled
    const mugsToggle = page.getByRole("switch", { name: "Mugs" });
    await expect(mugsToggle).toBeChecked();
    await expect(mugsToggle).toBeDisabled();

    // Ornaments is enabled by default
    await expect(page.getByRole("switch", { name: "Ornaments" })).toBeChecked();

    // At least one series toggle is present and on
    await expect(page.getByRole("switch", { name: "Been There" })).toBeChecked();
  });

  test("toggling a series off persists after reload", async ({ page }) => {
    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Been There" })).toBeChecked({ timeout: 10_000 });

    await page.getByRole("switch", { name: "Been There" }).click();
    await expect(page.getByRole("switch", { name: "Been There" })).not.toBeChecked({ timeout: 5_000 });

    // Reload — saved state should survive
    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Been There" })).not.toBeChecked({ timeout: 10_000 });
  });

  test("toggling Ornaments off persists after reload", async ({ page }) => {
    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Ornaments" })).toBeChecked({ timeout: 10_000 });

    await page.getByRole("switch", { name: "Ornaments" }).click();
    await expect(page.getByRole("switch", { name: "Ornaments" })).not.toBeChecked({ timeout: 5_000 });

    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Ornaments" })).not.toBeChecked({ timeout: 10_000 });
  });

  test("re-enabling a series restores checked state", async ({ page }) => {
    // Start with Been There excluded
    await page.request.post("/api/household-prefs", {
      data: { excluded_series: ["Been There"] },
      headers: { "Content-Type": "application/json" },
    });

    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Been There" })).not.toBeChecked({ timeout: 10_000 });

    await page.getByRole("switch", { name: "Been There" }).click();
    await expect(page.getByRole("switch", { name: "Been There" })).toBeChecked({ timeout: 5_000 });

    await page.goto("/settings/collection");
    await expect(page.getByRole("switch", { name: "Been There" })).toBeChecked({ timeout: 10_000 });
  });
});

test.describe("collection prefs — cup-viewer", () => {
  test.use({ storageState: join(authDir, "viewer.json") });

  test("viewer sees What I Collect link in Settings and read-only toggles on the page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /What I Collect/ })).toBeVisible();
    await page.getByRole("link", { name: /What I Collect/ }).click();

    await expect(page.getByRole("heading", { name: "Item Types" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Only the household owner/)).toBeVisible();

    // All toggles are disabled for viewers
    await expect(page.getByRole("switch", { name: "Ornaments" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "Been There" })).toBeDisabled();
  });
});
