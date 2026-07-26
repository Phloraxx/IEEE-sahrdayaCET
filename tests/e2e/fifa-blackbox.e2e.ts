import { test, expect } from '@playwright/test'

test.describe("FIFA public experience", () => {
  for (const [path, pattern] of [
    ['/FIFA', /FIFA|World Cup|Predict/i],
    ['/FIFA/matches', /match|team|kickoff|stage/i],
    ['/FIFA/leaderboard', /leaderboard|rank|player|tickets/i],
    ['/FIFA/rules', /rule|ticket|bet|scoring|prize/i],
  ] as const) {
    test(`${path} renders without authentication`, async ({ page }) => {
      const pageErrors: Error[] = []
      page.on('pageerror', (error) => pageErrors.push(error))

      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(response?.ok()).toBeTruthy()
      await expect(page.locator('body')).toContainText(pattern)
      await page.waitForTimeout(100)
      expect(pageErrors).toEqual([])
    })
  }

  test('admin route never crashes when unauthenticated', async ({ page }) => {
    const response = await page.goto('/admin/FIFA/matches', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(500)
  })
})
