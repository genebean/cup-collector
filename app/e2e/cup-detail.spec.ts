import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Navigate to the Seattle cup via the browse list — the cup ID is dynamic so we
// can't hard-code it; going through browse avoids the need to know it in advance.
async function goToSeattleCup(page: Page) {
  await page.goto("/browse");
  await expect(page.getByText("Seattle")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Seattle").first().click();
  await expect(page).toHaveURL(/\/cup\//, { timeout: 10_000 });
}

test.describe("cup detail — cup-owner", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("shows cup metadata for a seeded cup", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page.getByRole("heading", { name: "Seattle" })).toBeVisible();
    await expect(page.getByText("Been There", { exact: true })).toBeVisible();
    await expect(page.getByText("2018", { exact: true })).toBeVisible();
    await expect(page.getByText("United States", { exact: true })).toBeVisible();
  });

  test("shows Mark as Owned button for cup-owner", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page.getByRole("button", { name: /Mark as Owned/ })).toBeVisible();
  });
});

test.describe("cup detail — cup-viewer", () => {
  test.use({ storageState: join(authDir, "viewer.json") });

  test("shows cup metadata", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page.getByRole("heading", { name: "Seattle" })).toBeVisible();
  });

  test("does not show ownership button for cup-viewer", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page.getByRole("button", { name: /Mark as Owned|Remove from Collection/ })).not.toBeVisible();
  });
});
