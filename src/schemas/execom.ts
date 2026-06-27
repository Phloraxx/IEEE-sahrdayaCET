import { z } from 'zod'

export const ExecomCreateSchema = z.object({
  name: z.string().min(1),
  position: z.string().min(1),
  department: z.string().optional(),
  batch: z.string().optional(),
  section: z.string().optional(),
  sectionId: z.string().optional(),
  order: z.number().optional(),
  photo: z.any().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
  email: z.string().optional(),
  phone: z.union([z.string(), z.number()]).transform(String).optional(),
  society: z.string().optional(),
  category: z.string().optional(),
})

export const ExecomUpdateSchema = ExecomCreateSchema.partial()
export type ExecomUpdate = z.infer<typeof ExecomUpdateSchema>