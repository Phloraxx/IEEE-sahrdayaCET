import { describe, it, expect, vi, type Mock } from 'vitest'
import type PocketBase from 'pocketbase'
import type { AuthUser } from '@/types'

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockEscapeFilterValue = vi.hoisted(() => vi.fn((v) => {
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  return `'${String(v).replace(/'/g, "")}'`
}))

vi.mock('@/lib/pb', () => ({
  escapeFilterValue: mockEscapeFilterValue,
}))

vi.mock('@/lib/constants', () => ({
  EMPTY_FILTER: 'id = ""',
}))

// ── SUT imports (mocks are applied) ────────────────────────────────────────

import {
  getChairSocietyIds,
  scopeSocietyFilter,
  scopeRegistrationFilter,
} from '@/lib/chair-scope'

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

// ── Tests ──────────────────────────────────────────────────────────────────

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
    const result = await getChairSocietyIds(pb, chairUser)
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

  it('returns event.society-constrained filter for chair with societies', async () => {
    const societies = {
      getFullList: vi.fn().mockResolvedValue([
        { id: 'soc-1' },
        { id: 'soc-2' },
      ]),
    }
    const pb = mockPB({ societies })
    const result = await scopeRegistrationFilter(pb, chairUser)
    // Implementation scopes via the event.society relation, not event id.
    expect(result).toContain('event.society =')
    expect(result).toContain('soc-1')
    expect(result).toContain('soc-2')
    expect(result).toContain('||')
  })
})
