import { NextRequest } from 'next/server'
import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '100'), 200)
  const search = url.searchParams.get('search')

  let filter = ''
  if (search) {
    filter = `name ~ ${escapeFilterValue(search)}`
  }

  // Scope to chair's own societies
  const userPB = createPB(req.headers.get('cookie') || undefined)
  try {
    await userPB.collection('users').authRefresh()
  } catch {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  const userRecord = userPB.authStore.record as { id: string; role: string } | null

  try {
    const adminPB = createAdminPB()

    let effectiveFilter = filter || ''
    if (userRecord && userRecord.role === 'chair') {
      const societyIds = await getChairSocietyIds(adminPB, userRecord.id)
      if (societyIds.length === 0) {
        return Response.json({ societies: [], total: 0, page: 1, perPage })
      }
      const scopeFilter = societyIds.map((id) => `id = '${id}'`).join(' || ')
      effectiveFilter = effectiveFilter ? `(${effectiveFilter} && (${scopeFilter}))` : scopeFilter
    }

    const result = await adminPB.collection('societies').getList(page, perPage, {
      filter: effectiveFilter || undefined,
      sort: 'name',
    })

    // Fetch event counts per society
    let eventCounts: Record<string, number> = {}
    try {
      const events = await adminPB.collection('events').getFullList({
        fields: 'id,society',
      })
      for (const e of (events || []) as Record<string, unknown>[]) {
        const sid = e.society as string
        if (sid) eventCounts[sid] = (eventCounts[sid] || 0) + 1
      }
    } catch { /* non-fatal */ }

    const societies = result.items.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      bio: s.bio,
      isHidden: !!s.isHidden,
      chairs: (s.chairs as string[]) || [],
      eventsCount: eventCounts[s.id as string] || 0,
    }))

    return Response.json({ societies, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    return handleError(error, 'admin-societies-list')
  }
}

export async function POST(req: NextRequest) {
  // Only admins can create societies
  const userPB = createPB(req.headers.get('cookie') || undefined)
  try {
    await userPB.collection('users').authRefresh()
  } catch {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  const userRecord = userPB.authStore.record as { role: string } | null
  if (!userRecord || userRecord.role !== 'admin') {
    return Response.json({ error: 'Only admins can create societies' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const pb = createAdminPB()
    const society = await pb.collection('societies').create(body)
    return Response.json({ society }, { status: 201 })
  } catch (error) {
    return handleError(error, 'admin-societies-create')
  }
}
