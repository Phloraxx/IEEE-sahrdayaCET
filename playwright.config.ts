import { defineConfig, devices } from '@playwright/test'

/**
 * The full browser suite, run locally (`bun run test:e2e`).
 *
 * Not part of CI. Several specs expect a staging-shaped database and skip
 * themselves when it is not configured, and authenticated specs need a seeded
 * session; the deterministic release gate is
 * `playwright.release-gate.config.ts` (see `bun run test:release-gate`).
 *
 * The web server is the dev server, or a compiled server on `PLAYWRIGHT_PORT`.
 * There is no PocketBase proxy: this app serves `/api` itself, so pointing any
 * request at a PocketBase port would only prove that nothing is there.
 */
const port = Number(process.env.PLAYWRIGHT_PORT || 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/release-gate-*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_SERVER === 'start' ? 'bun run start' : 'bun run dev',
        url: `${baseURL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PORT: String(port),
          DEPLOY_ENV: process.env.DEPLOY_ENV || 'test',
          SITE_URL: `http://127.0.0.1:${port}`,
          APP_URL: `http://127.0.0.1:${port}`,
          RENDER_CACHE_TTL_SECONDS: '0',
        },
      },
})
