import { test, expect, request } from '@playwright/test'

/**
 * Brute-force API endpoint tests.
 * Hits every Next.js API route and asserts expected status codes
 * for unauthenticated requests.
 *
 * Requires:
 *   - Next.js dev server running (or PLAYWRIGHT_BASE_URL set)
 *   - A valid event ID in the DB (TEST_EVENT_ID)
 *   - A valid society slug in the DB (TEST_SOCIETY_SLUG)
 *
 * If env vars aren't set, some tests skip.
 */

const EVENT_ID = process.env.TEST_EVENT_ID
const SOCIETY_SLUG = process.env.TEST_SOCIETY_SLUG || 'cs'

test.describe('Unauthenticated Public API', () => {
  test('GET /api/events/{id} → 200', async ({ baseURL }) => {
    test.skip(!EVENT_ID, 'TEST_EVENT_ID not configured')
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get(`/api/events/${EVENT_ID}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.event).toBeDefined()
    expect(body.event.title).toBeTruthy()
    expect(body.event.venue).toBeTruthy()
  })

  test('GET /api/events/{id} → 404 for invalid ID', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/events/nonexistent0000000')
    expect(res.status()).toBe(404)
  })

  test('GET /api/society/{slug} → 200', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get(`/api/society/${SOCIETY_SLUG}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.society).toBeDefined()
    expect(body.society.name).toBeTruthy()
    expect(body.events).toBeDefined()
    expect(body.members).toBeDefined()
  })

  test('GET /api/society/{slug} → 404 for invalid slug', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/society/this-slug-does-not-exist')
    expect(res.status()).toBe(404)
  })

  test('POST /api/events/validate-coupon → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.post('/api/events/validate-coupon', {
      data: { eventId: 'anyprevalidish000', code: 'INVALID' },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('Unauthenticated Auth API', () => {
  test('GET /api/auth/init → 200 with authURL', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/auth/init')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.authURL).toBeTruthy()
    expect(body.authURL).toContain('accounts.google.com')
  })

  test('GET /api/auth/me → 401 without cookie', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/auth/me')
    expect(res.status()).toBe(401)
  })
})

test.describe('Unauthenticated Admin API', () => {
  test('GET /api/admin/events → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/events')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/registrations → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/registrations')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/societies → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/societies')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/stats → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/stats')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/users → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/users')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/events/dashboard → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/events/dashboard')
    expect(res.status()).toBe(401)
  })
})

test.describe('Unauthenticated Registration API', () => {
  test('GET /api/registrations → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/registrations')
    expect(res.status()).toBe(401)
  })

  test('POST /api/registrations → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.post('/api/registrations', {
      data: { eventId: 'test', formResponses: {} },
    })
    expect(res.status()).toBe(401)
  })

  test('PATCH /api/registrations/{id} → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.patch('/api/registrations/test-id', { data: {} })
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/events/{id}/registrations.csv → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/admin/events/test/registrations.csv')
    expect(res.status()).toBe(401)
  })

  test('GET /api/events/{id}/export → 401 without auth', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.get('/api/events/test/export')
    expect(res.status()).toBe(401)
  })
})

test.describe('Public Page Smoke Tests', () => {
  test('home page loads', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()
  })

  test('events page loads', async ({ page }) => {
    const response = await page.goto('/events')
    expect(response?.ok()).toBeTruthy()
  })

  test('societies page loads', async ({ page }) => {
    const response = await page.goto('/societies')
    expect(response?.ok()).toBeTruthy()
  })

  test('admin login page loads', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByText('Sahrdaya SB')).toBeVisible()
  })
})
