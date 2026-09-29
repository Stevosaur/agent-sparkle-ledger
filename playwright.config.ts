import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/pasarcatch_e2e";

/**
 * End-to-end tests run against their own server and database (reset + seeded in global setup),
 * so they never disturb the development or demo database.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "dark",
    launchOptions: process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: DB, BETTER_AUTH_URL: `http://localhost:${PORT}`, APP_URL: `http://localhost:${PORT}`, ANTHROPIC_API_KEY: "", NEXT_DIST_DIR: ".next-e2e" },
  },
});
