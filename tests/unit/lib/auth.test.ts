import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireAuth, requireRole, AuthError } from '@/lib/auth'

// ─── Mock PocketBase ───────────────────────────────────────
function createMockPB(overrides: Record<string, unknown> = {}) {
  const authStore = {
    record: null as Record<string, unknown> | null,
    isValid: false,
    ...(overrides.authStore || {}),
  }
  return {
    collection: vi.fn(() => ({
      authRefresh: vi.fn().mockRejectedValue(new Error('Not authenticated')),
    })),
    authStore,
    ...overrides,
  }
}

function makeAuthenticatedPB(role = 'admin') {
  const authStore = {
    record: { id: 'user-1', email: 'admin@test.com', name: 'Admin', role },
    isValid: true,
  }
  const pb = createMockPB({ authStore })
  pb.collection = vi.fn(() => ({
    authRefresh: vi.fn().mockResolvedValue({}),
  }))
  return pb
}

describe('requireAuth', () => {
  it('throws AuthError(401) when not authenticated', async () => {
    const pb = createMockPB() as any
    await expect(requireAuth(pb)).rejects.toThrow(AuthError)
    await expect(requireAuth(pb)).rejects.toMatchObject({ status: 401 })
  })

  it('returns user + pb when authenticated', async () => {
    const pb = makeAuthenticatedPB() as any
    const result = await requireAuth(pb)
    expect(result.user).toBeDefined()
    expect(result.user.id).toBe('user-1')
    expect(result.user.role).toBe('admin')
    expect(result.pb).toBe(pb)
  })

  it('throws AuthError(401) when session expired', async () => {
    const pb = createMockPB() as any
    pb.collection = vi.fn(() => ({
      authRefresh: vi.fn().mockRejectedValue(new Error('Expired')),
    }))
    await expect(requireAuth(pb)).rejects.toMatchObject({
      message: 'Invalid or expired session',
      status: 401,
    })
  })
})

describe('requireRole', () => {
  it('accepts roles as array with pb parameter', async () => {
    const pb = makeAuthenticatedPB('chair') as any
    const result = await requireRole(['admin', 'chair'], pb as any)
    expect(result.user.role).toBe('chair')
  })

  it('accepts array of roles + pb', async () => {
    const pb = makeAuthenticatedPB('user') as any
    await expect(requireRole(['admin', 'chair'], pb as any)).rejects.toMatchObject({
      message: 'Access restricted to admin or chair',
      status: 403,
    })
  })

  it('throws when role not in allowed list', async () => {
    const pb = makeAuthenticatedPB('user') as any
    await expect(requireRole(['admin'], pb as any)).rejects.toMatchObject({ status: 403 })
  })

  it('requires auth first (unauthenticated)', async () => {
    const pb = createMockPB() as any
    // Note: must pass pb as second arg in array form: requireRole(['role'], pb)
    await expect(requireRole(['admin'], pb as any)).rejects.toMatchObject({ status: 401 })
  })
})

describe('AuthError', () => {
  it('constructs with message and status', () => {
    const err = new AuthError('Custom error', 418)
    expect(err.message).toBe('Custom error')
    expect(err.status).toBe(418)
    expect(err.name).toBe('AuthError')
  })

  it('defaults status to 401', () => {
    const err = new AuthError('Unauthenticated')
    expect(err.status).toBe(401)
  })
})
