import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const authDir = join(import.meta.dirname, "../playwright/.auth");

// Seeded city cups: Seattle (Been There 2018) is the only cup visible at zoom 12
const SEATTLE = { lat: 47.6062, lng: -122.3321, zoom: 12 };

// Pre-position the map so it starts at a known city instead of world view.
// Must be called while the page is already open (sessionStorage is per-origin) —
// then page.reload() picks up the saved position for the initial render.
async function setMapPosition(page: Page, pos: { lat: number; lng: number; zoom: number }) {
  await page.evaluate(
    ({ key, val }) => sessionStorage.setItem(key, JSON.stringify(val)),
    { key: "map_position", val: pos }
  );
}

// Click the pin at the given lat/lng by clicking the center of the map container.
// Only valid when the map has been pre-positioned exactly at these coordinates —
// the target pin then sits at the pixel center of the container.
async function clickPin(page: Page) {
  const box = await page.locator(".leaflet-container").boundingBox();
  if (!box) throw new Error("Leaflet container not found");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("map — pin interactions", () => {
  test.use({ storageState: join(authDir, "owner.json") });

  test.afterEach(async ({ page }) => {
    // Reset collection prefs so excluded series don't bleed into later tests
    await page.request.post("/api/household-prefs", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
  });

  test("pins render for seeded cups", async ({ page }) => {
    await page.goto("/map");
    // 7 seeded cups (5 city + Georgia state + Australia country) are all within
    // the world-view bounds — wait until BoundsTracker reports them all
    await expect(page.getByText("7 cups in view")).toBeVisible({ timeout: 15_000 });
    // 5 city-scope cups each get a pin; state/country cups attach to city popups
    const pins = page.locator("path.leaflet-interactive");
    expect(await pins.count()).toBeGreaterThan(0);
  });

  test("clicking a city pin opens its popup", async ({ page }) => {
    await page.goto("/map");
    await setMapPosition(page, SEATTLE);
    await page.reload();

    // "1 cup in view" = cups loaded and only Seattle is within zoom-12 bounds
    await expect(page.getByText("1 cup in view")).toBeVisible({ timeout: 15_000 });

    // The map is centered on Seattle's lat/lng, so the pin sits at the container center
    await clickPin(page);

    const popup = page.locator(".leaflet-popup");
    await expect(popup).toBeVisible({ timeout: 5_000 });
    await expect(popup).toContainText("Seattle");
  });

  test("popup shows Needed status for unowned cups", async ({ page }) => {
    await page.goto("/map");
    await setMapPosition(page, SEATTLE);
    await page.reload();

    await expect(page.getByText("1 cup in view")).toBeVisible({ timeout: 15_000 });

    await clickPin(page);

    const popup = page.locator(".leaflet-popup");
    await expect(popup).toBeVisible({ timeout: 5_000 });
    await expect(popup).toContainText("Needed");
  });

  test("View details button navigates to cup detail", async ({ page }) => {
    await page.goto("/map");
    await setMapPosition(page, SEATTLE);
    await page.reload();

    await expect(page.getByText("1 cup in view")).toBeVisible({ timeout: 15_000 });

    await clickPin(page);

    await expect(page.locator(".leaflet-popup")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "View details →" }).first().click();
    await expect(page).toHaveURL(/\/cup\//, { timeout: 10_000 });
  });

  test("excluding a series removes its unowned cups from the map", async ({ page }) => {
    // All seeded cups are "Been There"; excluding it makes every unowned cup invisible.
    await page.request.post("/api/household-prefs", {
      data: { excluded_series: ["Been There"] },
      headers: { "Content-Type": "application/json" },
    });

    await page.goto("/map");

    // Zero cups pass the filter → no pins, bottom sheet shows the "no cups" empty state
    await expect(page.getByText("No cups visible")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("path.leaflet-interactive")).toHaveCount(0);
  });
});
