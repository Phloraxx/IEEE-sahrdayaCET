import { z } from 'zod'

export const RegistrationBodySchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  formResponses: z.record(z.string(), z.unknown()).default({}),
  couponCode: z.string().optional(),
})