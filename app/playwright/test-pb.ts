// Test PocketBase coordinates — shared between playwright.config.ts and global-setup.ts.
// Port 8091 avoids conflicts with the local dev PocketBase on 8090.
export const PB_PORT = 8091;
export const PB_URL = `http://127.0.0.1:${PB_PORT}`;
export const PB_ADMIN_EMAIL = "playwright@test.local";
export const PB_ADMIN_PASSWORD = "Playwright-test-pw-1!";
export const PB_CONTAINER = "cup-collector-playwright-pb";
