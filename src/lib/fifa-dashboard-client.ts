export class FifaDashboardAuthError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'FifaDashboardAuthError'
  }
}

export interface FifaDashboardBet {
  id: string
  selection: string
  stake: number
  mode: string
  odds_locked: number
  status: string
  payout: number
  placed_at: string
  match: { id: string; team_home: string; team_away: string } | null
  market: { id: string; market_type: string } | null
}

export interface FifaDashboardPayload {
  user: { id: string; display_name: string; balance: number; email: string }
  max_bet_percent: number
  valid_bets_count: number
  bets: FifaDashboardBet[]
  /** Recent id+status for settlement toasts (wider than displayed bets list). */
  bet_statuses: Array<{ id: string; status: string }>
  transactions: Array<{
    id: string
    type: string
    amount: number
    balance_after: number
    note: string
    timestamp: string
  }>
}

export async function fetchFifaDashboard(): Promise<FifaDashboardPayload> {
  const res = await fetch('/api/fifa/dashboard')
  if (res.status === 401 || res.status === 403) throw new FifaDashboardAuthError()
  if (!res.ok) throw new Error('Failed to load dashboard')
  return res.json()
}