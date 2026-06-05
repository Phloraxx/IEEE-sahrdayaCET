import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireAuth, AuthError } from '@/lib/auth'
import { isChairOfSocietyForEvent } from '@/payload/access'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ eventId: string }> }
) {
    let user: { id: string; email?: string | null; name?: string | null; role?: string }
    try {
        ;({ user } = await requireAuth())
    } catch (e) {
        if (e instanceof AuthError) {
            return NextResponse.json({ error: e.message }, { status: e.status })
        }
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    try {
        const payload = await getPayload({ config })
        const { eventId } = await params

        const event = await payload.findByID({
            collection: 'events',
            id: eventId,
            depth: 1,
        })

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const { allowed } = await isChairOfSocietyForEvent({
            userId: user.id,
            userRole: user.role || '',
            eventId,
            payload,
        })
        if (!allowed) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Fetch all registrations for this event
        const registrations = await payload.find({
            collection: 'registrations',
            where: {
                and: [
                    { event: { equals: eventId } },
                ],
            },
            limit: 1000,
            depth: 1,
        })

        // Build CSV rows
        const rows: string[] = []
        
        // Header
        rows.push([
            'Name',
            'Email',
            'Phone',
            'Registration Date',
            'Payment Status',
            'Payment Amount',
            'Registration Status',
            'Checked In',
            'Checked In At',
            'Ticket ID',
        ].join(','))

        // Data rows
        for (const reg of registrations.docs) {
            const userName = escapeCsvField(String(reg.userName || ''))
            const userEmail = escapeCsvField(String(reg.userEmail || ''))
            const userPhone = escapeCsvField(String(reg.userPhone || ''))
            const regDate = reg.registrationDate 
                ? new Date(reg.registrationDate).toLocaleDateString('en-IN')
                : ''
            const payStatus = escapeCsvField(String(reg.paymentStatus || ''))
            const payAmount = reg.paymentAmount || ''
            const regStatus = escapeCsvField(String(reg.registrationStatus || ''))
            const checkedIn = reg.checkedIn ? 'Yes' : 'No'
            const checkedInAt = reg.checkedInAt 
                ? new Date(reg.checkedInAt).toLocaleString('en-IN')
                : ''
            const ticketId = escapeCsvField(String((reg.ticket as Record<string, unknown>)?.ticket_id || ''))

            rows.push([
                userName,
                userEmail,
                userPhone,
                regDate,
                payStatus,
                payAmount,
                regStatus,
                checkedIn,
                checkedInAt,
                ticketId,
            ].join(','))
        }

        const csv = rows.join('\n')
        const filename = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_registrations.csv`

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    } catch (error) {
        console.error('CSV export error:', error)
        return NextResponse.json(
            { error: 'Failed to export registrations' },
            { status: 500 }
        )
    }
}

function escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`
    }
    return field
}
