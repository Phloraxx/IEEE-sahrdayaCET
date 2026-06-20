import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { getChairScope, assertChairRegistrationAccess } from '@/lib/chair-scope'
import { checkInRegistration, cancelRegistration, RegistrationError } from '@/lib/registration-service'
import { REGISTRATION_STATUS, PAYMENT_STATUS } from '@/lib/constants'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const cookie = req.headers.get('cookie') || undefined
    const pb = createPB(cookie)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()
    const scope = await getChairScope(adminPB, user.id, user.role)
    await assertChairRegistrationAccess(adminPB, user.id, user.role, id, scope)

    const reg = await adminPB.collection('registrations').getOne(id, { expand: 'event' })
    const r = reg as unknown as Record<string, unknown>
    const expand = r.expand as Record<string, unknown> | undefined
    const event = expand?.event as Record<string, unknown> | undefined

    return Response.json({
      registration: {
        id: r.id,
        userName: r.userName,
        userEmail: r.userEmail,
        userPhone: r.userPhone,
        registrationStatus: r.registrationStatus,
        paymentStatus: r.paymentStatus,
        checkedIn: !!r.checkedIn,
        checkedInAt: r.checkedInAt,
        ticketId: r.ticketId,
        amount: Number(r.amount) || 0,
        couponCode: r.couponCode || '',
        discountAmount: Number(r.discountAmount) || 0,
        paymentData: r.paymentData || null,
        formResponses: r.formResponses,
        createdAt: r.created,
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
    const cookie = req.headers.get('cookie') || undefined
    const pb = createPB(cookie)
    const { user } = await requireRole(['admin', 'chair'], pb)
    const adminPB = createAdminPB()
    const scope = await getChairScope(adminPB, user.id, user.role)
    await assertChairRegistrationAccess(adminPB, user.id, user.role, id, scope)

    const body = (await req.json().catch(() => ({}))) as {
      checkedIn?: boolean
      registrationStatus?: string
      paymentStatus?: string
      amount?: number
    }

    if (body.checkedIn === true) {
      await checkInRegistration(adminPB, id)
      return Response.json({ success: true, action: 'checked_in' })
    }

    if (body.registrationStatus === 'cancelled') {
      await cancelRegistration(adminPB, id)
      return Response.json({ success: true, action: 'cancelled' })
    }

    if (body.registrationStatus && (REGISTRATION_STATUS as readonly string[]).includes(body.registrationStatus)) {
      await adminPB.collection('registrations').update(id, { registrationStatus: body.registrationStatus })
      return Response.json({ success: true, action: 'status_updated' })
    }

    if (body.paymentStatus && (PAYMENT_STATUS as readonly string[]).includes(body.paymentStatus)) {
      await adminPB.collection('registrations').update(id, { paymentStatus: body.paymentStatus })
      return Response.json({ success: true, action: 'payment_updated' })
    }

    if (typeof body.amount === 'number' && body.amount >= 0) {
      await adminPB.collection('registrations').update(id, { amount: body.amount })
      return Response.json({ success: true, action: 'amount_updated' })
    }

    return Response.json({ error: 'No valid action specified' }, { status: 400 })
  } catch (error) {
    if (error instanceof RegistrationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return handleError(error, 'admin-registrations-update')
  }
}
