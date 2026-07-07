import { z } from 'zod'

// ─── FIFA WC Predict '26 — zod schemas ──────────────────────────────
// Used by both the admin API routes (server-side validation) and the admin
// UI forms (client-side). Mirrors the schema-on-model pattern in
// src/schemas/events.ts.

export const FIFA_STAGE = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'] as const
export const FIFA_MATCH_STATUS = ['upcoming', 'live', 'finished', 'void'] as const
export const FIFA_MARKET_TYPE = ['match_winner', 'total_goals_ou', 'correct_score', 'any_scorer', 'cards_ou', 'clean_sheet', 'custom'] as const
export const FIFA_MARKET_MODE = ['pool', 'fixed'] as const
export const FIFA_BET_STATUS = ['pending', 'won', 'lost', 'void'] as const
export const FIFA_BET_MODE = ['pool', 'fixed'] as const

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
  correct_score: 'Exact 90-minute score (e.g. 2-1).',
  any_scorer: 'Wins if your player scores anytime in regulation + extra time.',
  cards_ou: 'Over/under total cards (yellow + red). Push = refund.',
  clean_sheet: 'Team conceded 0 goals in 90 minutes.',
  custom: 'Admin-defined market. See options.',
}

// ─── Match schemas ──────────────────────────────────────────────────

const BaseMatchSchema = z.object({
  team_home: z.string().min(1).max(100),
  team_away: z.string().min(1).max(100),
  stage: z.enum(FIFA_STAGE),
  kickoff_at: z.string().min(1),
  betting_locks_at: z.string().optional().default(''),
  status: z.enum(FIFA_MATCH_STATUS).default('upcoming'),
})

export const FifaMatchCreateSchema = BaseMatchSchema
export const FifaMatchUpdateSchema = BaseMatchSchema.partial().extend({
  // Settlement-only fields — only set by the settle route, but the admin
  // "enter result" form uses the update route before triggering settle.
  result_winner: z.enum(['home', 'away', 'draw']).optional(),
  result_home_goals: z.number().int().min(0).optional(),
  result_away_goals: z.number().int().min(0).optional(),
  result_scorers: z.array(z.string()).optional(),
  result_yellow_cards: z.number().int().min(0).optional(),
  result_red_cards: z.number().int().min(0).optional(),
  result_home_clean_sheet: z.boolean().optional(),
  result_away_clean_sheet: z.boolean().optional(),
  // NEW — knockout football (FIFA-GAME.md §2.1):
  result_advance: z.enum(['home', 'away']).optional(),
  result_after_extra_time: z.boolean().optional(),
  result_after_penalties: z.boolean().optional(),
  settled: z.boolean().optional(),
})

// ─── Market schemas ─────────────────────────────────────────────────

const BaseMarketSchema = z.object({
  match: z.string().min(1),
  market_type: z.enum(FIFA_MARKET_TYPE),
  mode: z.enum(FIFA_MARKET_MODE),
  line: z.number().optional(),
  fixed_odds: z.record(z.string(), z.number()).optional(),
  options: z.array(z.string()).default([]),
  is_open: z.boolean().default(true),
})

export const FifaMarketCreateSchema = BaseMarketSchema
export const FifaMarketUpdateSchema = BaseMarketSchema.partial()

// ─── Bet schema (client-submitted) ──────────────────────────────────
// The hook enforces the real rules; this just shapes the request body.

export const FifaBetCreateSchema = z.object({
  market: z.string().min(1),
  match: z.string().min(1),
  selection: z.string().min(1),
  stake: z.number().int().positive(),
})

// ─── Settings schema ────────────────────────────────────────────────

export const FifaSettingsSchema = z.object({
  event_name: z.string().max(200).default("IEEE Sahrdaya WC Predict '26"),
  starting_balance: z.number().int().positive().default(1000),
  max_bet_percent: z.number().int().min(1).max(100).default(25),
  daily_topup_threshold: z.number().int().min(0).default(100),
  daily_topup_target: z.number().int().min(0).default(200),
  pool_house_cut_percent: z.number().int().min(0).max(100).default(0),
  raffle_tickets_base: z.number().int().positive().default(50),
  raffle_tickets_decay: z.number().int().min(0).default(2),
  // Raised from 1 → 5 (FIFA-GAME.md §2.4). Gates raffle entry to actual
  // participants so a non-bettor at 1000 pts can't free-ride the draw.
  raffle_active_participant_min_bets: z.number().int().min(0).default(5),
  // NEW (FIFA-GAME.md §2.3). Auto-void matches whose kickoff was more than
  // this many hours ago and are still upcoming/live, or finished-but-unsettled
  // past 48h. Cron runs every 30 min.
  auto_void_hours: z.number().int().min(1).default(6),
  prize: z.string().max(500).default(''),
  registration_open: z.boolean().default(true),
})

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
  // NEW — knockout football (FIFA-GAME.md §2.1). The admin picks who advanced
  // when the 90-min result is a draw. The TanStack settle route auto-fills
  // this from result_winner when it's not a draw, so the admin only sees the
  // field for actual knockouts that went to ET/pens.
  result_advance: z.enum(['home', 'away']).optional(),
  result_after_extra_time: z.boolean().default(false),
  result_after_penalties: z.boolean().default(false),
  // For custom markets only: admin marks which option(s) won.
  custom_winners: z.record(z.string(), z.array(z.string())).optional(),
})
