import { getPayload } from 'payload'
import config from '@payload-config'
import { requireAuth, AuthError } from '@/lib/auth'

const iso = (d: Date) => d.toISOString()

const baseEventSelect = {
  id: true,
  title: true,
  date: true,
  endDate: true,
  venue: true,
  status: true,
  maxCapacity: true,
  registeredCount: true,
  checkedInCount: true,
  bannerUrl: true,
  society: true,
} as const

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

  try {
    const [live, upcoming, recentlyCompleted] = await Promise.all([
      payload.find({
        collection: 'events',
        where: {
          and: [
            { date: { less_than_equal: nowIso } },
            { endDate: { greater_than_equal: nowIso } },
            { status: { equals: 'published' } },
            { isDeleted: { not_equals: true } },
          ],
        },
        limit: 5,
        sort: 'date',
        depth: 1,
      }),
      payload.find({
        collection: 'events',
        where: {
          date: { greater_than: nowIso, less_than_equal: futureIso },
          status: { equals: 'published' },
          isDeleted: { not_equals: true },
        },
        limit: 6,
        sort: 'date',
        depth: 1,
      }),
      payload.find({
        collection: 'events',
        where: {
          endDate: { greater_than: pastIso, less_than: nowIso },
          isDeleted: { not_equals: true },
        },
        limit: 5,
        sort: '-endDate',
        depth: 1,
      }),
    ])

    type ProjectedEvent = {
      id: string | number
      title?: unknown
      date?: unknown
      endDate?: unknown
      venue?: unknown
      status?: unknown
      maxCapacity?: unknown
      registeredCount?: unknown
      checkedInCount?: unknown
      bannerUrl?: unknown
      societyName: string
    }

    const project = (e: unknown): ProjectedEvent => {
      const obj = e as Record<string, unknown>
      const society = obj.society as
        | { id?: string | number; name?: string }
        | string
        | number
        | null
      const societyName =
        typeof society === 'object' && society !== null
          ? (society.name as string) || ''
          : ''
      return {
        id: obj.id as string | number,
        title: obj.title,
        date: obj.date,
        endDate: obj.endDate,
        venue: obj.venue,
        status: obj.status,
        maxCapacity: obj.maxCapacity,
        registeredCount: obj.registeredCount,
        checkedInCount: obj.checkedInCount,
        bannerUrl: obj.bannerUrl,
        societyName,
      }
    }

    return Response.json({
      live: live.docs.map(project),
      upcoming: upcoming.docs.map(project),
      recentlyCompleted: recentlyCompleted.docs.map(project),
    })
  } catch (error) {
    payload.logger.error(`Dashboard events error: ${error}`)
    return Response.json(
      { error: 'Failed to fetch dashboard events', live: [], upcoming: [], recentlyCompleted: [] },
      { status: 200 },
    )
  }
}
