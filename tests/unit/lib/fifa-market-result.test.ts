import { describe, it, expect } from 'vitest'
import {
  getWinningSelections,
  poolMarketHadWinner,
  getSettledMarketStatus,
} from '@/lib/fifa-market-result'

const result = {
  result_winner: 'home' as const,
  result_home_goals: 2,
  result_away_goals: 1,
  result_advance: 'home' as const,
}

describe('getWinningSelections', () => {
  it('correct score 2-1', () => {
    expect(getWinningSelections('correct_score', 0, result)).toEqual(['2-1'])
  })
  it('total goals over 2.5', () => {
    expect(getWinningSelections('total_goals_ou', 2.5, result)).toEqual(['over'])
  })
  it('clean sheet none on 2-1', () => {
    expect(getWinningSelections('clean_sheet', 0, result)).toEqual([])
  })
})

describe('getSettledMarketStatus', () => {
  it('pool correct score with no winner → pool_refunded', () => {
    const { status } = getSettledMarketStatus(
      {
        market_type: 'correct_score',
        mode: 'pool',
        line: 0,
        pool_by_option: { '2-0': 75, '0-1': 50 },
        void: false,
        is_open: false,
      },
      result,
      true,
    )
    expect(status).toBe('pool_refunded')
    expect(poolMarketHadWinner(
      { mode: 'pool', market_type: 'correct_score', line: 0, pool_by_option: { '2-0': 75 } },
      ['2-1'],
    )).toBe(false)
  })

  it('pool match winner with home stakes → settled', () => {
    const { status, winningSelections } = getSettledMarketStatus(
      {
        market_type: 'match_winner',
        mode: 'pool',
        line: 0,
        pool_by_option: { home: 200, away: 100 },
        void: false,
        is_open: false,
      },
      result,
      true,
    )
    expect(status).toBe('settled')
    expect(winningSelections).toEqual(['home'])
  })
})