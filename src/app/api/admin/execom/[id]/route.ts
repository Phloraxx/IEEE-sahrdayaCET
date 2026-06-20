import { NextRequest } from 'next/server'
import { createPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { parseFormData } from '@/lib/request-helpers'
import { z } from 'zod'

const ExecomUpdateSchema = z.object({
  name: z.string(),
  position: z.string(),
  department: z.string(),
  batch: z.string(),
  section: z.string(),
  sectionId: z.string(),
  order: z.number(),
  photo: z.any(),
  linkedin: z.string(),
  instagram: z.string(),
  email: z.string(),
  phone: z.string(),
  society: z.string(),
}).partial()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireRole(['admin', 'chair'], pb)

    
    const member = await pb.collection('execom').getOne(id, { expand: 'society' })
    return Response.json({ member })
  } catch (error) {
    return handleError(error, 'admin-execom-get')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can manage execom' }, { status: 403 })
    }

    
    const body = await parseFormData(req)
    const parsed = ExecomUpdateSchema.parse(body)

    const member = await pb.collection('execom').update(id, parsed)
    return Response.json({ member })
  } catch (error) {
    return handleError(error, 'admin-execom-update')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can manage execom' }, { status: 403 })
    }

    
    await pb.collection('execom').delete(id)
    return Response.json({ success: true })
  } catch (error) {
    return handleError(error, 'admin-execom-delete')
  }
}
