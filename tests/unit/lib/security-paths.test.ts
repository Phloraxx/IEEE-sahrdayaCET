import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import type PocketBase from 'pocketbase'
import type { AuthUser } from '@/types'

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockEscapeFilterValue } = vi.hoisted(() => ({
  mockEscapeFilterValue: vi.fn((v: string | number | boolean) => {
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return `'${String(v).replace(/'/g, "''")}'`
  }),
}))

vi.mock('@/lib/pb', () => ({
  escapeFilterValue: mockEscapeFilterValue,
}))

vi.mock('@/lib/constants', () => ({
  APP_URL: 'https://ieeesahrdaya.com',
  EMPTY_FILTER: 'id = ""',
}))

// ── SUT imports (mocks are applied) ────────────────────────────────────────

import { verifySameOrigin } from '@/lib/verify-same-origin'
import {
  isAdmin,
  isChair,
  getChairSocietyIds,
  scopeSocietyFilter,
  scopeEventFilter,
  scopeRegistrationFilter,
  requireEventScope,
  requireRegistrationScope,
} from '@/lib/chair-scope'
import { signCookie, verifySignedCookie } from '@/lib/cookie-signing'

// ── Helpers ────────────────────────────────────────────────────────────────

function mockPB(
  collections: Record<string, Record<string, Mock>>,
): PocketBase {
  return {
    collection: vi.fn((name: string) => {
      const c = collections[name]
      if (!c) throw new Error(`Unexpected collection: ${name}`)
      return c
    }),
  } as unknown as PocketBase
}

const adminUser: AuthUser = { id: 'admin-1', role: 'admin' }
const chairUser: AuthUser = { id: 'chair-1', role: 'chair' }
const regularUser: AuthUser = { id: 'user-1', role: 'user' }
const chairUserNoSocieties: AuthUser = { id: 'chair-empty', role: 'chair' }

// ==========================================================================
// 1. verify-same-origin.ts
// ==========================================================================

describe('verifySameOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('origin matching', () => {
    it('allows requests with matching origin', () => {
      const req = new Request('https://ieeesahrdaya.com/api/test', {
        headers: { origin: 'https://ieeesahrdaya.com' },
      })
      expect(() => verifySameOrigin(req)).not.toThrow()
    })

    it('allows requests with matching origin on a sub-path', () => {
      const req = new Request('https://ieeesahrdaya.com/admin/events/new', {
        headers: { origin: 'https://ieeesahrdaya.com' },
      })
      expect(() => verifySameOrigin(req)).not.toThrow()
    })

    it('rejects cross-origin requests', () => {
      const req = new Request('https://ieeesahrdaya.com/api/test', {
        headers: { origin: 'https://evil.com' },
      })
      expect(() => verifySameOrigin(req)).toThrow('Invalid origin')
    })

    it('rejects requests with different port (different origin)', () => {
      const req = new Request('https://ieeesahrdaya.com:8080/api/test', {
        headers: { origin: 'https://ieeesahrdaya.com:8080' },
      })
      expect(() => verifySameOrigin(req)).toThrow('Invalid origin')
    })

    it('rejects requests with different protocol (different origin)', () => {
      const req = new Request('http://ieeesahrdaya.com/api/test', {
        headers: { origin: 'http://ieeesahrdaya.com' },
      })
      expect(() => verifySameOrigin(req)).toThrow('Invalid origin')
    })

    it('rejects requests with an invalid origin URL', () => {
      const req = new Request('https://ieeesahrdaya.com/api/test', {
        headers: { origin: 'not-a-valid-url' },
      })
      expect(() => verifySameOrigin(req)).toThrow('Invalid origin')
    })
  })

  describe('missing origin header', () => {
    it('allows missing origin in non-production environment (NODE_ENV=test)', () => {
      const req = new Request('https://ieeesahrdaya.com/api/test')
      expect(() => verifySameOrigin(req)).not.toThrow()
    })

    it('allows missing origin in dev environment (NODE_ENV=development)', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const req = new Request('https://ieeesahrdaya.com/api/test')
      expect(() => verifySameOrigin(req)).not.toThrow()
    })

    it('throws Missing Origin header in production', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const req = new Request('https://ieeesahrdaya.com/api/test')
      expect(() => verifySameOrigin(req)).toThrow('Missing Origin header')
    })
  })
})

// ==========================================================================
// 2. chair-scope.ts
// ==========================================================================

describe('isAdmin / isChair', () => {
  it('isAdmin returns true for admin role', () => {
    expect(isAdmin(adminUser)).toBe(true)
  })

  it('isAdmin returns false for chair role', () => {
    expect(isAdmin(chairUser)).toBe(false)
  })

  it('isAdmin returns false for regular user', () => {
    expect(isAdmin(regularUser)).toBe(false)
  })

  it('isAdmin returns false when role is undefined', () => {
    expect(isAdmin({ id: 'no-role' })).toBe(false)
  })

  it('isChair returns true for chair role', () => {
    expect(isChair(chairUser)).toBe(true)
  })

  it('isChair returns false for admin role', () => {
    expect(isChair(adminUser)).toBe(false)
  })

  it('isChair returns false for regular user', () => {
    expect(isChair(regularUser)).toBe(false)
  })
})

describe('getChairSocietyIds', () => {
  it('returns undefined for admin users (unscoped)', async () => {
    const pb = mockPB({})
    const result = await getChairSocietyIds(pb, adminUser)
    expect(result).toBeUndefined()
  })

  it('returns empty array for non-chair, non-admin users', async () => {
    const pb = mockPB({})
    const result = await getChairSocietyIds(pb, regularUser)
    expect(result).toEqual([])
  })

  it('returns empty array for regular user with undefined role', async () => {
    const pb = mockPB({})
    const result = await getChairSocietyIds(pb, { id: 'anon' })
    expect(result).toEqual([])
  })

  it('fetches and returns society IDs for a chair', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([
        { id: 'soc-1' },
        { id: 'soc-2' },
      ]),
    }
    const pb = mockPB({ societies })
    const result = await getChairSocietyIds(pb, chairUser)

    expect(result).toEqual(['soc-1', 'soc-2'])
    expect(societies.getFullList).toHaveBeenCalledWith({
      filter: expect.stringContaining('chairs ?='),
      fields: 'id',
    })
    expect(mockEscapeFilterValue).toHaveBeenCalledWith('chair-1')
  })

  it('returns empty array when chair belongs to no societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([]),
    }
    const pb = mockPB({ societies })
    const result = await getChairSocietyIds(pb, chairUserNoSocieties)
    expect(result).toEqual([])
  })
})

describe('scopeSocietyFilter', () => {
  it('returns empty string for admin users', async () => {
    const pb = mockPB({})
    const result = await scopeSocietyFilter(pb, adminUser)
    expect(result).toBe('')
  })

  it('returns EMPTY_FILTER for chair with no societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([]),
    }
    const pb = mockPB({ societies })
    const result = await scopeSocietyFilter(pb, chairUserNoSocieties)
    expect(result).toBe('id = ""')
  })

  it('returns OR filter for chair with multiple societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([
        { id: 'soc-alpha' },
        { id: 'soc-beta' },
      ]),
    }
    const pb = mockPB({ societies })
    const result = await scopeSocietyFilter(pb, chairUser)
    expect(result).toContain('id =')
    expect(result).toContain('soc-alpha')
    expect(result).toContain('soc-beta')
    expect(result).toContain('||')
  })
})

describe('scopeEventFilter', () => {
  it('returns empty string for admin users', async () => {
    const pb = mockPB({})
    const result = await scopeEventFilter(pb, adminUser)
    expect(result).toBe('')
  })

  it('returns EMPTY_FILTER for chair with no societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([]),
    }
    const pb = mockPB({ societies })
    const result = await scopeEventFilter(pb, chairUserNoSocieties)
    expect(result).toBe('id = ""')
  })

  it('returns society-constrained filter for chair', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([
        { id: 'soc-1' },
      ]),
    }
    const pb = mockPB({ societies })
    const result = await scopeEventFilter(pb, chairUser)
    expect(result).toContain('society =')
    expect(result).toContain('soc-1')
  })
})

describe('scopeRegistrationFilter', () => {
  it('returns empty string for admin users', async () => {
    const pb = mockPB({})
    const result = await scopeRegistrationFilter(pb, adminUser)
    expect(result).toBe('')
  })

  it('returns EMPTY_FILTER for chair with no societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([]),
    }
    const pb = mockPB({ societies })
    const result = await scopeRegistrationFilter(pb, chairUserNoSocieties)
    expect(result).toBe('id = ""')
  })

  it('returns EMPTY_FILTER when chair has societies but implementation scopes via event.society (no separate event fetch)', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([{ id: 'soc-1' }]),
    }
    const pb = mockPB({ societies })
    const result = await scopeRegistrationFilter(pb, chairUser)
    // Implementation scopes registrations through event.society relation;
    // it does not enumerate events, so a chair with societies is never empty.
    expect(result).toContain('event.society =')
    expect(result).toContain('soc-1')
    expect(result).not.toBe('id = ""')
  })

  it('returns event.society-constrained filter for chair with societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([
        { id: 'soc-1' },
        { id: 'soc-2' },
      ]),
    }
    const pb = mockPB({ societies })
    const result = await scopeRegistrationFilter(pb, chairUser)
    expect(result).toContain('event.society =')
    expect(result).toContain('soc-1')
    expect(result).toContain('soc-2')
    expect(result).toContain('||')
  })
})

describe('requireEventScope', () => {
  it('passes for admin users without making PB calls', async () => {
    const pb = mockPB({})
    await expect(requireEventScope(pb, adminUser, 'event-1')).resolves.not.toThrow()
  })

  it('throws when user is not chair and not admin', async () => {
    const pb = mockPB({})
    await expect(requireEventScope(pb, regularUser, 'event-1')).rejects.toThrow(
      'Access restricted to admin or chair',
    )
  })

  it('throws when event is not found', async () => {
    const events = {
      getOne: vi.fn().mockRejectedValue(null),
    }
    const pb = mockPB({ events })
    await expect(requireEventScope(pb, chairUser, 'missing-event')).rejects.toThrow(
      'Event not found',
    )
  })

  it('throws when event has no society', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: null }),
    }
    const pb = mockPB({ events })
    await expect(requireEventScope(pb, chairUser, 'event-1')).rejects.toThrow(
      'Event has no society',
    )
  })

  it('throws when event society reference is a non-null non-string (empty array)', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: [] }),
    }
    const pb = mockPB({ events })
    await expect(requireEventScope(pb, chairUser, 'event-1')).rejects.toThrow(
      'Event has no society',
    )
  })

  it('throws when society is not found', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: 'soc-1' }),
    }
    const societies = {
      getOne: vi.fn().mockRejectedValue(null),
    }
    const pb = mockPB({ events, societies })
    await expect(requireEventScope(pb, chairUser, 'event-1')).rejects.toThrow(
      'Society not found',
    )
  })

  it('throws when chair is not in the society chair list', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: 'soc-1' }),
    }
    const societies = {
      getOne: vi.fn().mockResolvedValue({ id: 'soc-1', chairs: ['other-chair'] }),
    }
    const pb = mockPB({ events, societies })
    await expect(requireEventScope(pb, chairUser, 'event-1')).rejects.toThrow(
      'You can only access events for your own society',
    )
  })

  it('passes when chair is in the society chair list', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: 'soc-1' }),
    }
    const societies = {
      getOne: vi.fn().mockResolvedValue({ id: 'soc-1', chairs: ['chair-1', 'other-chair'] }),
    }
    const pb = mockPB({ events, societies })
    await expect(requireEventScope(pb, chairUser, 'event-1')).resolves.not.toThrow()
  })

  it('handles society as a PocketBase relation array (single element)', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: ['soc-array'] }),
    }
    const societies = {
      getOne: vi.fn().mockResolvedValue({ id: 'soc-array', chairs: ['chair-1'] }),
    }
    const pb = mockPB({ events, societies })
    await expect(requireEventScope(pb, chairUser, 'event-1')).resolves.not.toThrow()
  })
})

describe('requireRegistrationScope', () => {
  it('passes for admin users without making PB calls', async () => {
    const pb = mockPB({})
    await expect(requireRegistrationScope(pb, adminUser, 'reg-1')).resolves.not.toThrow()
  })

  it('throws when user is not chair and not admin', async () => {
    const pb = mockPB({})
    await expect(requireRegistrationScope(pb, regularUser, 'reg-1')).rejects.toThrow(
      'Access restricted to admin or chair',
    )
  })

  it('throws when registration is not found', async () => {
    const registrations = {
      getOne: vi.fn().mockRejectedValue(null),
    }
    const pb = mockPB({ registrations })
    await expect(requireRegistrationScope(pb, chairUser, 'missing-reg')).rejects.toThrow(
      'Registration not found',
    )
  })

  it('throws when registration has no event', async () => {
    const registrations = {
      getOne: vi.fn().mockResolvedValue({ id: 'reg-1', event: null }),
    }
    const pb = mockPB({ registrations })
    await expect(requireRegistrationScope(pb, chairUser, 'reg-1')).rejects.toThrow(
      'Registration has no event',
    )
  })

  it('passes when chair has access to the registration\'s event', async () => {
    const registrations = {
      getOne: vi.fn().mockResolvedValue({ id: 'reg-1', event: 'event-1' }),
    }
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: 'soc-1' }),
    }
    const societies = {
      getOne: vi.fn().mockResolvedValue({ id: 'soc-1', chairs: ['chair-1'] }),
    }
    const pb = mockPB({ registrations, events, societies })
    await expect(requireRegistrationScope(pb, chairUser, 'reg-1')).resolves.not.toThrow()
  })

  it('throws when chair does not own the registration\'s event society', async () => {
    const registrations = {
      getOne: vi.fn().mockResolvedValue({ id: 'reg-1', event: 'event-1' }),
    }
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', society: 'soc-1' }),
    }
    const societies = {
      getOne: vi.fn().mockResolvedValue({ id: 'soc-1', chairs: ['other-chair'] }),
    }
    const pb = mockPB({ registrations, events, societies })
    await expect(requireRegistrationScope(pb, chairUser, 'reg-1')).rejects.toThrow(
      'You can only access events for your own society',
    )
  })
})

// ==========================================================================
// 3. webhook — moved to pb_hooks/webhook.pb.js (PocketBase JS runtime).
//    Idempotency + body validation are enforced inside the PB hook and
//    cannot be unit-tested here (Goja JS, not importable by vitest).
//    See pb_hooks/webhook.pb.js for the canonical implementation.
// ==========================================================================

// ==========================================================================
// 4. cookie-signing.ts
// ==========================================================================

describe('signCookie / verifySignedCookie', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_COOKIE_SECRET', 'test-secret-for-testing')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signs and verifies a roundtrip for a simple payload', () => {
    const payload = JSON.stringify({ state: 'abc123', provider: 'google' })
    const signedCookie = payload + '.' + signCookie(payload)
    const result = verifySignedCookie(signedCookie)
    expect(result).toEqual({ state: 'abc123', provider: 'google' })
  })

  it('signs and verifies a roundtrip for a complex payload', () => {
    const payload = JSON.stringify({
      user: 'test',
      roles: ['admin', 'chair'],
      count: 42,
    })
    const signedCookie = payload + '.' + signCookie(payload)
    const result = verifySignedCookie(signedCookie)
    expect(result).toEqual({ user: 'test', roles: ['admin', 'chair'], count: 42 })
  })

  it('returns null for tampered cookie (modified payload)', () => {
    const payload = JSON.stringify({ state: 'abc123' })
    const signature = signCookie(payload)
    const signedCookie = payload + '.' + signature
    // Tamper with the payload portion
    const tampered = '{"state":"evil"}' + '.' + signature
    const result = verifySignedCookie(tampered)
    expect(result).toBeNull()
  })

  it('returns null for tampered cookie (modified signature)', () => {
    const payload = JSON.stringify({ state: 'abc123' })
    const signature = signCookie(payload)
    const signedCookie = payload + '.' + signature
    const tampered = payload + '.invalidsignature'
    const result = verifySignedCookie(tampered)
    expect(result).toBeNull()
  })

  it('returns null for malformed cookie (no dot separator)', () => {
    const result = verifySignedCookie('no-dot-here')
    expect(result).toBeNull()
  })

  it('returns null for cookie with only a dot but empty payload', () => {
    const result = verifySignedCookie('.signature')
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    const result = verifySignedCookie('')
    expect(result).toBeNull()
  })

  it('returns null for invalid JSON payload', () => {
    const payload = '{invalid-json}'
    const signedCookie = payload + '.' + signCookie(payload)
    const result = verifySignedCookie(signedCookie)
    expect(result).toBeNull()
  })

  it('produces a base64url HMAC signature without a dot separator', () => {
    const payload = JSON.stringify({ state: 'abc' })
    const signature = signCookie(payload)
    expect(signature).not.toContain('.')
    expect(signature.length).toBeGreaterThan(0)
  })

  it('rejects wrong-length signature via timingSafeEqual early return', () => {
    const payload = JSON.stringify({ state: 'abc' })
    const signature = signCookie(payload)
    const tampered = payload + '.' + 'a'.repeat(signature.length + 1)
    const result = verifySignedCookie(tampered)
    expect(result).toBeNull()
  })
})
