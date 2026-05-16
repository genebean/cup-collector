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
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    for (const city of ["Seattle", "Atlanta", "London", "Tokyo", "Sydney"]) {
      await expect(page.getByText(city, { exact: false }).first()).toBeVisible();
    }
  });

  test("search filters cups by city name", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/search/i).fill("Seattle");

    await expect(page.getByText("Seattle", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Tokyo", { exact: false })).not.toBeVisible();
  });

  test("country select filters to cups from that country", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    // Japan has one seeded cup (Tokyo)
    await page.selectOption("select", { label: "Japan" });

    await expect(page.getByText("Tokyo", { exact: false })).toBeVisible();
    await expect(page.getByText("Seattle", { exact: false })).not.toBeVisible();
    await expect(page.getByText("London", { exact: false })).not.toBeVisible();
  });

  test("country and status filters combine independently", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    // Filter to United States (Seattle + Atlanta) then to Still Need
    // — selects the second <select> (Country) by its placeholder text
    const countrySelect = page.locator("select").nth(1);
    await countrySelect.selectOption("United States");
    await page.getByRole("button", { name: "Still Need" }).click();

    // Seattle and Atlanta are seeded but not owned — both should appear
    await expect(page.getByText("Seattle", { exact: false })).toBeVisible();
    await expect(page.getByText("Atlanta", { exact: false })).toBeVisible();
    // Japan should be filtered out by country
    await expect(page.getByText("Tokyo", { exact: false })).not.toBeVisible();
  });

  test("Already Have chip shows only owned cups", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Already Have" }).click();

    // No cups are owned in the seeded test data
    await expect(page.getByText("No cups match your search.")).toBeVisible();
  });

  test("All chip resets status filter", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/5 cups/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Already Have" }).click();
    await expect(page.getByText("No cups match your search.")).toBeVisible();

    await page.getByRole("button", { name: "All" }).click();
    await expect(page.getByText("Seattle", { exact: false })).toBeVisible();
  });
});
