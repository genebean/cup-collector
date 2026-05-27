import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("stats page — city drill-down", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("city with multiple cups expands inline instead of navigating", async ({ page }) => {
    await page.goto("/stats");

    // Drill: world → US → GA (Atlanta + Seattle are US cups; Atlanta has 2 series)
    await page.getByRole("button", { name: /United States/i }).click();
    await page.getByRole("button", { name: /\bGA\b/ }).click();

    // Atlanta has 2 cups (Been There 2019 + You Are Here 2021) — row should show a toggle arrow
    const atlantaRow = page.getByRole("button", { name: /Atlanta/ });
    await expect(atlantaRow).toBeVisible();
    await expect(atlantaRow).toContainText("▼");

    // Tapping expands inline — does NOT navigate away
    await atlantaRow.click();
    await expect(page).toHaveURL("/stats");

    // Both cups appear in the expanded list
    await expect(page.getByText(/Been There.*2019|2019.*Been There/)).toBeVisible();
    await expect(page.getByText(/You Are Here.*2021|2021.*You Are Here/)).toBeVisible();

    // Arrow flips to indicate open state
    await expect(atlantaRow).toContainText("▲");

    // Tapping again collapses
    await atlantaRow.click();
    await expect(atlantaRow).toContainText("▼");
  });

  test("city with one cup navigates directly", async ({ page }) => {
    await page.goto("/stats");

    await page.getByRole("button", { name: /United States/i }).click();
    await page.getByRole("button", { name: /\bWA\b/ }).click();

    // Seattle has only one cup — clicking should navigate to the cup detail
    await page.getByRole("link", { name: /Seattle/ }).click();
    await expect(page).not.toHaveURL("/stats");
  });
});
