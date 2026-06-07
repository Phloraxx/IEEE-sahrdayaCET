import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { escapeCsv } from '@/lib/csv'

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString()
  } catch {
    return ''
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireAuth()

  const { id: eventId } = await params
  if (!eventId) {
    return new Response('Missing event id', { status: 400 })
  }

  const event = await pb.collection('events').getOne(eventId).catch(() => null)
  if (!event) {
    return new Response('Event not found', { status: 404 })
  }

  if (user.role !== 'admin') {
    const society = await pb.collection('societies').getOne(event.society).catch(() => null)
    const chairs = (society?.chairs || []) as string[]
    if (!chairs.includes(user.id)) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  const regs = await pb.collection('registrations').getFullList({
    filter: `event = '${eventId}'`,
    sort: '-registrationDate',
  })

  const header = [
    'name',
    'email',
    'phone',
    'payment_status',
    'registration_status',
    'checked_in',
    'checked_in_at',
    'ticket_id',
    'registration_date',
  ]

  const rows = [header.join(',')]
  for (const r of regs) {
    rows.push([
      escapeCsv(r.userName),
      escapeCsv(r.userEmail),
      escapeCsv(r.userPhone),
      escapeCsv(r.paymentStatus),
      escapeCsv(r.registrationStatus),
      escapeCsv(r.checkedIn ? 'yes' : 'no'),
      escapeCsv(formatDate(r.checkedInAt as string)),
      escapeCsv(r.ticketId || r.paymentTicketId),
      escapeCsv(formatDate(r.registrationDate as string)),
    ].join(','))
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
