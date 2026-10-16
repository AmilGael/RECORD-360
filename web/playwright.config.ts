import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Real-user credentials (E2E_ADMIN_*, E2E_RESIDENT_*) live only in this
// gitignored file; the specs log in through the real /login form with them.
loadEnv({ path: path.resolve(__dirname, ".env.e2e.local"), quiet: true });

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const prod = process.env.E2E_PROD === "1";

// @setup specs write permanent local data, so they never run by default.
// Opt in with E2E_SETUP=1 (desktop project only; phone always skips them).
const setupInvert = process.env.E2E_SETUP === "1" ? undefined : /@setup/;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/artifacts/test-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      grepInvert: /@setup/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      grepInvert: setupInvert,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: prod ? "npm run build && npm start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: prod ? 300_000 : 120_000,
  },
});
