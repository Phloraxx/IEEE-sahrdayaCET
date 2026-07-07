import { describe, it, expect } from 'vitest'
import {
  judgeBet,
  computePayout,
  settleMarket,
  type MatchResult,
  type BetInfo,
} from '@/lib/fifa-payout'

const baseResult: MatchResult = {
  result_winner: '',
  result_home_goals: 0,
  result_away_goals: 0,
  result_scorers: [],
  result_yellow_cards: 0,
  result_red_cards: 0,
  result_home_clean_sheet: false,
  result_away_clean_sheet: false,
}

const pendingBet = (selection: string, extra: Partial<BetInfo> = {}): BetInfo => ({
  id: 'b1',
  user: 'u1',
  selection,
  stake: 100,
  mode: 'fixed',
  odds_locked: 2,
  status: 'pending',
  ...extra,
})

describe('judgeBet — match_winner', () => {
  it('wins when selection matches result_winner (no advance field, non-draw)', () => {
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'home' })).toBe('won')
    expect(judgeBet(pendingBet('away'), { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'away' })).toBe('won')
  })
  it('loses when selection does not match', () => {
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'away' })).toBe('lost')
  })
  it('voids when result_winner is empty (not settled)', () => {
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, baseResult)).toBe('void')
  })
  // Knockout-only game: a 90-min draw with no result_advance → void (the
  // admin must pick who advanced; "draw" is not a valid match-winner outcome
  // in a knockout). Covered in the knockout describe block below too.
  it('voids when result_winner is draw and no result_advance (knockout)', () => {
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'draw' })).toBe('void')
    expect(judgeBet(pendingBet('draw'), { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'draw' })).toBe('void')
  })
})

describe('judgeBet — match_winner knockout (result_advance)', () => {
  // Knockout: 90-min draw, home advanced on pens. match_winner settles on
  // result_advance, NOT result_winner (which is "draw").
  it('settles on result_advance when set, ignoring 90-min draw', () => {
    const r: MatchResult = { ...baseResult, result_winner: 'draw', result_advance: 'home', result_after_penalties: true }
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, r)).toBe('won')
    expect(judgeBet(pendingBet('away'), { market_type: 'match_winner', line: 0, options: [] }, r)).toBe('lost')
    // A "draw" selection loses in a knockout — there is no draw outcome.
    expect(judgeBet(pendingBet('draw'), { market_type: 'match_winner', line: 0, options: [] }, r)).toBe('lost')
  })
  it('voids when 90-min was a draw and no result_advance set (admin forgot)', () => {
    const r: MatchResult = { ...baseResult, result_winner: 'draw' }
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, r)).toBe('void')
  })
  it('uses result_advance even when result_winner is also set to a non-draw', () => {
    // 90-min 2-1 home win → advance should be home. result_advance wins.
    const r: MatchResult = { ...baseResult, result_winner: 'home', result_home_goals: 2, result_away_goals: 1, result_advance: 'home' }
    expect(judgeBet(pendingBet('home'), { market_type: 'match_winner', line: 0, options: [] }, r)).toBe('won')
  })
})

describe('judgeBet — total_goals_ou', () => {
  it('over wins when total > line', () => {
    const r = { ...baseResult, result_home_goals: 2, result_away_goals: 1 } // total 3
    expect(judgeBet(pendingBet('over'), { market_type: 'total_goals_ou', line: 2.5, options: [] }, r)).toBe('won')
  })
  it('over loses when total < line', () => {
    const r = { ...baseResult, result_home_goals: 1, result_away_goals: 0 } // total 1
    expect(judgeBet(pendingBet('over'), { market_type: 'total_goals_ou', line: 2.5, options: [] }, r)).toBe('lost')
  })
  it('voids on exact push (total === line, integer line)', () => {
    const r = { ...baseResult, result_home_goals: 1, result_away_goals: 1 } // total 2
    expect(judgeBet(pendingBet('over'), { market_type: 'total_goals_ou', line: 2, options: [] }, r)).toBe('void')
    expect(judgeBet(pendingBet('under'), { market_type: 'total_goals_ou', line: 2, options: [] }, r)).toBe('void')
  })
  it('under wins when total < line', () => {
    const r = { ...baseResult, result_home_goals: 0, result_away_goals: 1 } // total 1
    expect(judgeBet(pendingBet('under'), { market_type: 'total_goals_ou', line: 2.5, options: [] }, r)).toBe('won')
  })
})

describe('judgeBet — correct_score', () => {
  it('wins when selection matches "{home}-{away}"', () => {
    const r = { ...baseResult, result_home_goals: 2, result_away_goals: 1 }
    expect(judgeBet(pendingBet('2-1'), { market_type: 'correct_score', line: 0, options: [] }, r)).toBe('won')
  })
  it('loses on wrong score', () => {
    const r = { ...baseResult, result_home_goals: 2, result_away_goals: 1 }
    expect(judgeBet(pendingBet('1-2'), { market_type: 'correct_score', line: 0, options: [] }, r)).toBe('lost')
  })
})

describe('judgeBet — any_scorer', () => {
  it('wins when selection is in result_scorers', () => {
    const r = { ...baseResult, result_scorers: ['Messi', 'Ronaldo'] }
    expect(judgeBet(pendingBet('Messi'), { market_type: 'any_scorer', line: 0, options: [] }, r)).toBe('won')
  })
  it('loses when selection not in scorers', () => {
    const r = { ...baseResult, result_scorers: ['Messi'] }
    expect(judgeBet(pendingBet('Neymar'), { market_type: 'any_scorer', line: 0, options: [] }, r)).toBe('lost')
  })
  it('voids when no scorers recorded', () => {
    expect(judgeBet(pendingBet('Messi'), { market_type: 'any_scorer', line: 0, options: [] }, baseResult)).toBe('void')
  })
})

describe('judgeBet — cards_ou', () => {
  it('over wins when total cards > line', () => {
    const r = { ...baseResult, result_yellow_cards: 3, result_red_cards: 1 } // total 4
    expect(judgeBet(pendingBet('over'), { market_type: 'cards_ou', line: 3.5, options: [] }, r)).toBe('won')
  })
  it('voids on exact push', () => {
    const r = { ...baseResult, result_yellow_cards: 2, result_red_cards: 0 } // total 2
    expect(judgeBet(pendingBet('over'), { market_type: 'cards_ou', line: 2, options: [] }, r)).toBe('void')
  })
})

describe('judgeBet — clean_sheet', () => {
  it('home wins when result_home_clean_sheet is true', () => {
    const r = { ...baseResult, result_home_clean_sheet: true }
    expect(judgeBet(pendingBet('home'), { market_type: 'clean_sheet', line: 0, options: [] }, r)).toBe('won')
  })
  it('away loses when result_away_clean_sheet is false', () => {
    expect(judgeBet(pendingBet('away'), { market_type: 'clean_sheet', line: 0, options: [] }, baseResult)).toBe('lost')
  })
})

describe('judgeBet — custom', () => {
  it('wins when selection is in customWinners', () => {
    expect(judgeBet(pendingBet('Option A'), { market_type: 'custom', line: 0, options: ['Option A', 'Option B'] }, baseResult, ['Option A'])).toBe('won')
  })
  it('voids when no custom winners provided', () => {
    expect(judgeBet(pendingBet('Option A'), { market_type: 'custom', line: 0, options: [] }, baseResult)).toBe('void')
    expect(judgeBet(pendingBet('Option A'), { market_type: 'custom', line: 0, options: [] }, baseResult, [])).toBe('void')
  })
})

describe('judgeBet — idempotency', () => {
  it('preserves already-settled status', () => {
    expect(judgeBet({ ...pendingBet('home'), status: 'won' }, { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'away' })).toBe('won')
    expect(judgeBet({ ...pendingBet('home'), status: 'lost' }, { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'home' })).toBe('lost')
    expect(judgeBet({ ...pendingBet('home'), status: 'void' }, { market_type: 'match_winner', line: 0, options: [] }, { ...baseResult, result_winner: 'home' })).toBe('void')
  })
})

describe('computePayout', () => {
  it('fixed mode: stake * odds_locked', () => {
    expect(computePayout({ stake: 100, mode: 'fixed', odds_locked: 2.5 }, 'won', { totalPool: 0, totalWinningStakes: 0, houseCutPercent: 0 })).toBe(250)
  })
  it('lost bets pay 0', () => {
    expect(computePayout({ stake: 100, mode: 'fixed', odds_locked: 2.5 }, 'lost', { totalPool: 0, totalWinningStakes: 0, houseCutPercent: 0 })).toBe(0)
  })
  it('void bets refund the stake', () => {
    expect(computePayout({ stake: 100, mode: 'fixed', odds_locked: 2.5 }, 'void', { totalPool: 0, totalWinningStakes: 0, houseCutPercent: 0 })).toBe(100)
  })
  it('pool mode: proportional share of pool after house cut', () => {
    // Pool 1000, winning stakes 200, this bet 50, cut 10%
    // payout = (50/200) * 1000 * 0.9 = 225
    expect(computePayout({ stake: 50, mode: 'pool', odds_locked: 0 }, 'won', { totalPool: 1000, totalWinningStakes: 200, houseCutPercent: 10 })).toBe(225)
  })
  it('pool mode: 0 winning stakes → 0 payout (safety)', () => {
    expect(computePayout({ stake: 50, mode: 'pool', odds_locked: 0 }, 'won', { totalPool: 1000, totalWinningStakes: 0, houseCutPercent: 0 })).toBe(0)
  })
  it('pool mode: no house cut', () => {
    // Pool 600, winning stakes 300, this bet 100, cut 0%
    // payout = (100/300) * 600 * 1 = 200
    expect(computePayout({ stake: 100, mode: 'pool', odds_locked: 0 }, 'won', { totalPool: 600, totalWinningStakes: 300, houseCutPercent: 0 })).toBe(200)
  })
})

describe('settleMarket — pool void-and-refund', () => {
  it('voids entire pool market when nobody picked the winning outcome', () => {
    const market = { id: 'm1', market_type: 'match_winner', mode: 'pool' as const, line: 0, options: ['home', 'away', 'draw'] }
    const bets = [
      { id: 'b1', user: 'u1', selection: 'home', stake: 100, mode: 'pool' as const, odds_locked: 0, status: 'pending' },
      { id: 'b2', user: 'u2', selection: 'away', stake: 50, mode: 'pool' as const, odds_locked: 0, status: 'pending' },
    ]
    const result = { ...baseResult, result_winner: 'draw' } // nobody picked draw
    const { updates, marketVoided } = settleMarket(market, bets, result, 0)
    expect(marketVoided).toBe(true)
    expect(updates.every((u) => u.status === 'void')).toBe(true)
    expect(updates[0].payout).toBe(100) // refund
    expect(updates[1].payout).toBe(50) // refund
  })
})

describe('settleMarket — pool with winners', () => {
  it('splits pool proportional to winning stakes', () => {
    const market = { id: 'm1', market_type: 'match_winner', mode: 'pool' as const, line: 0, options: ['home', 'away'] }
    const bets = [
      { id: 'b1', user: 'u1', selection: 'home', stake: 100, mode: 'pool' as const, odds_locked: 0, status: 'pending' },
      { id: 'b2', user: 'u2', selection: 'home', stake: 50, mode: 'pool' as const, odds_locked: 0, status: 'pending' },
      { id: 'b3', user: 'u3', selection: 'away', stake: 200, mode: 'pool' as const, odds_locked: 0, status: 'pending' },
    ]
    const result = { ...baseResult, result_winner: 'home' }
    const { updates, marketVoided } = settleMarket(market, bets, result, 0)
    expect(marketVoided).toBe(false)
    // Total pool = 350. Winning stakes = 150. No cut.
    // b1: (100/150)*350 = 233.33 → 233
    // b2: (50/150)*350 = 116.67 → 117
    // b3: lost, payout 0
    const b1 = updates.find((u) => u.id === 'b1')!
    const b2 = updates.find((u) => u.id === 'b2')!
    const b3 = updates.find((u) => u.id === 'b3')!
    expect(b1.status).toBe('won')
    expect(b1.payout).toBe(233)
    expect(b2.status).toBe('won')
    expect(b2.payout).toBe(117)
    expect(b3.status).toBe('lost')
    expect(b3.payout).toBe(0)
  })
})

describe('settleMarket — fixed mode', () => {
  it('pays stake * odds_locked for winners, 0 for losers, no market void', () => {
    const market = { id: 'm1', market_type: 'match_winner', mode: 'fixed' as const, line: 0, options: ['home', 'away'] }
    const bets = [
      { id: 'b1', user: 'u1', selection: 'home', stake: 100, mode: 'fixed' as const, odds_locked: 1.5, status: 'pending' },
      { id: 'b2', user: 'u2', selection: 'away', stake: 100, mode: 'fixed' as const, odds_locked: 4, status: 'pending' },
    ]
    const result = { ...baseResult, result_winner: 'home' }
    const { updates, marketVoided } = settleMarket(market, bets, result, 0)
    expect(marketVoided).toBe(false)
    expect(updates.find((u) => u.id === 'b1')!.payout).toBe(150)
    expect(updates.find((u) => u.id === 'b2')!.payout).toBe(0)
  })
})

describe('settleMarket — idempotency', () => {
  it('preserves already-settled bet statuses', () => {
    const market = { id: 'm1', market_type: 'match_winner', mode: 'fixed' as const, line: 0, options: ['home', 'away'] }
    const bets = [
      { id: 'b1', user: 'u1', selection: 'home', stake: 100, mode: 'fixed' as const, odds_locked: 2, status: 'won' },
      { id: 'b2', user: 'u2', selection: 'away', stake: 100, mode: 'fixed' as const, odds_locked: 2, status: 'pending' },
    ]
    const result = { ...baseResult, result_winner: 'away' } // would make b1 lose if re-judged
    const { updates } = settleMarket(market, bets, result, 0)
    // b1 stays won (idempotent), b2 newly judged as won
    expect(updates.find((u) => u.id === 'b1')!.status).toBe('won')
    expect(updates.find((u) => u.id === 'b2')!.status).toBe('won')
  })
})

describe('settleMarket — over/under push voids only the pushing bet', () => {
  it('voids the over bet on exact push but settles under separately', () => {
    const market = { id: 'm1', market_type: 'total_goals_ou', mode: 'fixed' as const, line: 2, options: ['over', 'under'] }
    const bets = [
      { id: 'b1', user: 'u1', selection: 'over', stake: 100, mode: 'fixed' as const, odds_locked: 1.9, status: 'pending' },
      { id: 'b2', user: 'u2', selection: 'under', stake: 100, mode: 'fixed' as const, odds_locked: 1.9, status: 'pending' },
    ]
    const r = { ...baseResult, result_home_goals: 1, result_away_goals: 1 } // total 2 = line
    const { updates, marketVoided } = settleMarket(market, bets, r, 0)
    expect(marketVoided).toBe(false)
    expect(updates.find((u) => u.id === 'b1')!.status).toBe('void')
    expect(updates.find((u) => u.id === 'b1')!.payout).toBe(100) // refund
    expect(updates.find((u) => u.id === 'b2')!.status).toBe('void')
    expect(updates.find((u) => u.id === 'b2')!.payout).toBe(100) // refund
  })
})
