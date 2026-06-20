import { createPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'

import { handleError } from '@/lib/api-error'
import { toIso } from '@/lib/dates'
import { UPCOMING_WINDOW_DAYS, RECENT_WINDOW_DAYS, MS_PER_DAY } from '@/lib/constants'

export async function GET(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireRole(['admin', 'chair'], pb)
    

    const now = new Date()
    const nowIso = toIso(now)
    const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY))
    const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY))
    const startOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    const endOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

    // PB listRules scope chairs to their own societies/registrations automatically.
    const count = async (col: 'events' | 'registrations' | 'execom' | 'societies', filter?: string) => {
      const r = await pb.collection(col).getList(1, 1, {
        filter: filter || undefined,
        fields: 'id',
      })
      return r.totalItems
    }

    const [
      eventsTotal, eventsPublished, eventsUpcoming, eventsLive, eventsRecentlyCompleted,
      regsTotal, regsConfirmed, regsPending, regsToday,
      execomTotal, societiesTotal, societiesActive,
    ] = await Promise.all([
      count('events'),
      count('events', `status = 'published'`),
      count('events', `date > ${escapeFilterValue(nowIso)} && date <= ${escapeFilterValue(futureIso)} && status = 'published'`),
      count('events', `date <= ${escapeFilterValue(nowIso)} && endDate >= ${escapeFilterValue(nowIso)} && status = 'published'`),
      count('events', `endDate > ${escapeFilterValue(pastIso)} && endDate < ${escapeFilterValue(nowIso)}`),
      count('registrations'),
      count('registrations', `registrationStatus = 'confirmed'`),
      count('registrations', `registrationStatus = 'pending'`),
      count('registrations', `registrationDate >= ${escapeFilterValue(startOfToday)} && registrationDate < ${escapeFilterValue(endOfToday)}`),
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
    return handleError(error, 'admin-stats')
  }
}
