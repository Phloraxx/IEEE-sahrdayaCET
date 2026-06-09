import { NextRequest } from 'next/server'
import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { logError } from '@/lib/logger'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function GET(req: NextRequest) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireRole(['admin', 'chair'], pb)

  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '50'), 100)
  const eventId = url.searchParams.get('eventId')
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')

  let filter = ''
  if (eventId) filter = `event = ${escapeFilterValue(eventId)}`
  if (status && status !== 'all') {
    const sf = `registrationStatus = ${escapeFilterValue(status)}`
    filter = filter ? `${filter} && ${sf}` : sf
  }
  if (search) {
    const sf = `userName ~ ${escapeFilterValue(search)}`
    filter = filter ? `${filter} && ${sf}` : sf
  }

  // Scope to chair's societies
  if (user.role === 'chair') {
    const adminPB = createAdminPB()
    const societyIds = await getChairSocietyIds(adminPB, user.id)
    if (societyIds.length === 0) {
      // No societies assigned — no registrations to show
      return Response.json({ registrations: [], total: 0, page: 1, perPage })
    }
    // Find events belonging to chair's societies
    const societyFilter = societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
    const chairEvents = await adminPB.collection('events').getFullList({
      filter: societyFilter,
      fields: 'id',
    })
    const chairEventIds = (chairEvents || []).map((e: Record<string, unknown>) => e.id as string)
    if (chairEventIds.length === 0) {
      return Response.json({ registrations: [], total: 0, page: 1, perPage })
    }
    const eventFilter = chairEventIds.map((id) => `event = ${escapeFilterValue(id)}`).join(' || ')
    filter = filter ? `(${filter} && (${eventFilter}))` : eventFilter
  }

  try {
    const result = await pb.collection('registrations').getList(page, perPage, {
      filter: filter || undefined,
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand',
    })

    const registrations = result.items.map((r: Record<string, unknown>) => {
      const expand = r.expand as Record<string, unknown> | undefined
      const event = expand?.event as Record<string, unknown> | undefined
      return {
        id: r.id,
        userName: r.userName,
        userEmail: r.userEmail,
        userPhone: r.userPhone,
        registrationStatus: r.registrationStatus,
        paymentStatus: r.paymentStatus,
        checkedIn: !!r.checkedIn,
        checkedInAt: r.checkedInAt,
        ticketId: r.ticketId,
        amount: Number(r.amount) || 0,
        createdAt: r.created,
        eventTitle: event?.title || '',
        eventId: event?.id || '',
      }
    })

    return Response.json({ registrations, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    logError('admin-registrations-list', error)
    return Response.json({ error: 'Failed to fetch registrations' }, { status: 500 })
  }
}
