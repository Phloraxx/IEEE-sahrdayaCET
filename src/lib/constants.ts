export const APP_URL = process.env.PUBLIC_APP_URL || 'https://ieeesahrdaya.com'
export const PB_AUTH_COOKIE = 'pb_auth'
export const PB_OAUTH_PROVIDER_COOKIE = 'pb_oauth_provider'
export const OAUTH_CALLBACK_PATH = '/api/auth/callback/google'

/** PocketBase filter that matches no records. Used as a safe "no access" sentinel. */
export const EMPTY_FILTER = 'id = ""'

export const TICKET_PREFIX = 'TKT-'

/** Status enums — single source of truth, shared between routes, hooks, and types. */
export const REGISTRATION_STATUS = ['pending', 'confirmed', 'cancelled'] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUS)[number]

export const PAYMENT_STATUS = ['pending', 'paid', 'failed', 'not_required'] as const
export type PaymentStatus = (typeof PAYMENT_STATUS)[number]

export const EVENT_STATUS = ['draft', 'published', 'completed', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUS)[number]

export const USER_ROLES = ['admin', 'chair', 'user'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** Default pagination limits per resource. */
export const MAX_PER_PAGE = {
  events: 100,
  societies: 200,
  users: 100,
  registrations: 100,
  execom: 200,
} as const

/** Dashboard time windows (in ms). */
export const UPCOMING_WINDOW_DAYS = 30
export const RECENT_WINDOW_DAYS = 7
export const MS_PER_DAY = 24 * 60 * 60 * 1000

// ─── FIFA WC Predict '26 ───────────────────────────────────────────
// Public proxy path for client-side PB SSE subscriptions. Caddy rewrites
// /pb/* -> PB :8090; Vite dev proxy does the same. POCKETBASE_URL itself
// stays server-side (see .env.example).
export const PB_PUBLIC_URL = '/pb'

/** Rate limits (per-user, in-memory sliding window via lib/rate-limit.ts). */
export const FIFA_RATE_LIMITS = {
  bet: { max: 30, windowMs: 60_000 },
  raffle: { max: 5, windowMs: 60_000 },
} as const
