import { test, expect } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

test.describe("browse page — real PocketBase data", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test("shows seeded cups and correct count in header", async ({ page }) => {
    await page.goto("/browse");

    // Header shows owned/total count — 7 cups were seeded in global-setup
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });
  });

  test("seeded cup names appear in the list", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    // Scope to main to avoid matching hidden <option> elements in the header selects
    const main = page.locator("main");
    for (const name of ["Seattle", "Atlanta", "London", "Tokyo", "Sydney", "Georgia", "Australia"]) {
      await expect(main.getByText(name, { exact: false }).first()).toBeVisible();
    }
  });

  test("search filters cups by name", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/search/i).fill("Seattle");

    await expect(page.getByText("Seattle", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Tokyo", { exact: false })).not.toBeVisible();
  });

  test("country select filters to cups from that country", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    // Japan has one seeded cup (Tokyo) — nth(1) targets the Country select (0 = Series)
    await page.locator("select").nth(1).selectOption({ label: "Japan" });

    await expect(page.getByText("Tokyo", { exact: false })).toBeVisible();
    await expect(page.getByText("Seattle", { exact: false })).not.toBeVisible();
    await expect(page.getByText("London", { exact: false })).not.toBeVisible();
  });

  test("country and status filters combine independently", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    // Filter to United States (Seattle + Atlanta + Georgia state cup) then to Still Need
    const countrySelect = page.locator("select").nth(1);
    await countrySelect.selectOption("United States");
    await page.getByRole("button", { name: "Still Need" }).click();

    // Seattle, Atlanta, and Georgia (state) are seeded but not owned — all should appear
    await expect(page.getByText("Seattle", { exact: false })).toBeVisible();
    await expect(page.getByText("Atlanta", { exact: false })).toBeVisible();
    await expect(page.getByText("Georgia", { exact: false })).toBeVisible();
    // Japan should be filtered out by country
    await expect(page.getByText("Tokyo", { exact: false })).not.toBeVisible();
  });

  test("Already Have chip shows only owned cups", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Already Have" }).click();

    // No cups are owned in the seeded test data
    await expect(page.getByText("No cups match your search.")).toBeVisible();
  });

  test("All chip resets status filter", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Already Have" }).click();
    await expect(page.getByText("No cups match your search.")).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("Seattle", { exact: false })).toBeVisible();
  });

  test("scope badge visible on state and country cups", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    const main = page.locator("main");

    // Georgia is a state cup — should show a "state" badge
    const georgiaRow = main.getByText("Georgia", { exact: false }).first().locator("..");
    await expect(georgiaRow.getByText("state", { exact: false })).toBeVisible();

    // Australia (country cup) should show a "country" badge
    const australiaRow = main.getByText("Australia", { exact: false }).first().locator("..");
    await expect(australiaRow.getByText("country", { exact: false })).toBeVisible();
  });

  test("scope filter dropdown filters to city/state/country cups", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByText(/7 owned/)).toBeVisible({ timeout: 10_000 });

    const main = page.locator("main");

    // Scope is the third select (index 2): Series=0, Country=1, Scope=2
    const scopeSelect = page.locator("select").nth(2);

    await scopeSelect.selectOption("state");
    await expect(main.getByText("Georgia", { exact: false })).toBeVisible();
    await expect(main.getByText("Seattle", { exact: false })).not.toBeVisible();

    await scopeSelect.selectOption("country");
    await expect(main.getByText("Australia", { exact: false }).first()).toBeVisible();
    await expect(main.getByText("Georgia", { exact: false })).not.toBeVisible();

    // Reset to show all
    await scopeSelect.selectOption("");
    await expect(main.getByText("Seattle", { exact: false })).toBeVisible();
  });
});
