export const APP_URL = 'https://ieeesahrdaya.com'

/** PocketBase filter that matches no records. Used as a safe "no access" sentinel. */
export const EMPTY_FILTER = 'id = ""'

export const EVENT_STATUS = ['draft', 'published', 'completed', 'cancelled'] as const

export const USER_ROLES = ['admin', 'chair', 'user', 'content'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** Dashboard time windows (in days/ms). */
export const UPCOMING_WINDOW_DAYS = 30
export const RECENT_WINDOW_DAYS = 7
export const MS_PER_DAY = 24 * 60 * 60 * 1000
