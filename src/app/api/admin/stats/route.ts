import { createPB } from '@/lib/pb'
import { requireAdmin } from '@/lib/auth'
import { iso } from '@/lib/dates'

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
      pb.collection('events').getFullList({ fields: 'id' }),
      pb.collection('events').getFullList({ fields: 'id', filter: `status = 'published'` }),
      pb.collection('events').getFullList({
        fields: 'id',
        filter: `date > '${nowIso}' && date <= '${futureIso}' && status = 'published'`,
      }),
      pb.collection('events').getFullList({
        fields: 'id',
        filter: `date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`,
      }),
      pb.collection('events').getFullList({
        fields: 'id',
        filter: `endDate > '${pastIso}' && endDate < '${nowIso}'`,
      }),
      pb.collection('registrations').getFullList({ fields: 'id' }),
      pb.collection('registrations').getFullList({
        fields: 'id',
        filter: `registrationStatus = 'confirmed'`,
      }),
      pb.collection('registrations').getFullList({
        fields: 'id',
        filter: `registrationStatus = 'pending'`,
      }),
      pb.collection('registrations').getFullList({
        fields: 'id',
        filter: `registrationDate >= '${startOfToday}' && registrationDate < '${endOfToday}'`,
      }),
      pb.collection('execom').getFullList({ fields: 'id' }),
      pb.collection('societies').getFullList({ fields: 'id' }),
      pb.collection('societies').getFullList({ fields: 'id', filter: `isHidden != true` }),
    ])

    return Response.json({
      events: {
        total: eventsTotal.length,
        published: eventsPublished.length,
        upcoming: eventsUpcoming.length,
        live: eventsLive.length,
        recentlyCompleted: eventsRecentlyCompleted.length,
      },
      registrations: {
        total: regsTotal.length,
        confirmed: regsConfirmed.length,
        pending: regsPending.length,
        today: regsToday.length,
      },
      execom: { total: execomTotal.length },
      societies: { total: societiesTotal.length, active: societiesActive.length },
    })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
