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
    const response = await page.goto('/full-execom')
    expect(response?.ok()).toBeTruthy()
  })
})

test.describe('Admin white-label', () => {
  test('admin login page has custom branding', async ({ page }) => {
    await page.goto('/admin/login')
    // The BeforeLogin component renders "Sahrdaya SB" and "Admin Console"
    await expect(page.getByText('Sahrdaya SB')).toBeVisible()
    await expect(page.getByText('Admin Console')).toBeVisible()
  })
})
