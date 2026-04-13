import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke test config.
 * Requires a running Next.js instance at BASE_URL (default http://localhost:3000).
 * In CI, the webServer block starts `next start` automatically after build.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "pnpm start",
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? "",
          NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "",
          NEXTAUTH_URL: BASE_URL,
          GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
          GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
          RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
          CRON_SECRET: process.env.CRON_SECRET ?? "",
          NEXT_PUBLIC_APP_URL: BASE_URL,
        },
      }
    : undefined,
  outputDir: "./e2e-results",
});
