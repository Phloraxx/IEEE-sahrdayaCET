import { getPayload } from 'payload'
import config from '@payload-config'
import { isChairOfSocietyForEvent } from '@/payload/access'
import { requireAuth, AuthError } from '@/lib/auth'

const escapeCsv = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString()
  } catch {
    return ''
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user: { id: string; role?: string }
  try {
    const r = await requireAuth()
    user = r.user
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(e.message, { status: e.status })
    }
    return new Response('Authentication failed', { status: 401 })
  }

  const { id: eventId } = await params
  if (!eventId) {
    return new Response('Missing event id', { status: 400 })
  }

  const payload = await getPayload({ config })

  const { allowed } = await isChairOfSocietyForEvent({
    userId: user.id,
    userRole: user.role || '',
    eventId,
    payload,
  })
  if (!allowed) {
    return new Response('Forbidden', { status: 403 })
  }

  const event = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
  if (!event) {
    return new Response('Event not found', { status: 404 })
  }

  const regs = await payload.find({
    collection: 'registrations',
    where: { event: { equals: eventId } },
    depth: 0,
    limit: 5000,
    sort: '-registrationDate',
  })

  const header = [
    'name',
    'email',
    'phone',
    'payment_status',
    'payment_amount',
    'payment_ticket_id',
    'registration_status',
    'checked_in',
    'checked_in_at',
    'ticket_id',
    'registration_date',
  ]

  const rows = [header.join(',')]
  for (const r of regs.docs as unknown as Array<Record<string, unknown>>) {
    const ticket = r.ticket as { ticket_id?: string } | null
    rows.push(
      [
        escapeCsv(r.userName),
        escapeCsv(r.userEmail),
        escapeCsv(r.userPhone),
        escapeCsv(r.paymentStatus),
        escapeCsv(r.paymentAmount),
        escapeCsv(r.paymentTicketId),
        escapeCsv(r.registrationStatus),
        escapeCsv(r.checkedIn ? 'yes' : 'no'),
        escapeCsv(formatDate(r.checkedInAt as string | null)),
        escapeCsv(ticket?.ticket_id),
        escapeCsv(formatDate(r.registrationDate as string | null)),
      ].join(','),
    )
  }

  const csv = rows.join('\n') + '\n'
  const filename = `registrations-${(event.slug as string) || eventId}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
