import { defineConfig } from "@playwright/test";

// End-to-end tests drive the *built* extension (dist/) in Playwright's
// Chromium. Run with `npm run test:e2e`, which builds first.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  // One persistent browser profile per test, and the bridge test touches a
  // per-user registry key, so tests never run in parallel.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
