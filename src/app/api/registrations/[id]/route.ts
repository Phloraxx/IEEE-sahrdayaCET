import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { logError } from '@/lib/logger'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  let user
  try {
    const auth = await requireAuth()
    user = auth.user
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const registration = await pb.collection('registrations').getOne(id).catch(() => null)
    if (!registration) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    if (registration.user !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as {
      paymentStatus?: string
      registrationStatus?: string
      paymentAmount?: number
      paymentTicketId?: string
    }

    const updateData: Record<string, unknown> = {}
    if (body.paymentStatus) updateData.paymentStatus = body.paymentStatus
    if (body.registrationStatus) updateData.registrationStatus = body.registrationStatus
    if (body.paymentAmount !== undefined) updateData.amount = body.paymentAmount
    if (body.paymentTicketId) updateData.paymentTicketId = body.paymentTicketId

    const updated = await pb.collection('registrations').update(id, updateData)

    return Response.json({
      id: updated.id,
      ticket: { ticket_id: updated.ticketId || null },
    })
  } catch (error) {
    logError('registrations-patch', error)
    return Response.json({ error: 'Failed to update registration' }, { status: 500 })
  }
}
