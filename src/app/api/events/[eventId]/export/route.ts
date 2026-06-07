import { NextRequest, NextResponse } from 'next/server'
import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { escapeCsv } from '@/lib/csv'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const pb = createPB(request.headers.get('cookie') || undefined)
  const { user } = await requireAuth()

  try {
    const { eventId } = await params

    const event = await pb.collection('events').getOne(eventId).catch(() => null)
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (user.role !== 'admin') {
      const society = await pb.collection('societies').getOne(event.society).catch(() => null)
      const chairs = (society?.chairs || []) as string[]
      if (!chairs.includes(user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const registrations = await pb.collection('registrations').getFullList({
      filter: `event = '${eventId}'`,
      sort: '-registrationDate',
    })

    const rows: string[] = []
    rows.push([
      'Name',
      'Email',
      'Phone',
      'Registration Date',
      'Payment Status',
      'Registration Status',
      'Checked In',
      'Checked In At',
      'Ticket ID',
    ].join(','))

    for (const reg of registrations) {
      const userName = escapeCsv(reg.userName)
      const userEmail = escapeCsv(reg.userEmail)
      const userPhone = escapeCsv(reg.userPhone)
      const regDate = reg.registrationDate
        ? new Date(reg.registrationDate).toLocaleDateString('en-IN')
        : ''
      const payStatus = escapeCsv(reg.paymentStatus)
      const regStatus = escapeCsv(reg.registrationStatus)
      const checkedIn = reg.checkedIn ? 'Yes' : 'No'
      const checkedInAt = reg.checkedInAt
        ? new Date(reg.checkedInAt).toLocaleString('en-IN')
        : ''
      const ticketId = escapeCsv(reg.ticketId)

      rows.push([
        userName,
        userEmail,
        userPhone,
        regDate,
        payStatus,
        regStatus,
        checkedIn,
        checkedInAt,
        ticketId,
      ].join(','))
    }

    const csv = rows.join('\n')
    const filename = `${String(event.title).replace(/[^a-zA-Z0-9]/g, '_')}_registrations.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to export registrations' },
      { status: 500 }
    )
  }
}

