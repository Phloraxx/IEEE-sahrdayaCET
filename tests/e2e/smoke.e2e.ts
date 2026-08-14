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

  test('full execom page SSRs PocketBase portfolio links', async ({ page }) => {
    test.setTimeout(60_000)

    const rawResponse = await page.request.get('/full-execom')
    expect(rawResponse.ok()).toBeTruthy()
    expect(await rawResponse.text()).toContain(
      'href="https://example.com/execom-portfolio"',
    )

    const response = await page.goto('/full-execom')
    expect(response?.ok()).toBeTruthy()

    const cardPortfolio = page.getByRole('link', {
      name: /Visit Portfolio Smoke Member's portfolio/i,
    }).first()
    await expect(cardPortfolio).toBeVisible()

    const member = page.getByRole('button', {
      name: 'View details for Portfolio Smoke Member',
    }).first()
    await member.click()

    const dialog = page.getByRole('dialog', { name: 'Portfolio Smoke Member' })
    const modalPortfolio = dialog.getByRole('link', { name: /portfolio/i })
    await expect(modalPortfolio).toHaveAttribute(
      'href',
      'https://example.com/execom-portfolio',
    )
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
