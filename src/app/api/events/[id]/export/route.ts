import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

import { streamRegistrationsCSV, csvFilename } from '@/lib/csv-export'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const pb = createPB(request.headers.get('cookie') || undefined)
    const { user } = await requireAuth(pb)
    

    const { id } = await params

    const event = await pb.collection('events')
      .getOne(id, { fields: 'id,title,society' })
      .catch(() => null)
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    

    const stream = await streamRegistrationsCSV(pb, id, { event: event as any })
    const filename = csvFilename((event as any).title, id)

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    })
  } catch (error) {
    return handleError(error, 'event-export')
  }
}
