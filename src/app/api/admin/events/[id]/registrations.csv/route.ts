import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { generateRegistrationsCSV } from '@/lib/csv-export'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireRole(['admin', 'chair'], pb)
  const adminPB = createAdminPB()

  const { id: eventId } = await params

  const event = await adminPB.collection('events').getOne(eventId).catch(() => null)
  if (!event) {
    return new Response('Event not found', { status: 404 })
  }

  // Chair scoping: verify the chair has access to this event's society
  if (user.role === 'chair') {
    const eventSociety = (event as Record<string, unknown>).society as string
    if (eventSociety) {
      const societyIds = await getChairSocietyIds(adminPB, user.id)
      if (!societyIds.includes(eventSociety)) {
        return new Response('Forbidden', { status: 403 })
      }
    } else {
      return new Response('Event has no society', { status: 400 })
    }
  }

  const csv = await generateRegistrationsCSV(adminPB, eventId, { adminFormat: true })
  const filename = `registrations-${eventId}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
