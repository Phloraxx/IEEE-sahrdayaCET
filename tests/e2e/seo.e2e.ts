import { test, expect } from '@playwright/test'

test.describe('SSR and SEO', () => {
  test('events list exposes crawlable event detail links', async ({ page }) => {
    await page.goto('/events')
    const eventLink = page.locator('a[href^="/events/"]:not([href="/events/"])').first()
    await expect(eventLink).toBeVisible()
    const href = await eventLink.getAttribute('href')
    expect(href).toMatch(/^\/events\/[a-z0-9-]+$/)

    const response = await page.goto(href!)
    expect(response?.ok()).toBeTruthy()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/events/${href!.split('/').pop()}$`))
    expect(await page.content()).toContain('\"@type\":\"Event\"')
    await expect(page.locator('h1')).not.toBeEmpty()
  })

  test('raw SSR HTML exposes crawlable event and society detail URLs', async ({ request }) => {
    const eventsResponse = await request.get('/events')
    expect(eventsResponse.ok()).toBeTruthy()
    const eventsHtml = await eventsResponse.text()
    expect(eventsHtml).toMatch(/href="\/events\/[a-z0-9][a-z0-9-]+"/)
    expect(eventsHtml).toMatch(/https:\/\/ieeesahrdaya\.com\/events\/[a-z0-9][a-z0-9-]+/)

    const societiesResponse = await request.get('/societies')
    expect(societiesResponse.ok()).toBeTruthy()
    const societiesHtml = await societiesResponse.text()
    expect(societiesHtml).toMatch(/href="\/societies\/[a-z0-9][a-z0-9-]+"/)
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
    expect(headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://checkout.razorpay.com")
    expect(headers['content-security-policy']).toContain("frame-src https://api.razorpay.com https://*.razorpay.com")
    expect(headers['content-security-policy']).toContain("connect-src 'self' https://cloudflareinsights.com")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=(self)')
    if (process.env.DEPLOY_ENV === 'production') {
      expect(headers['strict-transport-security']).toBe('max-age=31536000')
      expect(headers['x-robots-tag']).toBeUndefined()
    } else {
      expect(headers['x-robots-tag']).toBe('noindex, nofollow')
      expect(headers['strict-transport-security']).toBeUndefined()
    }
  })
})
