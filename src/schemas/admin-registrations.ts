import { z } from 'zod'
import { REGISTRATION_STATUS, PAYMENT_STATUS } from '@/lib/constants'
export const AdminRegistrationUpdateSchema = z.object({
  checkedIn: z.boolean().optional(),
  registrationStatus: z.enum(REGISTRATION_STATUS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS).optional(),
  amount: z.number().min(0).optional(),
})


export type AdminRegistrationUpdate = z.infer<typeof AdminRegistrationUpdateSchema>
