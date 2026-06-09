import { createPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { iso } from '@/lib/dates'
import { logError } from '@/lib/logger'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  await requireRole('admin', 'chair')

  const now = new Date()
  const nowIso = iso(now)
  const futureIso = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const pastIso = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))

  try {
    const [live, upcoming, recentlyCompleted] = await Promise.all([
      pb.collection('events').getList(1, 5, {
        filter: `date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`,
        sort: 'date',
      }),
      pb.collection('events').getList(1, 6, {
        filter: `date > '${nowIso}' && date <= '${futureIso}' && status = 'published'`,
        sort: 'date',
      }),
      pb.collection('events').getList(1, 5, {
        filter: `endDate > '${pastIso}' && endDate < '${nowIso}'`,
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
