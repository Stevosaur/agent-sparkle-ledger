import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const external = process.env.E2E_BASE_URL;
// Cloud dev containers ship a pinned Chromium; CI installs its own via `npx playwright install chromium`.
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_EXEC ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);

/** Smoke tests run against the synthetic fixture snapshot (tests/fixtures/data). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: external
    ? undefined
    : {
        command: `npx next dev --port ${PORT}`,
        url: `http://localhost:${PORT}/api/me/`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: { DATA_DIR: "tests/fixtures/data", NEXT_DIST_DIR: ".next-e2e", ANTHROPIC_API_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", STRIPE_SECRET_KEY: "" },
      },
});
