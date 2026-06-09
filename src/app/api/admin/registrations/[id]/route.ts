import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { getChairSocietyIds } from '@/lib/chair-scope'
import { checkInRegistration, cancelRegistration, RegistrationError } from '@/lib/registration-service'

/**
 * Verifies that a chair user has access to the event this registration belongs to.
 */
async function assertChairCanAccessRegistration(
  adminPB: ReturnType<typeof createAdminPB>,
  userId: string,
  registrationId: string,
): Promise<{ allowed: boolean; error?: Response }> {
  const reg = await adminPB.collection('registrations').getOne(registrationId, { fields: 'id,event' }).catch(() => null)
  if (!reg) return { allowed: false, error: Response.json({ error: 'Registration not found' }, { status: 404 }) }

  const eventId = (reg as Record<string, unknown>).event as string
  if (!eventId) return { allowed: false, error: Response.json({ error: 'Registration has no event' }, { status: 400 }) }

  const event = await adminPB.collection('events').getOne(eventId, { fields: 'id,society' }).catch(() => null)
  if (!event) return { allowed: false, error: Response.json({ error: 'Event not found' }, { status: 404 }) }

  const societyIds = await getChairSocietyIds(adminPB, userId)
  const eventSociety = (event as Record<string, unknown>).society as string
  if (!societyIds.includes(eventSociety)) {
    return { allowed: false, error: Response.json({ error: 'Forbidden: not a chair of this event\'s society' }, { status: 403 }) }
  }

  return { allowed: true }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    // Chair scoping
    if (user.role === 'chair') {
      const access = await assertChairCanAccessRegistration(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    const reg = await adminPB.collection('registrations').getOne(id, { expand: 'event' })
    const expand = (reg as Record<string, unknown>).expand as Record<string, unknown> | undefined
    const event = expand?.event as Record<string, unknown> | undefined

    return Response.json({
      registration: {
        id: reg.id,
        userName: (reg as Record<string, unknown>).userName,
        userEmail: (reg as Record<string, unknown>).userEmail,
        userPhone: (reg as Record<string, unknown>).userPhone,
        registrationStatus: (reg as Record<string, unknown>).registrationStatus,
        paymentStatus: (reg as Record<string, unknown>).paymentStatus,
        checkedIn: !!(reg as Record<string, unknown>).checkedIn,
        checkedInAt: (reg as Record<string, unknown>).checkedInAt,
        ticketId: (reg as Record<string, unknown>).ticketId,
        amount: Number((reg as Record<string, unknown>).amount) || 0,
        formResponses: (reg as Record<string, unknown>).formResponses,
        createdAt: (reg as Record<string, unknown>).created,
        eventTitle: event?.title || '',
        eventId: event?.id || '',
      },
    })
  } catch (error) {
    return handleError(error, 'admin-registrations-get')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()

    // Chair scoping
    if (user.role === 'chair') {
      const access = await assertChairCanAccessRegistration(adminPB, user.id, id)
      if (!access.allowed) return access.error
    }

    const body = (await req.json()) as {
      checkedIn?: boolean
      registrationStatus?: string
    }

    if (body.checkedIn === true) {
      await checkInRegistration(adminPB, id)
      return Response.json({ success: true, action: 'checked_in' })
    }

    if (body.registrationStatus === 'cancelled') {
      await cancelRegistration(adminPB, id)
      return Response.json({ success: true, action: 'cancelled' })
    }

    return Response.json({ error: 'No valid action specified' }, { status: 400 })
  } catch (error) {
    if (error instanceof RegistrationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return handleError(error, 'admin-registrations-update')
  }
}
