import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { cancelRegistration } from '@/lib/registration-service'

/**
 * User-facing registration PATCH.
 * For security, users may ONLY cancel their own registration.
 * Payment status, paymentTicketId, amount, and arbitrary status changes
 * are NOT allowed here — those are admin-only (see admin/registrations/[id]).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireAuth(pb)

    const registration = await pb.collection('registrations').getOne(id, { fields: 'id,user' }).catch(() => null)
    if (!registration) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    const regUser = (registration as Record<string, unknown>).user as string
    if (regUser !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { registrationStatus?: string }

    if (body.registrationStatus === 'cancelled') {
      await cancelRegistration(pb, id)
      return Response.json({ success: true, action: 'cancelled' })
    }

    return Response.json({ error: 'Users can only cancel their registration' }, { status: 400 })
  } catch (error) {
    return handleError(error, 'registrations-patch')
  }
}
