import { defineConfig } from "@playwright/test";

// E2E tests require the dev server to be running with the auth bypass enabled.
// Use `dev-next-bypass` in one terminal, then `play-e2e` in another (from nix develop).
//
// CI integration is deferred — it requires orchestrating Next.js + PocketBase
// startup and is tracked separately.
export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/playwright",
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
