import { NextRequest } from 'next/server'
import { createPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

import { parsePagination, buildFilter } from '@/lib/route-helpers'

export async function GET(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    

    const url = new URL(req.url)
    const { page, perPage } = parsePagination(url, { defaultPerPage: 50, maxPerPage: 100 })
    const eventId = url.searchParams.get('eventId')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    // Build base filter from query params
    const baseParts: string[] = []
    if (eventId) baseParts.push(`event = ${escapeFilterValue(eventId)}`)
    if (status && status !== 'all') baseParts.push(`registrationStatus = ${escapeFilterValue(status)}`)
    if (search) baseParts.push(`userName ~ ${escapeFilterValue(search)}`)
    const filter = buildFilter(baseParts)

    const result = await pb.collection('registrations').getList(page, perPage, {
      filter: filter || undefined,
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand.event.id,expand.event.title',
    })

    const registrations = result.items.map((r) => {
      const row = r as unknown as Record<string, unknown>
      const expand = row.expand as Record<string, unknown> | undefined
      const event = expand?.event as Record<string, unknown> | undefined
      return {
        id: row.id,
        userName: row.userName,
        userEmail: row.userEmail,
        userPhone: row.userPhone,
        registrationStatus: row.registrationStatus,
        paymentStatus: row.paymentStatus,
        checkedIn: !!row.checkedIn,
        checkedInAt: row.checkedInAt,
        ticketId: row.ticketId,
        amount: Number(row.amount) || 0,
        createdAt: row.created,
        eventTitle: event?.title || '',
        eventId: event?.id || '',
      }
    })

    return Response.json({ registrations, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    return handleError(error, 'admin-registrations-list')
  }
}
