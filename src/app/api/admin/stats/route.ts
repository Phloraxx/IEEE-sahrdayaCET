import { getPayload } from 'payload'
import config from '@payload-config'
import { requireAuth, AuthError } from '@/lib/auth'

const iso = (d: Date) => d.toISOString()

export async function GET() {
  try {
    await requireAuth()
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status })
    }
    return Response.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const now = new Date()
  const nowIso = iso(now)
  const futureIso = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const pastIso = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  try {
    const [
      eventsTotal,
      eventsPublished,
      eventsUpcoming,
      eventsLive,
      eventsRecentlyCompleted,
      regsTotal,
      regsConfirmed,
      regsPending,
      regsToday,
      execomTotal,
      societiesTotal,
      societiesActive,
    ] = await Promise.all([
      payload.count({ collection: 'events', where: { isDeleted: { not_equals: true } } }),
      payload.count({
        collection: 'events',
        where: { status: { equals: 'published' }, isDeleted: { not_equals: true } },
      }),
      payload.count({
        collection: 'events',
        where: {
          date: { greater_than: nowIso, less_than_equal: futureIso },
          status: { equals: 'published' },
          isDeleted: { not_equals: true },
        },
      }),
      payload.count({
        collection: 'events',
        where: {
          and: [
            { date: { less_than_equal: nowIso } },
            { endDate: { greater_than_equal: nowIso } },
            { status: { equals: 'published' } },
            { isDeleted: { not_equals: true } },
          ],
        },
      }),
      payload.count({
        collection: 'events',
        where: {
          endDate: { greater_than: pastIso, less_than: nowIso },
          isDeleted: { not_equals: true },
        },
      }),
      payload.count({ collection: 'registrations' }),
      payload.count({
        collection: 'registrations',
        where: { registrationStatus: { equals: 'confirmed' } },
      }),
      payload.count({
        collection: 'registrations',
        where: { registrationStatus: { equals: 'pending' } },
      }),
      payload.count({
        collection: 'registrations',
        where: {
          registrationDate: { greater_than_equal: startOfToday, less_than: endOfToday },
        },
      }),
      payload.count({ collection: 'execom' }),
      payload.count({ collection: 'societies' }),
      payload.count({
        collection: 'societies',
        where: { isHidden: { not_equals: true } },
      }),
    ])

    return Response.json({
      events: {
        total: eventsTotal.totalDocs,
        published: eventsPublished.totalDocs,
        upcoming: eventsUpcoming.totalDocs,
        live: eventsLive.totalDocs,
        recentlyCompleted: eventsRecentlyCompleted.totalDocs,
      },
      registrations: {
        total: regsTotal.totalDocs,
        confirmed: regsConfirmed.totalDocs,
        pending: regsPending.totalDocs,
        today: regsToday.totalDocs,
      },
      execom: { total: execomTotal.totalDocs },
      societies: { total: societiesTotal.totalDocs, active: societiesActive.totalDocs },
    })
  } catch (error) {
    payload.logger.error(`Admin stats error: ${error}`)
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
