import { NextRequest } from 'next/server'
import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { getChairScope } from '@/lib/chair-scope'
import { parseFormData } from '@/lib/request-helpers'
import { parsePagination, buildFilter } from '@/lib/route-helpers'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()
    const url = new URL(req.url)

    const { page, perPage } = parsePagination(url, { defaultPerPage: 100, maxPerPage: 200 })
    const search = url.searchParams.get('search')

    const searchFilter = search ? `name ~ ${escapeFilterValue(search)}` : ''

    // Build the societies list filter: chair scope restricts to their own societies.
    let scopeFilter = ''
    if (user.role === 'chair') {
      const scope = await getChairScope(adminPB, user.id, user.role)
      if (!scope.hasScope) {
        return Response.json({ societies: [], total: 0, page: 1, perPage })
      }
      scopeFilter = scope.societyIds.map((id) => `id = ${escapeFilterValue(id)}`).join(' || ')
    }

    const filter = buildFilter([searchFilter, scopeFilter])

    const result = await adminPB.collection('societies').getList(page, perPage, {
      filter: filter || undefined,
      sort: 'name',
    })

    // Batch-count events for all societies on this page in one request
    // (replaces the previous N+1 of one getList per society).
    const societyIds = result.items.map((s) => s.id)
    const eventsCountBySociety = new Map<string, number>()
    if (societyIds.length > 0) {
      const eventsFilter = societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
      try {
        const events = await adminPB.collection('events').getFullList<{ society: string }>({
          filter: eventsFilter,
          fields: 'society',
        })
        for (const e of events) {
          const sid = e.society as string
          eventsCountBySociety.set(sid, (eventsCountBySociety.get(sid) || 0) + 1)
        }
      } catch {
        // Counts are best-effort — leave the map empty (defaults to 0 below).
      }
    }

    const societies = result.items.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      bio: s.bio,
      isHidden: !!s.isHidden,
      chairs: (s.chairs as string[]) || [],
      eventsCount: eventsCountBySociety.get(s.id as string) || 0,
    }))

    return Response.json({ societies, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    return handleError(error, 'admin-societies-list')
  }
}

const SocietyCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().optional(),
  chairs: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  logo: z.any().optional(),
  banner: z.any().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can create societies' }, { status: 403 })
    }

    const adminPB = createAdminPB()
    const body = await parseFormData(req)
    const parsed = SocietyCreateSchema.parse(body)

    const society = await adminPB.collection('societies').create(parsed)
    return Response.json({ society }, { status: 201 })
  } catch (error) {
    return handleError(error, 'admin-societies-create')
  }
}
