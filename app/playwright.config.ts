import { defineConfig } from "@playwright/test";

// Playwright manages the dev server lifecycle via webServer below.
// Run `play-e2e` from the nix dev shell — no separate terminal needed.
// If a dev server is already running on :3000 it will be reused (local dev only).
export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/playwright",

  // Start the Next.js dev server with the auth bypass before any test runs,
  // and kill it automatically when tests finish (even on failure).
  // reuseExistingServer lets local devs keep their own dev-next-bypass running.
  webServer: {
    command: "PLAYWRIGHT_BYPASS_AUTH=1 npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
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
  ],
});
