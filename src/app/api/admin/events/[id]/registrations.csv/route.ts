import { createPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError, getErrorStatus } from '@/lib/api-error'

import { streamRegistrationsCSV, csvFilename } from '@/lib/csv-export'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    

    const { id: eventId } = await params

    
    

    const event = await pb.collection('events')
      .getOne(eventId, { fields: 'id,title,formTemplate' })
      .catch(() => null)
    if (!event) {
      return new Response('Event not found', { status: 404 })
    }

    const stream = await streamRegistrationsCSV(pb, eventId, { adminFormat: true, event: event as any })
    const filename = csvFilename((event as any).title, eventId)

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const status = getErrorStatus(error)
    if (status === 403) return new Response('Forbidden', { status: 403 })
    if (status === 404) return new Response('Event not found', { status: 404 })
    return handleError(error, 'admin-registrations-csv')
  }
}
