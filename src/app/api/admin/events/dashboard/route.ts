import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { getChairScope } from '@/lib/chair-scope'
import { handleError } from '@/lib/api-error'
import { toIso } from '@/lib/dates'
import { UPCOMING_WINDOW_DAYS, RECENT_WINDOW_DAYS, MS_PER_DAY } from '@/lib/constants'

export async function GET(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    const now = new Date()
    const nowIso = toIso(now)
    const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY))
    const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY))

    const scope = await getChairScope(adminPB, user.id, user.role)
    const scopeFilter = user.role === 'chair' ? scope.societyFilter : ''

    const withScope = (base: string) => (scopeFilter ? `(${base}) && (${scopeFilter})` : base)

    const [live, upcoming, recentlyCompleted] = await Promise.all([
      adminPB.collection('events').getList(1, 5, {
        filter: withScope(`date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`),
        sort: 'date',
      }),
      adminPB.collection('events').getList(1, 6, {
        filter: withScope(`date > '${nowIso}' && date <= '${futureIso}' && status = 'published'`),
        sort: 'date',
      }),
      adminPB.collection('events').getList(1, 5, {
        filter: withScope(`endDate > '${pastIso}' && endDate < '${nowIso}'`),
        sort: '-endDate',
      }),
    ])

    const project = (e: unknown) => {
      const r = e as Record<string, unknown>
      const society = r.society as Record<string, unknown> | string | null
      const societyName =
        typeof society === 'object' && society !== null
          ? (society.name as string) || ''
          : ''
      return {
        id: r.id as string,
        title: r.title,
        date: r.date,
        endDate: r.endDate,
        venue: r.venue,
        status: r.status,
        maxCapacity: r.maxCapacity,
        registeredCount: r.registeredCount,
        checkedInCount: r.checkedInCount,
        bannerUrl: r.bannerUrl,
        societyName,
      }
    }

    return Response.json({
      live: live.items.map(project),
      upcoming: upcoming.items.map(project),
      recentlyCompleted: recentlyCompleted.items.map(project),
    })
  } catch (error) {
    return handleError(error, 'admin-dashboard')
  }
}
