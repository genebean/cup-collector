import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import PocketBase from "pocketbase";
import { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } from "../playwright/test-pb.ts";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Navigate to the Seattle cup via the browse list — the slug is stable but going
// through browse confirms the full navigation flow end-to-end.
async function goToSeattleCup(page: Page) {
  await page.goto("/browse");
  await expect(page.getByText("Seattle")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Seattle").first().click();
  await expect(page).toHaveURL(/\/cup\/seattle-been-there-2018/, { timeout: 10_000 });
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

  test("cup detail URL uses slug format", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page).toHaveURL(/\/cup\/seattle-been-there-2018$/);
  });

  test("visiting /cup/{id} redirects to slug URL", async ({ page }) => {
    const pb = new PocketBase(PB_URL);
    await pb.collection("_superusers").authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
    const seattle = await pb.collection("cups").getFirstListItem('name="Seattle"');

    await page.goto(`/cup/${seattle.id}`);
    await expect(page).toHaveURL(/\/cup\/seattle-been-there-2018/, { timeout: 10_000 });
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
