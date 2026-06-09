import { NextRequest } from 'next/server'
import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds, buildSocietyFilter } from '@/lib/chair-scope'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '20'), 100)
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')

  let filter = ''
  if (status && status !== 'all') {
    filter = `status = ${escapeFilterValue(status)}`
  }
  if (search) {
    const term = escapeFilterValue(search)
    const searchFilter = `title ~ ${term}`
    filter = filter ? `(${filter} && ${searchFilter})` : searchFilter
  }

  try {
    const adminPB = createAdminPB()

    // Scope to user's societies if they are a chair
    const userPB = createPB(req.headers.get('cookie') || undefined)
    try {
      await userPB.collection('users').authRefresh()
    } catch {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }
    const userRecord = userPB.authStore.record as { id: string; role: string } | null

    if (userRecord && userRecord.role === 'chair') {
      const societyIds = await getChairSocietyIds(adminPB, userRecord.id)
      const societyFilter = buildSocietyFilter(societyIds)
      filter = filter ? `(${filter} && ${societyFilter})` : societyFilter
    }

    const result = await adminPB.collection('events').getList(page, perPage, {
      filter: filter || undefined,
      sort: '-date',
      expand: 'society',
    })

    const events = result.items.map((e: Record<string, unknown>) => {
      const expand = e.expand as Record<string, unknown> | undefined
      const society = expand?.society as Record<string, unknown> | undefined
      return {
        id: e.id,
        title: e.title,
        date: e.date,
        endDate: e.endDate,
        venue: e.venue,
        price: e.price,
        status: e.status,
        registrationOpen: e.registrationOpen,
        maxCapacity: e.maxCapacity,
        registeredCount: e.registeredCount,
        checkedInCount: e.checkedInCount,
        isPaid: e.isPaid,
        societyName: society?.name || '',
        societyId: society?.id || '',
      }
    })

    return Response.json({ events, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    return handleError(error, 'admin-events-list')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const adminPB = createAdminPB()

    // Chairs can only create events under their own societies
    const userPB = createPB(req.headers.get('cookie') || undefined)
    try {
      await userPB.collection('users').authRefresh()
    } catch {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }
    const userRecord = userPB.authStore.record as { id: string; role: string } | null

    if (userRecord && userRecord.role === 'chair') {
      const societyIds = await getChairSocietyIds(adminPB, userRecord.id)
      if (!body.society || !societyIds.includes(body.society)) {
        return Response.json({ error: 'You can only create events under your own societies' }, { status: 403 })
      }
    }

    const event = await adminPB.collection('events').create(body)
    return Response.json({ event }, { status: 201 })
  } catch (error) {
    return handleError(error, 'admin-events-create')
  }
}
