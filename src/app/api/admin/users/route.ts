import { NextRequest } from 'next/server'
import { createPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { parsePagination } from '@/lib/route-helpers'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireRole(['admin', 'chair'], pb)
    
    const url = new URL(req.url)

    const { page, perPage } = parsePagination(url, { defaultPerPage: 200, maxPerPage: 500 })
    const search = url.searchParams.get('search')

    const filter = search
      ? `name ~ ${escapeFilterValue(search)} || email ~ ${escapeFilterValue(search)}`
      : ''

    const result = await pb.collection('users').getList(page, perPage, {
      filter: filter || undefined,
      sort: 'name',
      fields: 'id,name,email,role,avatar,created',
    })

    // Batch-count registrations for all users on this page in one request
    // (replaces the previous N+1 of one getList per user).
    const userIds = result.items.map((u) => u.id)
    const regsCountByUser = new Map<string, number>()
    if (userIds.length > 0) {
      const regsFilter = userIds.map((id) => `user = ${escapeFilterValue(id)}`).join(' || ')
      try {
        const regs = await pb.collection('registrations').getFullList<{ user: string }>({
          filter: regsFilter,
          fields: 'user',
        })
        for (const r of regs) {
          const uid = r.user as string
          regsCountByUser.set(uid, (regsCountByUser.get(uid) || 0) + 1)
        }
      } catch {
        // Counts are best-effort — leave the map empty (defaults to 0 below).
      }
    }

    const users = result.items.map((u: Record<string, unknown>) => ({
      id: u.id,
      name: (u.name as string) || '',
      email: (u.email as string) || '',
      role: (u.role as string) || 'user',
      avatar: (u.avatar as string) || '',
      created: (u.created as string) || '',
      registrationsCount: regsCountByUser.get(u.id as string) || 0,
    }))

    return Response.json({ users, total: result.totalItems })
  } catch (error) {
    return handleError(error, 'admin-users-list')
  }
}

const UserUpdateSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['admin', 'chair', 'user']).optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
})

export async function PUT(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can change roles' }, { status: 403 })
    }

    
    const body = await req.json()
    const parsed = UserUpdateSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (parsed.role !== undefined) updateData.role = parsed.role
    if (parsed.name !== undefined) updateData.name = parsed.name
    if (parsed.email !== undefined) updateData.email = parsed.email

    const updated = await pb.collection('users').update(parsed.id, updateData)
    return Response.json({ user: updated })
  } catch (error) {
    return handleError(error, 'admin-users-update')
  }
}
