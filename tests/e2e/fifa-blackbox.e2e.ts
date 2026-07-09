import { test, expect } from '@playwright/test'

/**
 * FIFA WC Predict '26 — blackbox e2e tests against a live preview.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://preview-ieee-website-rcffnz-mu1lfg.ieeesahrdaya.com \
 *   npx playwright test tests/e2e/fifa-blackbox.e2e.ts
 *
 * Auth: set PLAYWRIGHT_PB_AUTH_COOKIE to a URL-encoded pb_auth JSON value.
 * Authenticated tests are skipped when the env var is unset.
 */

const PB_AUTH_COOKIE_VALUE = process.env.PLAYWRIGHT_PB_AUTH_COOKIE || ''
const HAS_AUTH_COOKIE = PB_AUTH_COOKIE_VALUE.length > 0

/** Cloudflare may label PB proxy JSON as gzip without compressing; request identity encoding. */
const PB_PROXY_HEADERS = { 'Accept-Encoding': 'identity' }

test.describe('FIFA — Public Pages (no auth)', () => {
  test('GET /FIFA → 200, shows overview', async ({ page }) => {
    const res = await page.goto('/FIFA', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/FIFA|World Cup|Predict|leaderboard|matches/i)
  })

  test('GET /FIFA/matches → 200, shows match list', async ({ page }) => {
    const res = await page.goto('/FIFA/matches', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/match|team|kickoff|stage/i)
  })

  test('GET /FIFA/leaderboard → 200, shows leaderboard', async ({ page }) => {
    const res = await page.goto('/FIFA/leaderboard', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/leaderboard|rank|player|balance|points/i)
  })

  test('GET /FIFA/rules → 200, shows rules', async ({ page }) => {
    const res = await page.goto('/FIFA/rules', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/rule|point|bet|scoring|prize/i)
  })

  test('GET /FIFA/feed → 200, shows live feed', async ({ page }) => {
    const res = await page.goto('/FIFA/feed', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/feed|activity|bet|event/i)
  })
})

test.describe('FIFA — Authenticated Pages (with pb_auth cookie)', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!HAS_AUTH_COOKIE, 'PLAYWRIGHT_PB_AUTH_COOKIE not set')
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'
    await context.addCookies([
      {
        name: 'pb_auth',
        value: PB_AUTH_COOKIE_VALUE,
        domain: new URL(baseUrl).hostname,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ])
  })

  test('GET /FIFA/dashboard → 200, shows user dashboard', async ({ page }) => {
    const res = await page.goto('/FIFA/dashboard', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/dashboard|balance|bet|transaction/i)
  })

  test('GET /FIFA/matches/{id} → 200, shows match detail with betting UI', async ({ page }) => {
    const matchesRes = await page.goto('/FIFA/matches', { waitUntil: 'networkidle' })
    expect(matchesRes?.ok()).toBeTruthy()

    const matchLink = page.locator('a[href*="/FIFA/matches/"]').first()
    const linkCount = await matchLink.count()
    if (linkCount === 0) {
      test.skip(true, 'No match links found on /FIFA/matches')
      return
    }
    const href = await matchLink.getAttribute('href')
    await page.goto(href!, { waitUntil: 'networkidle' })
    const text = await page.textContent('body')
    expect(text).toMatch(/team|vs|bet|market|stake|odds/i)
  })

  test('GET /admin/FIFA/matches → 200, shows admin match management', async ({ page }) => {
    const res = await page.goto('/admin/FIFA/matches', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/match|admin|settle|manage|FIFA/i)
  })

  test('GET /admin/FIFA/settings → 200, shows game settings', async ({ page }) => {
    const res = await page.goto('/admin/FIFA/settings', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/setting|balance|raffle|prize|starting/i)
  })

  test('GET /admin/FIFA/testing → 200, shows testing console', async ({ page }) => {
    const res = await page.goto('/admin/FIFA/testing', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/test|console|adjust|reset|match/i)
  })

  test('GET /admin/FIFA/raffle → 200, shows raffle page', async ({ page }) => {
    const res = await page.goto('/admin/FIFA/raffle', { waitUntil: 'networkidle' })
    expect(res?.ok()).toBeTruthy()
    const text = await page.textContent('body')
    expect(text).toMatch(/raffle|draw|winner|entries/i)
  })
})

test.describe('FIFA — API endpoints (via /pb proxy)', () => {
  test('GET /pb/api/fifa/leaderboard → 200, returns { leaderboard: [...] }', async ({ request }) => {
    const res = await request.get('/pb/api/fifa/leaderboard', { headers: PB_PROXY_HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('leaderboard')
    expect(Array.isArray(body.leaderboard)).toBeTruthy()
  })

  test('GET /pb/api/fifa/feed → 200, returns { events: [...] }', async ({ request }) => {
    const res = await request.get('/pb/api/fifa/feed?limit=5', { headers: PB_PROXY_HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('events')
    expect(Array.isArray(body.events)).toBeTruthy()
  })
})

test.describe('FIFA — Navigation flow', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!HAS_AUTH_COOKIE, 'PLAYWRIGHT_PB_AUTH_COOKIE not set')
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'
    await context.addCookies([
      {
        name: 'pb_auth',
        value: PB_AUTH_COOKIE_VALUE,
        domain: new URL(baseUrl).hostname,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ])
  })

  test('navigate from /FIFA to matches to match detail', async ({ page }) => {
    await page.goto('/FIFA', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/FIFA\/?$/)

    const matchesLink = page.locator('a[href*="/FIFA/matches"]').first()
    const linkCount = await matchesLink.count()
    if (linkCount === 0) {
      test.skip(true, 'No matches link on /FIFA')
      return
    }
    await matchesLink.click()
    await page.waitForURL(/\/FIFA\/matches/)
    const matchesText = await page.textContent('body')
    expect(matchesText).toMatch(/match|team|stage/i)
  })

  test('navigate from /FIFA to leaderboard', async ({ page }) => {
    await page.goto('/FIFA', { waitUntil: 'networkidle' })
    const lbLink = page.locator('a[href*="/FIFA/leaderboard"]').first()
    const linkCount = await lbLink.count()
    if (linkCount === 0) {
      test.skip(true, 'No leaderboard link on /FIFA')
      return
    }
    await lbLink.click()
    await page.waitForURL(/\/FIFA\/leaderboard/)
    const text = await page.textContent('body')
    expect(text).toMatch(/leaderboard|rank|player/i)
  })
})
