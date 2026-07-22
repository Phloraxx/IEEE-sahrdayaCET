import { z } from 'zod'

export const SocietyCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  bio: z.string().optional(),
  chairs: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  logo: z.any().optional(),
  banner: z.any().optional(),
  defaultWhatsappLink: z.string().trim().refine((value) => value === '' || /^https?:\/\//i.test(value), 'URL must start with http:// or https://').optional(),
})