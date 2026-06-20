import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError, getErrorStatus } from '@/lib/api-error'
import { assertChairEventAccess, getChairScope } from '@/lib/chair-scope'
import { streamRegistrationsCSV, csvFilename } from '@/lib/csv-export'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    const { id: eventId } = await params

    const scope = await getChairScope(adminPB, user.id, user.role)
    await assertChairEventAccess(adminPB, user.id, user.role, eventId, scope)

    const event = await adminPB.collection('events')
      .getOne(eventId, { fields: 'id,title,formTemplate' })
      .catch(() => null)
    if (!event) {
      return new Response('Event not found', { status: 404 })
    }

    const stream = await streamRegistrationsCSV(adminPB, eventId, { adminFormat: true, event: event as any })
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
