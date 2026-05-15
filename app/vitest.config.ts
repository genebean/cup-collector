import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["node_modules/**", "e2e/**", "playwright/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "../coverage",
      // Only measure coverage for src/lib — pure functions intended for unit testing.
      // React pages, components, hooks, and API routes are covered by the e2e suite instead.
      include: ["src/lib/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
