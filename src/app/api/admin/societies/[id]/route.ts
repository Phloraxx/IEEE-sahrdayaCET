import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'

async function assertChairCanAccessSociety(req: NextRequest, societyId: string) {
  const userPB = createPB(req.headers.get('cookie') || undefined)
  try {
    await userPB.collection('users').authRefresh()
  } catch {
    return { allowed: false, error: Response.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  const userRecord = userPB.authStore.record as { id: string; role: string } | null
  if (!userRecord || userRecord.role !== 'chair') return { allowed: true }

  const adminPB = createAdminPB()
  const societyIds = await getChairSocietyIds(adminPB, userRecord.id)
  if (!societyIds.includes(societyId)) {
    return { allowed: false, error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { allowed: true }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const access = await assertChairCanAccessSociety(req, id)
  if (!access.allowed) return access.error

  try {
    const pb = createAdminPB()
    const society = await pb.collection('societies').getOne(id)
    return Response.json({ society })
  } catch (error) {
    return handleError(error, 'admin-societies-get')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Only admins can edit societies
  const userPB = createPB(req.headers.get('cookie') || undefined)
  try {
    await userPB.collection('users').authRefresh()
  } catch {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  const userRecord = userPB.authStore.record as { role: string } | null
  if (!userRecord || userRecord.role !== 'admin') {
    return Response.json({ error: 'Only admins can edit societies' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const pb = createAdminPB()
    const society = await pb.collection('societies').update(id, body)
    return Response.json({ society })
  } catch (error) {
    return handleError(error, 'admin-societies-update')
  }
}
