import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'
import { softDeleteEvent } from '@/lib/registration-service'

async function assertChairCanAccessEvent(adminPB: ReturnType<typeof createAdminPB>, userId: string, eventId: string) {
  const event = await adminPB.collection('events').getOne(eventId, { fields: 'id,society' }).catch(() => null)
  if (!event) return { allowed: false, error: Response.json({ error: 'Event not found' }, { status: 404 }) }

  const societyIds = await getChairSocietyIds(adminPB, userId)
  const eventSociety = (event as Record<string, unknown>).society as string
  if (!societyIds.includes(eventSociety)) {
    return { allowed: false, error: Response.json({ error: 'Forbidden: not a chair of this event\'s society' }, { status: 403 }) }
  }
  return { allowed: true }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    if (user.role === 'chair') {
      const access = await assertChairCanAccessEvent(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    const event = await adminPB.collection('events').getOne(id, { expand: 'society' })
    return Response.json({ event })
  } catch (error) {
    return handleError(error, 'admin-events-get')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const contentType = req.headers.get('content-type') || ''
    const body = contentType.includes('multipart/form-data') ? await req.formData() : await req.json()
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    if (user.role === 'chair') {
      const access = await assertChairCanAccessEvent(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    const event = await adminPB.collection('events').update(id, body)
    return Response.json({ event })
  } catch (error) {
    return handleError(error, 'admin-events-update')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    if (user.role === 'chair') {
      const access = await assertChairCanAccessEvent(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    await softDeleteEvent(adminPB, id)
    return Response.json({ success: true })
  } catch (error) {
    return handleError(error, 'admin-events-delete')
  }
}
