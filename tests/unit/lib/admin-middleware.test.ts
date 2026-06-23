import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: vi.fn(() => ''),
}))

vi.mock('@/lib/pb', () => ({
  createPB: vi.fn(),
  escapeFilterValue: vi.fn((v: string | number | boolean) => {
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return `'${v.replace(/'/g, "''")}'`
  }),
}))

const mockGetChairSocietyIds = vi.fn()

vi.mock('@/lib/chair-scope', () => ({
  getChairSocietyIds: mockGetChairSocietyIds,
}))

import { buildChairFilter } from '@/lib/admin-middleware'

describe('buildChairFilter', () => {
  const adminCtx = { pb: {}, userId: 'admin-1', role: 'admin' } as const
  const chairCtx = { pb: {}, userId: 'chair-1', role: 'chair' } as const

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns '' for admin users (no scope)", async () => {
    const result = await buildChairFilter(adminCtx, 'event')
    expect(result).toBe('')
    expect(mockGetChairSocietyIds).not.toHaveBeenCalled()
  })

  it("returns 'id = \"\"' for chair with no societies", async () => {
    mockGetChairSocietyIds.mockResolvedValue([])
    const result = await buildChairFilter(chairCtx, 'event')
    expect(result).toBe('id = ""')
    expect(mockGetChairSocietyIds).toHaveBeenCalledTimes(1)
  })

  it('uses escapeFilterValue for society IDs (verify the filter is properly escaped)', async () => {
    mockGetChairSocietyIds.mockResolvedValue(["soc'1"])
    const result = await buildChairFilter(chairCtx, 'event')
    // The single quote inside the value should be doubled (PocketBase escaping)
    expect(result).toBe("society = 'soc''1'")
  })

  it('generates correct event scope filter for multiple societies', async () => {
    mockGetChairSocietyIds.mockResolvedValue(['soc-1', 'soc-2'])
    const result = await buildChairFilter(chairCtx, 'event')
    expect(result).toBe("society = 'soc-1' || society = 'soc-2'")
  })

  it('generates correct registration scope filter', async () => {
    mockGetChairSocietyIds.mockResolvedValue(['soc-A', 'soc-B'])
    const result = await buildChairFilter(chairCtx, 'registration')
    expect(result).toBe("event.society = 'soc-A' || event.society = 'soc-B'")
  })

  it('generates correct society scope filter', async () => {
    mockGetChairSocietyIds.mockResolvedValue(['soc-X', 'soc-Y'])
    const result = await buildChairFilter(chairCtx, 'society')
    expect(result).toBe("id = 'soc-X' || id = 'soc-Y'")
  })
})
