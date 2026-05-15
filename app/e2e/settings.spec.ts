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

test.describe("dark mode — settings", () => {
  test.use({ storageState: join(authDir, "cup-owner.json") });

  // Clear the stored UI theme preference before each test so tests don't
  // affect each other. The page is loaded first so we have the right origin.
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate(() => localStorage.removeItem("ui_theme"));
    await page.reload();
    // Wait for the page to settle before interacting
    await expect(page.getByText("Appearance", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("ui_theme"));
  });

  test("shows Appearance section with System/Light/Dark buttons", async ({ page }) => {
    await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
    const uiSelector = page.getByTestId("ui-theme-selector");
    await expect(uiSelector.getByRole("button", { name: "System" })).toBeVisible();
    await expect(uiSelector.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(uiSelector.getByRole("button", { name: "Dark" })).toBeVisible();
  });

  test("Dark button adds .dark class to <html>", async ({ page }) => {
    await page.getByTestId("ui-theme-selector").getByRole("button", { name: "Dark" }).click();
    // useEffect runs asynchronously after the React re-render; retry until class appears
    await expect(page.locator("html")).toHaveAttribute("class", /dark/);
  });

  test("Light button removes .dark class from <html>", async ({ page }) => {
    const uiSelector = page.getByTestId("ui-theme-selector");
    await uiSelector.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("class", /dark/);
    await uiSelector.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("class", /dark/);
  });

  test("System button follows OS preference — no .dark class in headless Chromium", async ({ page }) => {
    const uiSelector = page.getByTestId("ui-theme-selector");
    await uiSelector.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("class", /dark/);
    await uiSelector.getByRole("button", { name: "System" }).click();
    // Headless Chromium reports light mode, so System → no dark class
    await expect(page.locator("html")).not.toHaveAttribute("class", /dark/);
  });

  test("dark theme preference persists across client-side navigation", async ({ page }) => {
    await page.getByTestId("ui-theme-selector").getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("class", /dark/);
    // Navigate away (localStorage survives; UiThemeInitializer re-applies the class)
    await page.goto("/browse");
    await expect(page.locator("html")).toHaveAttribute("class", /dark/);
  });
});
