// Pure payout math for FIFA bet settlement. No side effects, no DB access —
// easy to unit-test per market type. The PB hook route calls these to compute
// payouts, then writes them to the DB.
//
// Settlement logic per market_type (see FIFA-GAME.md §4):
//   match_winner    → selection === (result_advance || result_winner)
//                     (knockouts: who advances; group: 90-min result)
//   total_goals_ou  → 90-min total vs line; over/under, exact push → void
//   correct_score   → selection === "{home}-{away}" (90-min score)
//   any_scorer      → selection ∈ result_scorers (anytime, reg + ET)
//   cards_ou        → total cards vs line; over/under, push → void
//   clean_sheet     → home/away 90-min clean sheet bool
//   custom          → admin marks winning option(s)

export interface MatchResult {
  result_winner: 'home' | 'away' | 'draw' | ''
  result_home_goals: number
  result_away_goals: number
  result_scorers: string[]
  result_yellow_cards: number
  result_red_cards: number
  result_home_clean_sheet: boolean
  result_away_clean_sheet: boolean
  // NEW — knockout football (FIFA-GAME.md §2.1):
  // Who advanced. For knockouts, match_winner settles on this when set.
  // For a 90-min draw, this is the ET/pens winner. Auto-set to result_winner
  // by the settle route when the 90-min result isn't a draw.
  result_advance?: 'home' | 'away' | ''
  result_after_extra_time?: boolean
  result_after_penalties?: boolean
}

export interface BetInfo {
  id: string
  user: string
  selection: string
  stake: number
  mode: 'pool' | 'fixed'
  odds_locked: number
  status: string // pending | won | lost | void
}

export type SettlementOutcome = 'won' | 'lost' | 'void'

/**
 * Determines whether a bet won, lost, or should be voided, based on the
 * market type and the match result. Pure function — no I/O.
 */
export function judgeBet(
  bet: { selection: string; status: string },
  market: { market_type: string; line: number; options: string[] },
  result: MatchResult,
  customWinners?: string[],
): SettlementOutcome {
  // Already settled bets keep their status (idempotency)
  if (bet.status === 'won' || bet.status === 'lost' || bet.status === 'void') {
    return bet.status as SettlementOutcome
  }

  const sel = bet.selection

  switch (market.market_type) {
    case 'match_winner': {
      // Knockouts: settle on who advanced (result_advance). Falls back to the
      // 90-min result_winner when result_advance isn't set. A 90-min draw
      // with no result_advance → void (the admin must pick who advanced;
      // "draw" is not a valid match-winner outcome in a knockout).
      const winner = result.result_advance || result.result_winner
      if (!winner || winner === 'draw') return 'void'
      // selection is "home" | "away" | "draw"
      return sel === winner ? 'won' : 'lost'
    }

    case 'total_goals_ou': {
      const total = result.result_home_goals + result.result_away_goals
      const line = market.line
      // selection is "over" or "under"
      if (sel === 'over') {
        if (total > line) return 'won'
        if (total < line) return 'lost'
        return 'void' // exact push
      }
      if (sel === 'under') {
        if (total < line) return 'won'
        if (total > line) return 'lost'
        return 'void' // exact push
      }
      return 'lost' // invalid selection
    }

    case 'correct_score': {
      const expected = `${result.result_home_goals}-${result.result_away_goals}`
      return sel === expected ? 'won' : 'lost'
    }

    case 'any_scorer': {
      if (result.result_scorers.length === 0) return 'void'
      return result.result_scorers.includes(sel) ? 'won' : 'lost'
    }

    case 'cards_ou': {
      const total = result.result_yellow_cards + result.result_red_cards
      const line = market.line
      if (sel === 'over') {
        if (total > line) return 'won'
        if (total < line) return 'lost'
        return 'void'
      }
      if (sel === 'under') {
        if (total < line) return 'won'
        if (total > line) return 'lost'
        return 'void'
      }
      return 'lost'
    }

    case 'clean_sheet': {
      const homeClean = (result.result_away_goals ?? 0) === 0
      const awayClean = (result.result_home_goals ?? 0) === 0
      if (sel === 'home') return homeClean ? 'won' : 'lost'
      if (sel === 'away') return awayClean ? 'won' : 'lost'
      return 'lost'
    }

    case 'custom': {
      if (!customWinners || customWinners.length === 0) return 'void'
      return customWinners.includes(sel) ? 'won' : 'lost'
    }

    default:
      return 'void'
  }
}

/**
 * Computes the payout for a winning bet. Pool and fixed modes differ:
 *   fixed: stake * odds_locked
 *   pool:  (stake / total_winning_stakes) * total_pool * (1 - house_cut)
 *
 * For void/lost bets, payout is 0 (refunds are handled separately by the
 * settle route for void markets).
 */
export function computePayout(
  bet: { stake: number; mode: 'pool' | 'fixed'; odds_locked: number },
  outcome: SettlementOutcome,
  poolContext: { totalPool: number; totalWinningStakes: number; houseCutPercent: number },
): number {
  if (outcome === 'lost') return 0
  if (outcome === 'void') return bet.stake // refund the stake

  if (bet.mode === 'fixed') {
    return Math.round(bet.stake * bet.odds_locked)
  }

  // pool
  if (poolContext.totalWinningStakes <= 0) return 0
  const cut = poolContext.houseCutPercent / 100
  const pool = poolContext.totalPool * (1 - cut)
  return Math.round((bet.stake / poolContext.totalWinningStakes) * pool)
}

/**
 * Settles all bets on a single market. Returns the bet updates (id, status,
 * payout) and whether the whole market should be voided+refunded (nobody
 * picked the winning outcome in a pool market → refund all stakes).
 */
export function settleMarket(
  market: { id: string; market_type: string; mode: 'pool' | 'fixed'; line: number; options: string[] },
  bets: Array<{ id: string; user: string; selection: string; stake: number; mode: 'pool' | 'fixed'; odds_locked: number; status: string }>,
  result: MatchResult,
  houseCutPercent: number,
  customWinners?: string[],
): {
  updates: Array<{ id: string; user: string; status: SettlementOutcome; payout: number }>
  marketVoided: boolean
} {
  // First pass: judge every bet
  const judged = bets.map((b) => ({
    bet: b,
    outcome: judgeBet(b, market, result, customWinners),
  }))

  // Pool market: if nobody won, void the market and refund all stakes.
  // Fixed market: losers just lose, no market-level void.
  if (market.mode === 'pool') {
    const anyWinner = judged.some((j) => j.outcome === 'won')
    if (!anyWinner && judged.length > 0) {
      // Void all bets, refund stakes
      return {
        updates: judged.map((j) => ({
          id: j.bet.id,
          user: j.bet.user,
          status: 'void' as SettlementOutcome,
          payout: j.bet.stake, // refund
        })),
        marketVoided: true,
      }
    }
  }

  // Compute pool context for pool-mode winners. Void bets are excluded from
  // the pool: their stakes are refunded (push, or voided before settlement),
  // so winners must only share the money that actually stays in the market —
  // otherwise settlement pays out more than was collected.
  const totalPool = judged
    .filter((j) => j.outcome !== 'void')
    .reduce((sum, j) => sum + j.bet.stake, 0)
  const totalWinningStakes = judged
    .filter((j) => j.outcome === 'won')
    .reduce((sum, j) => sum + j.bet.stake, 0)

  // Second pass: compute payouts
  const updates = judged.map((j) => ({
    id: j.bet.id,
    user: j.bet.user,
    status: j.outcome,
    payout: computePayout(j.bet, j.outcome, { totalPool, totalWinningStakes, houseCutPercent }),
  }))

  return { updates, marketVoided: false }
}
