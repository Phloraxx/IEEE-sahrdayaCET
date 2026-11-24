import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the release gate only.
 *
 * Separate from `playwright.config.ts` on purpose. The default config starts the
 * dev server, and in CI it started `production-proxy.mjs`, which forwarded
 * `/api/*` to PocketBase — an architecture the app no longer has. The gate runs
 * against a compiled app started by `tests/ci/release-gate.mjs` (local) or by
 * the `release-gate` CI job, so there is no `webServer` here at all.
 *
 * `RELEASE_GATE_APP_URL` must point at that server. The specs fail with an
 * actionable message when it is absent; they never skip.
 */
const baseURL = process.env.RELEASE_GATE_APP_URL

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/release-gate-*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
