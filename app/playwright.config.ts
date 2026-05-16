import { defineConfig } from "@playwright/test";
import { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } from "./playwright/test-pb.ts";

// Playwright manages the full test environment lifecycle:
//   globalSetup  → starts PocketBase on :8091, seeds test data
//   webServer    → starts Next.js pointing at the test PocketBase
//   globalTeardown → stops the PocketBase container
// Run `play-e2e` from the nix dev shell — no separate terminal needed.
export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  // Single worker: tests share a single PocketBase instance so parallel tests
  // creating/deleting owned cup records would conflict with each other.
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/playwright",

  globalSetup: "./playwright/global-setup.ts",
  globalTeardown: "./playwright/global-teardown.ts",

  // Start the Next.js dev server pointed at the test PocketBase instance.
  // Always start fresh so the server picks up the test POCKETBASE_URL.
  webServer: {
    command: [
      `PLAYWRIGHT_BYPASS_AUTH=1`,
      `POCKETBASE_URL=${PB_URL}`,
      `POCKETBASE_ADMIN_EMAIL=${PB_ADMIN_EMAIL}`,
      `POCKETBASE_ADMIN_PASSWORD=${PB_ADMIN_PASSWORD}`,
      // AUTH_SECRET and AUTH_URL are required by Auth.js in CI where .env.local is absent.
      // This value is test-only — never used in production.
      `AUTH_SECRET=playwright-test-only-do-not-use-in-production-1234`,
      `AUTH_URL=http://127.0.0.1:3000`,
      `npm run dev`,
    ].join(" "),
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    // Use Playwright-managed Chrome (installed via `playwright-install`).
    // Playwright's bundled Chromium does not work in this environment.
    channel: "chrome",
    // Block the PWA service worker so it can't serve cached pages in tests,
    // which would bypass the server-side middleware auth checks.
    serviceWorkers: "block",
  },
  projects: [
    // "setup" runs auth.setup.ts first to save storageState files for each role.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chrome",
      dependencies: ["setup"],
    },
    // Mobile viewport smoke test — limited to browse spec to avoid doubling suite runtime.
    // Uses iPhone 14 viewport + touch UA; Chrome binary runs the actual rendering.
    {
      name: "iphone",
      dependencies: ["setup"],
      testMatch: /browse\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        channel: "chrome",
        serviceWorkers: "block",
      },
    },
  ],
});
