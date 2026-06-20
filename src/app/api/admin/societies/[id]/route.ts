import { NextRequest } from 'next/server'
import { createPB, buildFileUrl } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

import { parseFormData } from '@/lib/request-helpers'
import { z } from 'zod'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    

    
    if (user.role === 'chair') {
      
    }

    const society = await pb.collection('societies').getOne(id)
    return Response.json({
      society: {
        ...society,
        logoUrl: society.logo ? buildFileUrl('societies', society.id as string, society.logo as string) : null,
        bannerUrl: society.banner ? buildFileUrl('societies', society.id as string, society.banner as string) : null,
      },
    })
  } catch (error) {
    return handleError(error, 'admin-societies-get')
  }
}

const SocietyUpdateSchema = z.object({
  name: z.string(),
  slug: z.string(),
  bio: z.string(),
  chairs: z.array(z.string()),
  isHidden: z.boolean(),
  logo: z.any(),
  banner: z.any(),
}).partial()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can edit societies' }, { status: 403 })
    }

    
    const body = await parseFormData(req)
    const parsed = SocietyUpdateSchema.parse(body)

    const society = await pb.collection('societies').update(id, parsed)
    return Response.json({ society })
  } catch (error) {
    return handleError(error, 'admin-societies-update')
  }
}
