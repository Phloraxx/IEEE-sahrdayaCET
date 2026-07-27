/** Shared leaderboard row shape from GET /api/fifa/leaderboard. */
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

export interface FifaLeaderboardPayload {
  leaderboard: FifaLeaderboardRow[]
  settings: Pick<FifaLeaderboardSettings, 'min_bets'>
}

export const DEFAULT_FIFA_LEADERBOARD_SETTINGS: FifaLeaderboardSettings = {
  raffle_tickets_base: 50,
  raffle_tickets_decay: 2,
  min_bets: 5,
}

export async function fetchFifaLeaderboard(): Promise<FifaLeaderboardPayload> {
  const response = await fetch('/api/fifa/leaderboard')
  if (!response.ok) throw new Error('Failed to load leaderboard')
  const raw = await response.json() as unknown
  if (!raw || typeof raw !== 'object') throw new Error('Invalid leaderboard response')
  const payload = raw as { leaderboard?: unknown; settings?: unknown }
  const leaderboard = Array.isArray(payload.leaderboard)
    ? payload.leaderboard.flatMap((entry): FifaLeaderboardRow[] => {
        if (!entry || typeof entry !== 'object') return []
        const row = entry as Record<string, unknown>
        const id = typeof row.id === 'string' ? row.id : ''
        const rank = Number(row.rank)
        if (!id || !Number.isInteger(rank) || rank < 1) return []
        return [{
          rank,
          id,
          display_name: typeof row.display_name === 'string' ? row.display_name : '',
          balance: Number.isFinite(Number(row.balance)) ? Number(row.balance) : 0,
          bets_count: Number.isFinite(Number(row.bets_count)) ? Number(row.bets_count) : 0,
        }]
      })
    : []
  const settings = payload.settings && typeof payload.settings === 'object'
    ? payload.settings as Record<string, unknown>
    : {}
  const rawMinBets = Number(settings.min_bets)
  const minBets = Number.isInteger(rawMinBets) && rawMinBets >= 0
    ? rawMinBets
    : DEFAULT_FIFA_LEADERBOARD_SETTINGS.min_bets
  return { leaderboard, settings: { min_bets: minBets } }
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
