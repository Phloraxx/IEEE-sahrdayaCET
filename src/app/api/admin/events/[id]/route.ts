import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'

async function assertChairCanAccessEvent(req: NextRequest, eventId: string) {
  const userPB = createPB(req.headers.get('cookie') || undefined)
  try {
    await userPB.collection('users').authRefresh()
  } catch {
    return { allowed: false, error: Response.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  const userRecord = userPB.authStore.record as { id: string; role: string } | null
  if (!userRecord || userRecord.role !== 'chair') return { allowed: true }

  const adminPB = createAdminPB()
  const event = await adminPB.collection('events').getOne(eventId, { fields: 'id,society' }).catch(() => null)
  if (!event) return { allowed: false, error: Response.json({ error: 'Event not found' }, { status: 404 }) }

  const societyIds = await getChairSocietyIds(adminPB, userRecord.id)
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

  const access = await assertChairCanAccessEvent(req, id)
  if (!access.allowed) return access.error

  try {
    const pb = createAdminPB()
    const event = await pb.collection('events').getOne(id, { expand: 'society' })
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

  const access = await assertChairCanAccessEvent(req, id)
  if (!access.allowed) return access.error

  try {
    const body = await req.json()
    const pb = createAdminPB()
    const event = await pb.collection('events').update(id, body)
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

  const access = await assertChairCanAccessEvent(req, id)
  if (!access.allowed) return access.error

  try {
    const pb = createAdminPB()
    await pb.collection('events').update(id, { isDeleted: true })
    return Response.json({ success: true })
  } catch (error) {
    return handleError(error, 'admin-events-delete')
  }
}
