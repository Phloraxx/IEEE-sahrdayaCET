import { createPB } from '@/lib/pb'
import { requireAdmin } from '@/lib/auth'
import { iso } from '@/lib/dates'
import { logError } from '@/lib/logger'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  await requireAdmin()

  const now = new Date()
  const nowIso = iso(now)
  const futureIso = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const pastIso = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  try {
    const count = async (col: string, filter?: string) => {
      const r = await (filter
        ? pb.collection(col).getList(1, 1, { filter, fields: 'id' })
        : pb.collection(col).getList(1, 1, { fields: 'id' }))
      return r.totalItems
    }

    const [
      eventsTotal, eventsPublished, eventsUpcoming, eventsLive, eventsRecentlyCompleted,
      regsTotal, regsConfirmed, regsPending, regsToday,
      execomTotal, societiesTotal, societiesActive,
    ] = await Promise.all([
      count('events'),
      count('events', `status = 'published'`),
      count('events', `date > '${nowIso}' && date <= '${futureIso}' && status = 'published'`),
      count('events', `date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`),
      count('events', `endDate > '${pastIso}' && endDate < '${nowIso}'`),
      count('registrations'),
      count('registrations', `registrationStatus = 'confirmed'`),
      count('registrations', `registrationStatus = 'pending'`),
      count('registrations', `registrationDate >= '${startOfToday}' && registrationDate < '${endOfToday}'`),
      count('execom'),
      count('societies'),
      count('societies', `isHidden != true`),
    ])

    return Response.json({
      events: { total: eventsTotal, published: eventsPublished, upcoming: eventsUpcoming, live: eventsLive, recentlyCompleted: eventsRecentlyCompleted },
      registrations: { total: regsTotal, confirmed: regsConfirmed, pending: regsPending, today: regsToday },
      execom: { total: execomTotal },
      societies: { total: societiesTotal, active: societiesActive },
    })
  } catch (error) {
    logError('admin-stats', error)
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
