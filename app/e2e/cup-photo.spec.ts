import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");
const FIXTURE_PHOTO = join(import.meta.dirname, "fixtures/test-photo.png");

async function goToSeattleCup(page: Page) {
  await page.goto("/browse");
  await expect(page.getByText("Seattle")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Seattle").first().click();
  await expect(page).toHaveURL(/\/cup\//, { timeout: 10_000 });
}

async function markOwned(page: Page) {
  const markBtn = page.getByRole("button", { name: /Mark as Owned/ });
  await expect(markBtn).toBeVisible({ timeout: 5_000 });
  await markBtn.click();
  // Wait for optimistic record to be replaced by the real one (camera button appears)
  await expect(page.getByRole("button", { name: "Upload personal photo" })).toBeVisible({ timeout: 5_000 });
}

async function removeOwned(page: Page) {
  await goToSeattleCup(page);
  const removeBtn = page.getByRole("button", { name: "Remove from Collection" });
  const isOwned = await removeBtn.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
  if (isOwned) {
    await removeBtn.click();
    await expect(page.getByRole("button", { name: /Mark as Owned/ })).toBeVisible({ timeout: 5_000 });
  }
}

test.describe("own photo — cup-owner", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test.afterEach(async ({ page }) => {
    await removeOwned(page);
  });

  test("camera button appears on owned cup and is absent on unowned cup", async ({ page }) => {
    await goToSeattleCup(page);
    // Not yet owned — no camera button
    await expect(page.getByRole("button", { name: "Upload personal photo" })).not.toBeVisible();

    await markOwned(page);
    // Now owned — camera button present
    await expect(page.getByRole("button", { name: "Upload personal photo" })).toBeVisible();
  });

  test("uploading a photo shows the personal photo in the hero", async ({ page }) => {
    await goToSeattleCup(page);
    await markOwned(page);

    // The seeded Seattle cup has no catalog image — hero shows a letter placeholder, no <img>
    await expect(page.locator("img[alt*='cup']")).not.toBeVisible();

    // Trigger file upload via the hidden input
    await page.locator("input[type='file']").setInputFiles(FIXTURE_PHOTO);

    // After upload the hero should show the personal photo served via the PocketBase proxy
    await expect(page.locator("img[alt*='cup']")).toBeVisible({ timeout: 10_000 });
    const src = await page.locator("img[alt*='cup']").getAttribute("src");
    expect(src).toContain("/api/pb/api/files/");
  });
});

test.describe("own photo — cup-viewer", () => {
  test.use({ storageState: join(authDir, "viewer.json") });

  test("camera button is never shown to viewers", async ({ page }) => {
    await goToSeattleCup(page);
    await expect(page.getByRole("button", { name: "Upload personal photo" })).not.toBeVisible();
  });
});
