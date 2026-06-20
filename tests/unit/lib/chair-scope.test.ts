import { describe, it, expect, vi } from 'vitest'
import { getChairSocietyIds, buildSocietyFilter, buildRegistrationsBySocietyFilter } from '@/lib/chair-scope'

describe('getChairSocietyIds', () => {
  it('returns society IDs when user is a chair', async () => {
    const mockPB = {
      collection: vi.fn(() => ({
        getFullList: vi.fn().mockResolvedValue([
          { id: 'soc-1' },
          { id: 'soc-2' },
        ]),
      })),
    }
    const ids = await getChairSocietyIds(mockPB as any, 'user-1')
    expect(ids).toEqual(['soc-1', 'soc-2'])
    expect(mockPB.collection).toHaveBeenCalledWith('societies')
  })

  it('returns empty array when user is not a chair of any society', async () => {
    const mockPB = {
      collection: vi.fn(() => ({
        getFullList: vi.fn().mockResolvedValue([]),
      })),
    }
    const ids = await getChairSocietyIds(mockPB as any, 'user-1')
    expect(ids).toEqual([])
  })

  it('returns empty array on error (graceful degradation)', async () => {
    const mockPB = {
      collection: vi.fn(() => ({
        getFullList: vi.fn().mockRejectedValue(new Error('DB error')),
      })),
    }
    const ids = await getChairSocietyIds(mockPB as any, 'user-1')
    expect(ids).toEqual([])
  })
})

describe('buildSocietyFilter', () => {
  it('returns OR-joined filter for multiple society IDs', () => {
    const filter = buildSocietyFilter(['soc-1', 'soc-2'])
    expect(filter).toBe("society = 'soc-1' || society = 'soc-2'")
  })

  it('returns impossible filter for empty array (no access)', () => {
    const filter = buildSocietyFilter([])
    expect(filter).toBe('id = ""')
  })

  it('escapes special characters in IDs', () => {
    const filter = buildSocietyFilter(["O'Brien"])
    expect(filter).toBe("society = 'O''Brien'")
  })
})

describe('buildRegistrationsBySocietyFilter', () => {
  it('returns OR-joined filter for multiple society IDs', () => {
    const filter = buildRegistrationsBySocietyFilter(['soc-1', 'soc-2'])
    expect(filter).toBe("event.society = 'soc-1' || event.society = 'soc-2'")
  })

  it('returns impossible filter for empty array', () => {
    const filter = buildRegistrationsBySocietyFilter([])
    expect(filter).toBe('id = ""')
  })
})
