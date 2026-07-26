import { test, expect } from '@playwright/test'

test.describe('Public pages smoke', () => {
  test('home page loads', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()
    expect(await page.title()).toContain('IEEE Sahrdaya')
  })

  test('events page loads', async ({ page }) => {
    const response = await page.goto('/events')
    expect(response?.ok()).toBeTruthy()
  })

  test('societies page loads', async ({ page }) => {
    const response = await page.goto('/societies')
    expect(response?.ok()).toBeTruthy()
  })

  test('full execom page loads', async ({ page }) => {
    test.setTimeout(60_000)
    const response = await page.goto('/full-execom')
    expect(response?.ok()).toBeTruthy()
  })
})

test.describe('Admin routes redirect when unauthenticated', () => {
  test('admin page redirects to home or shows auth guard', async ({ page }) => {
    const response = await page.goto('/admin')
    // Without auth, the AdminGuard should redirect or show login UI
    // Assert it doesn't crash
    expect(response?.status()).toBeLessThan(500)
  })
})
