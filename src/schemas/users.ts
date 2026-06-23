import { z } from 'zod'

export const UserUpdateSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['admin', 'chair', 'user']).optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
})