import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { iso } from '@/lib/dates'
import { logError } from '@/lib/logger'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireRole(['admin', 'chair'], pb)
  const adminPB = createAdminPB()

  const now = new Date()
  const nowIso = iso(now)
  const futureIso = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const pastIso = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  // Build scope filter for chairs
  let eventScopeFilter = ''
  let societyIds: string[] = []
  if (user.role === 'chair') {
    societyIds = await getChairSocietyIds(adminPB, user.id)
    if (societyIds.length > 0) {
      eventScopeFilter = societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
    } else {
      eventScopeFilter = 'id = ""'
    }
  }

  // For chair-scoped registration counts, find the chair's event IDs
  let regScopeFilter = ''
  if (user.role === 'chair' && societyIds.length > 0) {
    const chairEvents = await adminPB.collection('events').getFullList({
      filter: societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || '),
      fields: 'id',
    })
    const chairEventIds = (chairEvents || []).map((e: Record<string, unknown>) => e.id as string)
    if (chairEventIds.length > 0) {
      regScopeFilter = chairEventIds.map((id) => `event = ${escapeFilterValue(id)}`).join(' || ')
    } else {
      regScopeFilter = 'id = ""'
    }
  }

  try {
    const count = async (col: string, filter?: string) => {
      const extra = col === 'registrations' && regScopeFilter && (!filter || !filter.includes('event ='))
        ? (filter ? `(${filter} && (${regScopeFilter}))` : regScopeFilter)
        : (col === 'events' && eventScopeFilter && (!filter || !filter.includes('society =')))
          ? (filter ? `(${filter} && (${eventScopeFilter}))` : eventScopeFilter)
          : filter
      const r = await (extra
        ? adminPB.collection(col).getList(1, 1, { filter: extra, fields: 'id' })
        : adminPB.collection(col).getList(1, 1, { fields: 'id' }))
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
