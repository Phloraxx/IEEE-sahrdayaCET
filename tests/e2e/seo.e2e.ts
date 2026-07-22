import { test, expect } from '@playwright/test'

test.describe('SSR and SEO', () => {
  test('events list exposes crawlable event detail links', async ({ page }) => {
    await page.goto('/events')
    const eventLink = page.locator('a[href^="/events/"]').first()
    await expect(eventLink).toBeVisible()
    const href = await eventLink.getAttribute('href')
    expect(href).toMatch(/^\/events\/[a-z0-9-]+$/)

    const response = await page.goto(href!)
    expect(response?.ok()).toBeTruthy()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/events/${href!.split('/').pop()}$`))
    expect(await page.content()).toContain('\"@type\":\"Event\"')
    await expect(page.locator('h1')).not.toBeEmpty()
  })

  test('blog and society listings have canonical URLs', async ({ page }) => {
    await page.goto('/blog')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ieeesahrdaya.com/blog')
    await page.goto('/societies')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ieeesahrdaya.com/societies')
  })

  test('unknown public page returns 404', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-real-page')
    expect(response?.status()).toBe(404)
  })

  test('document responses include browser security headers', async ({ request }) => {
    const response = await request.get('/')
    expect(response.ok()).toBeTruthy()
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("connect-src 'self'")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['x-robots-tag']).toBe('noindex, nofollow')
  })
})
