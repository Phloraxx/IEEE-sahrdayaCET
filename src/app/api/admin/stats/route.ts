import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { getChairScope } from '@/lib/chair-scope'
import { handleError } from '@/lib/api-error'
import { toIso } from '@/lib/dates'
import { buildFilter } from '@/lib/route-helpers'
import { UPCOMING_WINDOW_DAYS, RECENT_WINDOW_DAYS, MS_PER_DAY, EMPTY_FILTER } from '@/lib/constants'

export async function GET(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    const now = new Date()
    const nowIso = toIso(now)
    const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY))
    const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY))
    const startOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    const endOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

    // Single scope resolution — reuse for both events and registrations filters
    const scope = await getChairScope(adminPB, user.id, user.role)

    const eventsScopeFilter = user.role === 'chair' ? scope.societyFilter : ''
    // For registrations, use event.society join filter (avoids pre-fetching event IDs)
    const regsScopeFilter = user.role === 'chair' ? scope.eventFilter : ''

    const count = async (col: 'events' | 'registrations' | 'execom' | 'societies', filter?: string) => {
      const baseScope = col === 'registrations' ? regsScopeFilter : eventsScopeFilter
      // buildFilter handles parenthesization and empty-part dropping safely,
      // replacing the previous brittle string-prefix detection.
      const effective = buildFilter([baseScope, filter])
      const r = await adminPB.collection(col).getList(1, 1, {
        filter: effective || undefined,
        fields: 'id',
      })
      return r.totalItems
    }

    // If chair has no societies, short-circuit with zeros
    if (user.role === 'chair' && eventsScopeFilter === EMPTY_FILTER) {
      return Response.json({
        events: { total: 0, published: 0, upcoming: 0, live: 0, recentlyCompleted: 0 },
        registrations: { total: 0, confirmed: 0, pending: 0, today: 0 },
        execom: { total: 0 },
        societies: { total: 0, active: 0 },
      })
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
