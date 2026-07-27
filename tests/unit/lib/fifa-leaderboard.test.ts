import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FIFA_LEADERBOARD_SETTINGS, fetchFifaLeaderboard, raffleDrawWeight } from '@/lib/fifa-leaderboard'

describe('raffleDrawWeight', () => {
  const s = DEFAULT_FIFA_LEADERBOARD_SETTINGS

  it('returns 0 when below min bets', () => {
    expect(raffleDrawWeight(1, s.min_bets - 1, s)).toBe(0)
  })

  it('returns base tickets at rank 1', () => {
    expect(raffleDrawWeight(1, s.min_bets, s)).toBe(s.raffle_tickets_base)
  })

  it('decays by rank', () => {
    expect(raffleDrawWeight(3, s.min_bets, s)).toBe(
      Math.max(1, s.raffle_tickets_base - s.raffle_tickets_decay * 2),
    )
  })
})

describe('fetchFifaLeaderboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes the endpoint contract and preserves min_bets=0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      leaderboard: [
        { rank: 1, id: 'u1', display_name: 'A', balance: 1000, bets_count: 0 },
        { rank: 'bad', id: '', display_name: 'invalid', balance: 0, bets_count: 0 },
      ],
      settings: { min_bets: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const payload = await fetchFifaLeaderboard()
    expect(payload.settings.min_bets).toBe(0)
    expect(payload.leaderboard).toEqual([
      { rank: 1, id: 'u1', display_name: 'A', balance: 1000, bets_count: 0 },
    ])
  })

  it('throws on an unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    await expect(fetchFifaLeaderboard()).rejects.toThrow('Failed to load leaderboard')
  })
})
