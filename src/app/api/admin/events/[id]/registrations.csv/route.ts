import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { generateRegistrationsCSV } from '@/lib/csv-export'

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

  const csv = await generateRegistrationsCSV(pb, eventId, { adminFormat: true })
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
