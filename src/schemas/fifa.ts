import { z } from 'zod'

// ─── FIFA WC Predict '26 — zod schemas ──────────────────────────────
// Used by both the admin API routes (server-side validation) and the admin
// UI forms (client-side). Mirrors the schema-on-model pattern in
// src/schemas/events.ts.

export const FIFA_STAGE = ['qf', 'sf', 'third_place', 'final'] as const
export const FIFA_MATCH_STATUS = ['upcoming', 'live', 'finished', 'void'] as const
export const FIFA_MARKET_TYPE = ['match_winner', 'total_goals_ou', 'correct_score', 'first_scorer', 'cards_ou', 'clean_sheet', 'custom'] as const
export const FIFA_MARKET_MODE = ['pool', 'fixed'] as const
export const FIFA_BET_STATUS = ['pending', 'won', 'lost', 'void'] as const
export const FIFA_BET_MODE = ['pool', 'fixed'] as const

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
  raffle_active_participant_min_bets: z.number().int().min(0).default(1),
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
  // For custom markets only: admin marks which option(s) won.
  custom_winners: z.record(z.string(), z.array(z.string())).optional(),
})
