import { z } from 'zod'

export const SocietyCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().optional(),
  chairs: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  logo: z.any().optional(),
  banner: z.any().optional(),
  defaultWhatsappLink: z.string().optional(),
})