// Derive winning option(s) per market from a settled match result — for UI only.
// Mirrors judgeBet / settleMarket in fifa-payout.ts (display layer, no payouts).

import type { MatchResult } from '@/lib/fifa-payout'

export type MarketResultSlice = Pick<
  MatchResult,
  'result_winner' | 'result_home_goals' | 'result_away_goals' | 'result_advance'
>

export interface MarketForResult {
  market_type: string
  mode: string
  line: number
  pool_by_option: Record<string, number>
}

/** Winning selection key(s) for a market type, or [] if none / push / void. */
export function getWinningSelections(
  marketType: string,
  line: number,
  result: MarketResultSlice,
): string[] {
  switch (marketType) {
    case 'match_winner': {
      const w = result.result_advance || result.result_winner
      if (!w || w === 'draw') return []
      return [w]
    }
    case 'total_goals_ou': {
      const total = (result.result_home_goals ?? 0) + (result.result_away_goals ?? 0)
      if (total > line) return ['over']
      if (total < line) return ['under']
      return []
    }
    case 'correct_score':
      return [`${result.result_home_goals ?? 0}-${result.result_away_goals ?? 0}`]
    case 'clean_sheet': {
      const winners: string[] = []
      if ((result.result_away_goals ?? 0) === 0) winners.push('home')
      if ((result.result_home_goals ?? 0) === 0) winners.push('away')
      return winners
    }
    default:
      return []
  }
}

/** Pool market: did anyone stake on a winning option? */
export function poolMarketHadWinner(
  market: MarketForResult,
  winningSelections: string[],
): boolean {
  if (market.mode !== 'pool') return winningSelections.length > 0
  if (winningSelections.length === 0) return false
  return winningSelections.some((sel) => (market.pool_by_option[sel] || 0) > 0)
}

export type SettledMarketStatus =
  | 'open'
  | 'closed'
  | 'voided'
  | 'pool_refunded'
  | 'settled'

export function getSettledMarketStatus(
  market: MarketForResult & { void: boolean; is_open: boolean },
  result: MarketResultSlice | null,
  matchSettled: boolean,
): { status: SettledMarketStatus; winningSelections: string[] } {
  if (market.void) {
    return { status: 'voided', winningSelections: [] }
  }
  const hasResult =
    result != null &&
    result.result_home_goals != null &&
    result.result_away_goals != null &&
    (result.result_winner === 'home' ||
      result.result_winner === 'away' ||
      result.result_winner === 'draw')

  if (!matchSettled || !hasResult) {
    return { status: market.is_open ? 'open' : 'closed', winningSelections: [] }
  }

  const winningSelections = getWinningSelections(market.market_type, market.line, result)
  if (market.mode === 'pool' && !poolMarketHadWinner(market, winningSelections)) {
    return { status: 'pool_refunded', winningSelections }
  }
  return { status: 'settled', winningSelections }
}