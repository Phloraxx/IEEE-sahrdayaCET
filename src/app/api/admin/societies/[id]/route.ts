import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'

async function assertChairCanAccessSociety(adminPB: ReturnType<typeof createAdminPB>, userId: string, societyId: string) {
  const societyIds = await getChairSocietyIds(adminPB, userId)
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

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    if (user.role === 'chair') {
      const access = await assertChairCanAccessSociety(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    const society = await adminPB.collection('societies').getOne(id)
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

  try {
    const body = await req.json()
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    // Only admins can edit societies
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can edit societies' }, { status: 403 })
    }

    const adminPB = createAdminPB()
    const society = await adminPB.collection('societies').update(id, body)
    return Response.json({ society })
  } catch (error) {
    return handleError(error, 'admin-societies-update')
  }
}
