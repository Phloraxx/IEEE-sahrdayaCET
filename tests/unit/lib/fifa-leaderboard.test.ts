import { describe, expect, it } from 'vitest'
import { DEFAULT_FIFA_LEADERBOARD_SETTINGS, raffleDrawWeight } from '@/lib/fifa-leaderboard'

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