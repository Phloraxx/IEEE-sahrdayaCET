/** Shared leaderboard row shape from GET /api/fifa/leaderboard */
export interface FifaLeaderboardRow {
  rank: number
  id: string
  display_name: string
  balance: number
  bets_count: number
}

export interface FifaLeaderboardSettings {
  raffle_tickets_base: number
  raffle_tickets_decay: number
  min_bets: number
}

export const DEFAULT_FIFA_LEADERBOARD_SETTINGS: FifaLeaderboardSettings = {
  raffle_tickets_base: 50,
  raffle_tickets_decay: 2,
  min_bets: 5,
}

/** Admin raffle draw weight from rank — not shown on public UI. */
export function raffleDrawWeight(
  rank: number,
  betsCount: number,
  settings: Pick<FifaLeaderboardSettings, 'raffle_tickets_base' | 'raffle_tickets_decay' | 'min_bets'>,
): number {
  if (betsCount < settings.min_bets) return 0
  return Math.max(1, settings.raffle_tickets_base - settings.raffle_tickets_decay * (rank - 1))
}