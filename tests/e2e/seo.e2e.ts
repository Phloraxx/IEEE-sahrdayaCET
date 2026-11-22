import { createHash } from 'node:crypto'
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

  test('society listings have canonical URLs', async ({ page }) => {
    await page.goto('/societies')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ieeesahrdaya.com/societies')
  })

  test('unknown and retired public pages return 404', async ({ page }) => {
    const unknown = await page.goto('/definitely-not-a-real-page')
    expect(unknown?.status()).toBe(404)

    const retiredEvent = await page.goto('/FIFA')
    expect(retiredEvent?.status()).toBe(404)
  })

  test('production CSP authorises every inline script', async ({ request }) => {
    // Regression guard: `script-src` used to pin a single sha256 hash while
    // React Router emitted seven more inline scripts, so the app never
    // hydrated and the hero stayed at opacity 0. Staging shipped that way.
    //
    // React Router's single-fetch stream controller embeds per-request loader
    // data, so it can never be statically hashed — a nonce is the only way to
    // allow it without `unsafe-inline`.
    const response = await request.get('/')
    expect(response.ok()).toBeTruthy()
    const csp = response.headers()['content-security-policy'] ?? ''
    expect(csp, 'document responses must carry a Content-Security-Policy').not.toBe('')
    const html = await response.text()

    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src')) ?? ''
    expect(scriptSrc, 'CSP must declare script-src').not.toBe('')

    if (scriptSrc.includes("'unsafe-inline'")) {
      // Development: Vite's HMR client injects inline scripts that carry no
      // nonce, so the nonce contract does not apply.
      return
    }

    const nonce = scriptSrc.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce, 'production CSP must authorise inline scripts by nonce').toBeTruthy()

    // Every executed inline script must carry the nonce. JSON-LD is
    // `application/ld+json`, never executed, so CSP does not apply to it.
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((match) => match[1] ?? '')
      .filter((attrs) => !attrs.includes('application/ld+json') && !attrs.includes('src='))
    expect(inlineScripts.length).toBeGreaterThan(0)

    // The pre-paint theme toggle is deliberately static and pinned by hash
    // instead, so it is the one script allowed to have no nonce — but only if
    // its hash is in the policy. A stale hash means the theme silently stops
    // applying, which is how this bug class starts.
    const allowedHashes = [...scriptSrc.matchAll(/'(sha256-[^']+)'/g)].map((match) => match[1] ?? '')
    const themeScript = html.match(/<script>([^<]*localStorage\.getItem\('ieee-theme'\)[^<]*)<\/script>/)
    expect(themeScript?.[1], 'theme toggle script must be present in the document').toBeTruthy()
    const themeHash = `sha256-${createHash('sha256').update(themeScript?.[1] ?? '', 'utf8').digest('base64')}`
    expect(allowedHashes, 'the pinned theme-script hash must match the served script').toContain(themeHash)

    const missingNonce = inlineScripts.filter((attrs) => !attrs.includes(`nonce="${nonce}"`))
    expect(missingNonce, 'only the hashed theme toggle may lack a nonce').toHaveLength(1)
  })

  test('document responses include browser security headers', async ({ request }) => {
    const response = await request.get('/')
    expect(response.ok()).toBeTruthy()
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain('https://static.cloudflareinsights.com')
    expect(headers['content-security-policy']).toContain("frame-src 'none'")
    expect(headers['content-security-policy']).not.toContain("razorpay.com")
    expect(headers['content-security-policy']).toContain("connect-src 'self' https://cloudflareinsights.com")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=(self)')

    const verifyResponse = await request.get('/verify')
    expect(verifyResponse.ok()).toBeTruthy()
    const verifyHeaders = verifyResponse.headers()
    expect(verifyHeaders['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(verifyHeaders['x-content-type-options']).toBe('nosniff')
    expect(verifyHeaders['x-frame-options']).toBe('DENY')
    expect(verifyHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(verifyHeaders['permissions-policy']).toContain('camera=(self)')
    expect(verifyHeaders['cache-control']).toContain('no-store')
    expect(verifyHeaders['x-robots-tag']).toBe('noindex, nofollow')
    if (process.env.DEPLOY_ENV === 'production') {
      expect(headers['strict-transport-security']).toBe('max-age=31536000')
      expect(headers['x-robots-tag']).toBeUndefined()
    } else {
      expect(headers['x-robots-tag']).toBe('noindex, nofollow')
      expect(headers['strict-transport-security']).toBeUndefined()
    }
  })
})
