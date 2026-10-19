import { defineConfig, devices } from "@playwright/test";

/**
 * Frontend E2E — requires Next.js (and usually the Fastify API) already running.
 * Does not start servers itself so CI/local control stays explicit.
 *
 *   npm run test:e2e
 *
 * Env:
 *   SPADA_E2E_BASE_URL   default http://localhost:3000
 *                        (prefer localhost over 127.0.0.1 so Next 16 serves /_next chunks;
 *                         also set allowedDevOrigins in next.config.ts and restart next dev)
 *   SPADA_API_BASE       default http://127.0.0.1:4000 (used to discover a market id)
 *   SPADA_E2E_MARKET_ID  optional canonical_id override
 */
const baseURL = (process.env.SPADA_E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  // Keep artifacts inside the project so local sandbox/CI can write them.
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Local macOS 12: system Chrome (bundled Chromium often fails to install).
      // CI (ubuntu): bundled Chromium via `npx playwright install chromium`.
      name: process.env.CI ? "chromium" : "chrome",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" as const }),
      },
    },
  ],
});

