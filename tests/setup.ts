/**
 * Shared test infrastructure for IEEE Sahrdaya SB.
 *
 * Provides helpers for:
 *   - Superuser authentication to PocketBase
 *   - Seed / cleanup of test records
 *   - Creating authenticated PocketBase clients for different roles
 *
 * Integration tests require a running PocketBase instance at
 * POCKETBASE_URL (default http://127.0.0.1:8090) and a superuser
 * whose credentials are set via TEST_SUPERUSER_EMAIL / TEST_SUPERUSER_PASSWORD.
 *
 * Unit tests use vi.fn() mocks and never connect to a real server.
 */

import PocketBase from 'pocketbase'

// ─── Env ───────────────────────────────────────────────────

export const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'
export const SUPERUSER_EMAIL = process.env.TEST_SUPERUSER_EMAIL || 'souravpbijoy@gmail.com'
export const SUPERUSER_PASSWORD = process.env.TEST_SUPERUSER_PASSWORD || 'Wasdqwe1@'

// ─── Superuser Token ───────────────────────────────────────

let _token: string | null = null
let _superuserId: string | null = null

export async function getSuperuserToken(): Promise<{ token: string; userId: string }> {
  if (_token) return { token: _token, userId: _superuserId! }

  const pb = new PocketBase(PB_URL)
  const auth = await pb.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD)
  _token = auth.token
  _superuserId = auth.record.id
  return { token: _token, userId: _superuserId! }
}

export function createAdminPB(token?: string): PocketBase {
  const pb = new PocketBase(PB_URL)
  if (token) {
    pb.authStore.save(token, null)
  }
  return pb
}

// ─── Seed Tracking ──────────────────────────────────────────

const seededRecords: Array<{ collection: string; id: string }> = []

export function track(collection: string, id: string): void {
  seededRecords.push({ collection, id })
}

export function trackCreated(result: { id: string } | null | undefined, collection: string): string | null {
  if (!result?.id) return null
  track(collection, result.id)
  return result.id
}

export async function cleanup(pb?: PocketBase): Promise<void> {
  if (!pb) {
    const { token } = await getSuperuserToken()
    pb = createAdminPB(token)
  }
  const errors: string[] = []
  // Delete in reverse order to avoid FK issues
  for (const r of [...seededRecords].reverse()) {
    try {
      await pb.collection(r.collection).delete(r.id)
    } catch (e: unknown) {
      errors.push(`${r.collection}/${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  seededRecords.length = 0
  if (errors.length > 0) {
    console.warn('Cleanup warnings:', errors.join('; '))
  }
}

// ─── Auth Helpers for Integration Tests ─────────────────────

/**
 * Create an authenticated user PB client and return it + the user record.
 * Logs in via password auth against the users collection.
 * NOTE: The users collection only has Google OAuth enabled, not password auth.
 * For integration tests we use the superuser token to impersonate a user.
 */
export async function authenticateAs(
  pb: PocketBase,
  userId: string,
): Promise<PocketBase> {
  // Impersonate the user to get a token
  const impersonateResult = await pb.collection('users').impersonate(userId, 3600)
  const userPB = createAdminPB()
  userPB.authStore.save(impersonateResult.token, impersonateResult.record)
  return userPB
}

// ─── Seed Helpers ──────────────────────────────────────────

export async function seedSociety(pb: PocketBase, overrides: Record<string, unknown> = {}) {
  const data = {
    name: `Test Society ${Date.now()}`,
    slug: `test-society-${Date.now()}`,
    bio: 'A test society for integration testing',
    isHidden: false,
    ...overrides,
  }
  const record = await pb.collection('societies').create(data)
  track('societies', record.id)
  return record as unknown as { id: string; name: string; slug: string }
}

export async function seedEvent(
  pb: PocketBase,
  societyId: string,
  overrides: Record<string, unknown> = {},
) {
  const now = new Date()
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const data = {
    title: `Test Event ${Date.now()}`,
    description: 'A test event',
    date: future.toISOString(),
    venue: 'Test Venue',
    society: societyId,
    status: 'published',
    registrationOpen: true,
    price: 0,
    maxCapacity: 100,
    registeredCount: 0,
    checkedInCount: 0,
    ...overrides,
  }
  const record = await pb.collection('events').create(data)
  track('events', record.id)
  return record as unknown as { id: string; title: string; society: string }
}

export async function seedUser(
  pb: PocketBase,
  overrides: Record<string, unknown> = {},
) {
  // We can't easily create users via API (no password auth enabled),
  // so this is a placeholder — we'll reuse the existing admin user for testing.
  return { id: process.env.TEST_USER_ID || '' }
}
