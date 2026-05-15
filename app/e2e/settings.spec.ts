import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("settings page — cup-owner", () => {
  test.use({ storageState: join(authDir, "cup-owner.json") });

  test("shows role as Owner and Import Cups admin link", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Owner", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Import Cups" })).toBeVisible();
  });

  test("shows sign-out button", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
  });
});

test.describe("settings page — cup-viewer", () => {
  test.use({ storageState: join(authDir, "cup-viewer.json") });

  test("shows role as Viewer and hides Import Cups link", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Viewer", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Import Cups" })).not.toBeVisible();
  });
});
