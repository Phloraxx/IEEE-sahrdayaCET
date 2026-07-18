import { z } from 'zod'
import { EVENT_STATUS } from '@/lib/constants'

// ─── Coupon Schema ────────────────────────────────────────────
// Previously `z.record(z.string(), z.unknown())` — now properly typed.
// Mirrors the Coupon interface in src/types/index.ts.

export const CouponSchema = z.object({
  code: z.string().min(1),
  discountPercent: z.number().min(0).max(100),
  isActive: z.boolean().default(true),
  maxUses: z.number().int().min(0).default(0),
  usedCount: z.number().int().min(0).default(0),
  expiresAt: z.string().optional(),
})

// ─── Event Schemas ─────────────────────────────────────────────
// Shared base schema — derive create (required) and update (partial) from it.

const BaseEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  date: z.string().min(1),
  endDate: z.string().optional(),
  venue: z.string().optional().default(''),
  price: z.number().min(0).default(0),
  status: z.enum(EVENT_STATUS).default('draft'),
  society: z.string().min(1),
  maxCapacity: z.number().int().positive().optional(),
  registrationOpen: z.boolean().default(false),
  registrationStart: z.string().optional(),
  registrationDeadline: z.string().optional(),
  formTemplate: z.array(z.record(z.string(), z.unknown())).optional(),
  banner: z.any().optional(),
  checkInEnabled: z.boolean().default(false),
  collectIeeeMember: z.boolean().default(false),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  coupons: z.array(CouponSchema).optional(),
  externalLink: z.string().optional(),
  externalFormUrl: z.string().optional(),
  tags: z.string().optional(),
})

export const EventCreateSchema = BaseEventSchema

export const EventUpdateSchema = BaseEventSchema.partial().extend({
  // society must remain a valid string when provided on update
  society: z.string().min(1).optional(),
  whatsappLink: z.string().optional(),
})
