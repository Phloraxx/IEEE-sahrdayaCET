import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT || 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
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
        command: process.env.CI ? 'node tests/e2e/production-proxy.mjs' : 'bun run dev',
        url: `${baseURL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PORT: String(port),
          PLAYWRIGHT_PORT: String(port),
          DEPLOY_ENV: process.env.DEPLOY_ENV || 'test',
          SITE_URL: process.env.SITE_URL || 'http://127.0.0.1:3000',
          POCKETBASE_INTERNAL_URL: process.env.POCKETBASE_INTERNAL_URL || 'http://127.0.0.1:8090',
        },
      },
})
