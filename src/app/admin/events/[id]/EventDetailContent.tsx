import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { cookies } from 'next/headers'
import { EventDetailClient } from './EventDetailClient'
import { logError } from '@/lib/logger'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function EventDetailContent({ eventId }: { eventId: string }) {
  const cookieStore = await cookies()
  const userPB = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)

  // Check chair access
  let userRole = ''
  let userId = ''
  try {
    await userPB.collection('users').authRefresh()
    const record = userPB.authStore.record as { id: string; role: string } | null
    if (record) {
      userRole = record.role || ''
      userId = record.id || ''
    }
  } catch {
    // Will fail below with event not found
  }

  const adminPB = createAdminPB()

  if (userRole === 'chair' && userId) {
    const event = await adminPB.collection('events').getOne(eventId, { fields: 'id,society' }).catch(() => null)
    if (event) {
      const societyIds = await getChairSocietyIds(adminPB, userId)
      const eventSociety = (event as Record<string, unknown>).society as string
      if (!societyIds.includes(eventSociety)) {
        return (
          <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this event.
          </div>
        )
      }
    }
  }

  try {
    const event = await adminPB.collection('events').getOne(eventId, { expand: 'society' })
    const expand = (event as Record<string, unknown>).expand as Record<string, unknown> | undefined
    const society = expand?.society as Record<string, unknown> | undefined

    let societyName = (society?.name as string) || ''
    if (!societyName) {
      const societyId = (event as Record<string, unknown>).society as string
      if (societyId) {
        try {
          const societyRecord = await adminPB.collection('societies').getOne(societyId, { fields: 'id,name' })
          societyName = (societyRecord as Record<string, unknown>).name as string
        } catch {
          // Non-fatal
        }
      }
    }

    let registrationsItems: Record<string, unknown>[] = []
    try {
      const registrations = await adminPB.collection('registrations').getList(1, 50, {
        filter: `event = ${escapeFilterValue(eventId)}`,
        sort: '-registrationDate',
        fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,paymentTicketId,created,amount',
      })
      registrationsItems = registrations.items as Record<string, unknown>[]
    } catch {
      // Non-fatal
    }

    return (
      <EventDetailClient
        event={{
          id: event.id,
          title: (event as Record<string, unknown>).title as string,
          description: (event as Record<string, unknown>).description as string,
          date: (event as Record<string, unknown>).date as string,
          endDate: (event as Record<string, unknown>).endDate as string,
          venue: (event as Record<string, unknown>).venue as string,
          price: Number((event as Record<string, unknown>).price) || 0,
          status: ((event as Record<string, unknown>).status as string) || 'draft',
          registrationOpen: !!(event as Record<string, unknown>).registrationOpen,
          maxCapacity: Number((event as Record<string, unknown>).maxCapacity) || 0,
          registeredCount: Number((event as Record<string, unknown>).registeredCount) || 0,
          checkedInCount: Number((event as Record<string, unknown>).checkedInCount) || 0,
          isPaid: !!(event as Record<string, unknown>).isPaid,
          societyName: societyName,
          registrationDeadline: (event as Record<string, unknown>).registrationDeadline as string,
          contactEmail: (event as Record<string, unknown>).contactEmail as string,
          contactPhone: (event as Record<string, unknown>).contactPhone as string,
        }}
        registrations={registrationsItems.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          userName: (r.userName as string) || 'Unknown',
          userEmail: (r.userEmail as string) || '',
          userPhone: (r.userPhone as string) || '',
          registrationStatus: (r.registrationStatus as string) || 'pending',
          paymentStatus: (r.paymentStatus as string) || '',
          checkedIn: !!r.checkedIn,
          checkedInAt: (r.checkedInAt as string) || '',
          ticketId: (r.ticketId as string) || '',
          amount: Number(r.amount) || 0,
          createdAt: (r.created as string) || '',
        }))}
      />
    )
  } catch (error) {
    logError('admin-event-detail', error)
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
        Event not found
      </div>
    )
  }
}
