import { NextRequest } from 'next/server'
import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '200'), 500)
  const search = url.searchParams.get('search')

  let filter = ''
  if (search) {
    filter = `name ~ ${escapeFilterValue(search)} || email ~ ${escapeFilterValue(search)}`
  }

  try {
    const pb = createAdminPB()
    const result = await pb.collection('users').getList(page, perPage, {
      filter: filter || undefined,
      sort: 'name',
      fields: 'id,name,email,role,created',
    })

    // Fetch registration counts per user
    let registrationCounts: Record<string, number> = {}
    try {
      const regs = await pb.collection('registrations').getFullList({
        fields: 'user',
      })
      for (const r of (regs || []) as Record<string, unknown>[]) {
        const uid = r.user as string
        if (uid) registrationCounts[uid] = (registrationCounts[uid] || 0) + 1
      }
    } catch { /* non-fatal */ }

    const users = result.items.map((u: Record<string, unknown>) => ({
      id: u.id,
      name: (u.name as string) || '',
      email: (u.email as string) || '',
      role: (u.role as string) || 'user',
      created: (u.created as string) || '',
      registrationsCount: registrationCounts[u.id as string] || 0,
    }))

    return Response.json({ users, total: result.totalItems })
  } catch (error) {
    return handleError(error, 'admin-users-list')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    // Only admins can change roles
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can change roles' }, { status: 403 })
    }

    const adminPB = createAdminPB()
    const updated = await adminPB.collection('users').update(body.id, { role: body.role })
    return Response.json({ user: updated })
  } catch (error) {
    return handleError(error, 'admin-users-update')
  }
}
