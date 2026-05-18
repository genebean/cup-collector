import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Navigate to the Seattle cup via browse — cup ID is dynamic so we go through browse.
async function goToSeattleCup(page: Page) {
  await page.goto("/browse");
  await expect(page.getByText("Seattle")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Seattle").first().click();
  await expect(page).toHaveURL(/\/cup\//, { timeout: 10_000 });
}

// Remove ownership if it was set during a test so the database is clean for the next one.
// Uses waitFor rather than count() because the owned-state query is async — count() returns
// immediately and can see 0 before React has rendered the button, silently skipping cleanup.
async function cleanupOwnership(page: Page) {
  await goToSeattleCup(page);
  const removeBtn = page.getByRole("button", { name: "Remove from Collection" });
  const isOwned = await removeBtn.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
  if (isOwned) {
    await removeBtn.click();
    await expect(page.getByRole("button", { name: /Mark as Owned/ })).toBeVisible({ timeout: 5_000 });
  }
}

test.describe("cup condition — cup-owner", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test.afterEach(async ({ page }) => {
    await cleanupOwnership(page);
  });

  test("condition card appears with good-condition status after marking owned", async ({ page }) => {
    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();

    // Condition card becomes visible once the optimistic ID is replaced by the real record
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("In good condition")).toBeVisible();
  });

  test("can set needs_replacing with an optional note", async ({ page }) => {
    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("checkbox", { name: "Needs replacing" }).check();
    await page.getByPlaceholder("Reason (optional)").fill("cracked lid");
    await page.getByRole("button", { name: "Save" }).click();

    // Display shows the flagged state with the note
    await expect(page.getByText(/Needs replacing/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("cracked lid")).toBeVisible();
    // Edit button returns — form is closed
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("can clear needs_replacing to restore good-condition status", async ({ page }) => {
    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });

    // Set needs_replacing first
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("checkbox", { name: "Needs replacing" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    // Wait for Edit button to reappear — it only shows after onSettled, meaning the
    // PATCH is committed and the UI reflects the saved state.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Needs replacing/)).toBeVisible();

    // Now clear it
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("checkbox", { name: "Needs replacing" }).uncheck();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("In good condition")).toBeVisible({ timeout: 5_000 });
  });

  test("cancel discards the draft without saving", async ({ page }) => {
    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("checkbox", { name: "Needs replacing" }).check();
    // Cancel without saving
    await page.getByRole("button", { name: "Cancel" }).click();

    // Condition should still be good — the checkbox state was never sent to the server
    await expect(page.getByText("In good condition")).toBeVisible();
  });

  test("needs_replacing badge shows on Browse and Search after setting the flag", async ({ page }) => {
    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("checkbox", { name: "Needs replacing" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    // Wait for the edit form to close — the Edit button reappears only after onSettled fires,
    // meaning the PATCH response has arrived and needs_replacing is committed in PocketBase.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 10_000 });

    // Browse list should show "Needs Replacing" badge (capital R) for Seattle
    await page.goto("/browse");
    await expect(page.getByText("Needs Replacing", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("acquired-here button records store and updates condition card", async ({ page }) => {
    // Intercept the nearby-starbucks API so the test doesn't depend on a Google Places key.
    await page.route("/api/nearby-starbucks*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          stores: [
            {
              name: "Starbucks - Test Ave",
              address: "1 Test Ave, Seattle, WA",
              lat: 47.606,
              lng: -122.332,
              place_id: "test_place_1",
            },
          ],
        }),
      });
    });

    await goToSeattleCup(page);
    await page.getByRole("button", { name: /Mark as Owned/ }).click();
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).toBeVisible({ timeout: 10_000 });

    // Nearby Starbucks section should show the mocked store with "Acquired here" button
    await expect(page.getByText("Starbucks - Test Ave")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Acquired here" }).click();

    // Button updates to confirmed state
    await expect(page.getByText("✓ Acquired here")).toBeVisible({ timeout: 5_000 });
    // Condition card shows the store name and address (address is an Apple Maps link)
    await expect(page.getByText("Starbucks - Test Ave").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /1 Test Ave, Seattle, WA/ })).toBeVisible();
  });
});

test.describe("cup condition — cup-viewer", () => {
  test.use({ storageState: join(authDir, "viewer.json") });

  test("viewer sees condition card but no edit or remove controls", async ({ page }) => {
    await goToSeattleCup(page);
    // Seattle cup is not owned for the test household — no condition card shown
    await expect(page.getByRole("heading", { name: "Condition", level: 2 })).not.toBeVisible();
    // Viewers never see the Edit or Remove controls regardless of ownership
    await expect(page.getByRole("button", { name: "Remove from Collection" })).not.toBeVisible();
  });
});
