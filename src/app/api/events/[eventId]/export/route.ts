import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { generateRegistrationsCSV } from '@/lib/csv-export'
import { logError } from '@/lib/logger'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const pb = createPB(request.headers.get('cookie') || undefined)
  const { user } = await requireAuth()

  try {
    const { eventId } = await params

    const event = await pb.collection('events').getOne(eventId).catch(() => null)
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    if (user.role !== 'admin') {
      const society = await pb.collection('societies').getOne(event.society).catch(() => null)
      const chairs = (society?.chairs || []) as string[]
      if (!chairs.includes(user.id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const csv = await generateRegistrationsCSV(pb, eventId)
    const filename = `${String(event.title).replace(/[^a-zA-Z0-9]/g, '_')}_registrations.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    logError('event-export', error)
    return Response.json(
      { error: 'Failed to export registrations' },
      { status: 500 }
    )
  }
}
