import { test, expect } from '@playwright/test'

/**
 * Edge case and error handling API tests.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'

test.describe('API Error Handling', () => {
  test('GET unknown route returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/nonexistent-route`)
    expect(res.status()).toBe(404)
  })

  test('GET /api/events/:id with invalid id returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/events/invalid-id-12345`)
    expect(res.status()).toBe(404)
  })

  test('POST /api/events/validate-coupon returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/events/validate-coupon`, {
      data: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    // Auth gate fires before body parsing — should return 401
    expect(res.status()).toBe(401)
  })

  test('Large filter values are handled without crash', async ({ request }) => {
    const longString = 'a'.repeat(1000)
    const res = await request.get(`${BASE}/api/society/${encodeURIComponent(longString)}`)
    // Should not crash — either 404 or properly handled
    expect(res.ok() || res.status() === 404).toBeTruthy()
  })

  test('Special characters in URL params do not crash', async ({ request }) => {
    const res = await request.get(`${BASE}/api/society/${encodeURIComponent("O'Brien's Society")}`)
    // Should not crash
    expect([200, 404]).toContain(res.status())
  })

  test('Zero results for impossible filter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/events/nonexistent0000000`)
    expect(res.status()).toBe(404)
  })
})
