import { z } from 'zod'

// ─── FIFA WC Predict '26 — zod schemas ──────────────────────────────
// Shared client-side validation and strongly typed game contracts.
// Authoritative write invariants remain in PocketBase rules/hooks.

export const FIFA_MARKET_TYPE = ['match_winner', 'total_goals_ou', 'correct_score', 'any_scorer', 'cards_ou', 'clean_sheet', 'custom'] as const
export const FIFA_MARKET_MODE = ['pool', 'fixed'] as const

// Human-readable labels for market types — shared between the public match
// page and the admin match-detail page so they never diverge.
export const FIFA_MARKET_LABELS: Record<string, string> = {
  match_winner: 'Match Winner',
  total_goals_ou: 'Total Goals Over/Under',
  correct_score: 'Correct Score',
  any_scorer: 'Anytime Scorer',
  cards_ou: 'Cards Over/Under',
  clean_sheet: 'Clean Sheet',
  custom: 'Custom Market',
}

// One-line explainers shown under each market card so users understand pool
// vs fixed without reading the rules page. Kept here so the admin match
// detail page can show the same text.
export const FIFA_MARKET_BLURBS: Record<string, string> = {
  match_winner: 'Pick who advances. Knockout only — no draw outcome.',
  total_goals_ou: 'Over/under the 90-minute goal total. Push = refund.',
  correct_score: 'Exact 90-minute score (e.g. 2-1). Pool: no winner = full refund.',
  any_scorer: 'Wins if your player scores anytime in regulation + extra time.',
  cards_ou: 'Over/under total cards (yellow + red). Push = refund.',
  clean_sheet: 'Team conceded 0 goals in 90 minutes. Pool: no winner = full refund.',
  custom: 'Admin-defined market. See options.',
}

// ─── Market schemas ─────────────────────────────────────────────────

const BaseMarketSchema = z.object({
  match: z.string().min(1),
  market_type: z.enum(FIFA_MARKET_TYPE),
  mode: z.enum(FIFA_MARKET_MODE),
  line: z.number().optional(),
  fixed_odds: z.record(z.string(), z.number().positive()).optional(),
  options: z.array(z.string()).default([]),
  is_open: z.boolean(),
})

export const FifaMarketCreateSchema = BaseMarketSchema
// ─── Settings schema ────────────────────────────────────────────────

const FifaRaffleEntrySchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  rank: z.number().int().min(1),
  tickets: z.number().int().min(1),
  bets_count: z.number().int().min(0),
})

export const FifaRaffleSnapshotSchema = z.object({
  total_tickets: z.number().int().min(0),
  winning_pick: z.number().int().min(0),
  entries: z.array(FifaRaffleEntrySchema),
})

export type FifaRaffleSnapshot = z.infer<typeof FifaRaffleSnapshotSchema>

export const FifaSettingsSchema = z.object({
  event_name: z.string().max(200),
  starting_balance: z.number().int().positive(),
  max_bet_percent: z.number().int().min(1).max(100),
  daily_topup_threshold: z.number().int().min(0),
  daily_topup_target: z.number().int().min(0),
  pool_house_cut_percent: z.number().int().min(0).max(100),
  raffle_tickets_base: z.number().int().positive(),
  raffle_tickets_decay: z.number().int().min(0),
  // Gates raffle entry to actual participants rather than passive accounts.
  raffle_active_participant_min_bets: z.number().int().min(0),
  raffle_drawn_at: z.string().optional(),
  raffle_winner: z.string().optional(),
  raffle_seed: z.string().max(200).optional(),
  raffle_entries_snapshot: FifaRaffleSnapshotSchema.nullish(),
  prize: z.string().max(500),
  registration_open: z.boolean(),
})

export type FifaSettings = z.infer<typeof FifaSettingsSchema>

// ─── Settle schema (admin enters result + triggers settlement) ──────

export const FifaSettleSchema = z.object({
  matchId: z.string().min(1),
  result_winner: z.enum(['home', 'away', 'draw']),
  result_home_goals: z.number().int().min(0),
  result_away_goals: z.number().int().min(0),
  result_scorers: z.array(z.string()).default([]),
  result_yellow_cards: z.number().int().min(0).default(0),
  result_red_cards: z.number().int().min(0).default(0),
  result_home_clean_sheet: z.boolean().default(false),
  result_away_clean_sheet: z.boolean().default(false),
  // For knockout football, record which side advanced when needed.
  result_advance: z.enum(['home', 'away']).optional(),
  result_after_extra_time: z.boolean().default(false),
  result_after_penalties: z.boolean().default(false),
  // For custom markets only: admin marks which option(s) won.
  custom_winners: z.record(z.string(), z.array(z.string())).optional(),
})
