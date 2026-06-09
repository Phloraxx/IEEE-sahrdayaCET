import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { iso } from '@/lib/dates'
import { logError } from '@/lib/logger'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireRole(['admin', 'chair'], pb)

  const now = new Date()
  const nowIso = iso(now)
  const futureIso = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const pastIso = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))

  try {
    const adminPB = createAdminPB()

    // Build society scope filter for chairs
    let scopeFilter = ''
    if (user.role === 'chair') {
      const societyIds = await getChairSocietyIds(adminPB, user.id)
      if (societyIds.length > 0) {
        scopeFilter = `(${societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')})`
      } else {
        scopeFilter = 'id = ""' // no access
      }
    }

    const liveFilter = [`date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`]
    const upcomingFilter = [`date > '${nowIso}' && date <= '${futureIso}' && status = 'published'`]
    const recentFilter = [`endDate > '${pastIso}' && endDate < '${nowIso}'`]

    if (scopeFilter) {
      liveFilter.push(scopeFilter)
      upcomingFilter.push(scopeFilter)
      recentFilter.push(scopeFilter)
    }

    const [live, upcoming, recentlyCompleted] = await Promise.all([
      adminPB.collection('events').getList(1, 5, {
        filter: liveFilter.join(' && '),
        sort: 'date',
      }),
      adminPB.collection('events').getList(1, 6, {
        filter: upcomingFilter.join(' && '),
        sort: 'date',
      }),
      adminPB.collection('events').getList(1, 5, {
        filter: recentFilter.join(' && '),
        sort: '-endDate',
      }),
    ])

    const project = (e: Record<string, unknown>) => {
      const society = e.society as Record<string, unknown> | string | null
      const societyName =
        typeof society === 'object' && society !== null
          ? (society.name as string) || ''
          : ''
      return {
        id: e.id as string,
        title: e.title,
        date: e.date,
        endDate: e.endDate,
        venue: e.venue,
        status: e.status,
        maxCapacity: e.maxCapacity,
        registeredCount: e.registeredCount,
        checkedInCount: e.checkedInCount,
        bannerUrl: e.bannerUrl,
        societyName,
      }
    }

    return Response.json({
      live: live.items.map(project),
      upcoming: upcoming.items.map(project),
      recentlyCompleted: recentlyCompleted.items.map(project),
    })
  } catch (error) {
    logError('admin-dashboard', error)
    return Response.json(
      { error: 'Failed to fetch dashboard events', live: [], upcoming: [], recentlyCompleted: [] },
      { status: 500 },
    )
  }
}
