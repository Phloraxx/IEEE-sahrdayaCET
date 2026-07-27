import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFifaLiveScores, findLiveMatch } from '@/lib/fifa-live-match'

describe('FIFA live-score client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes valid matches and discards malformed rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      matches: [
        { id: 'm1', homeTeam: 'India', awayTeam: 'Japan', homeGoals: 2, awayGoals: 1, status: 'IN_PLAY', minute: 72 },
        { id: 'bad', homeTeam: '', awayTeam: 'Nobody' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const payload = await fetchFifaLiveScores()
    expect(payload.configured).toBe(true)
    expect(payload.matches).toHaveLength(1)
    expect(findLiveMatch('Japan', 'India', payload.matches)?.id).toBe('m1')
  })

  it('falls back quietly for public displays and can throw for admin actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(fetchFifaLiveScores()).resolves.toEqual({ matches: [], configured: false })
    await expect(fetchFifaLiveScores({ throwOnError: true })).rejects.toThrow('Live scores unavailable')
  })
})
