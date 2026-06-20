import { createPB, createAdminPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import { RegistrationsClient } from './RegistrationsClient'
import { getChairScope } from '@/lib/chair-scope'
import { requireAuth } from '@/lib/auth'
import { PB_AUTH_COOKIE, EMPTY_FILTER } from '@/lib/constants'

export async function RegistrationsContent() {
  const cookieStore = await cookies()
  const pb = createPB(`${PB_AUTH_COOKIE}=${cookieStore.get(PB_AUTH_COOKIE)?.value}`)
  const adminPB = createAdminPB()

  try {
    const { user } = await requireAuth(pb)
    const scope = await getChairScope(adminPB, user.id, user.role)
    if (user.role === 'chair' && !scope.hasScope) {
      return <RegistrationsClient registrations={[]} total={0} events={[]} />
    }

    const result = await adminPB.collection('registrations').getList(1, 50, {
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand.event.id,expand.event.title',
      filter: scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? scope.eventFilter : undefined,
    })

    const registrations = result.items.map((r: Record<string, unknown>) => {
      const expand = r.expand as Record<string, unknown> | undefined
      const event = expand?.event as Record<string, unknown> | undefined
      return {
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
        eventTitle: (event?.title as string) || '',
        eventId: (event?.id as string) || '',
      }
    })

    let events: { id: string; title: string }[] = []
    try {
      const eventsResult = await adminPB.collection('events').getFullList({
        filter: scope.societyFilter && scope.societyFilter !== EMPTY_FILTER ? scope.societyFilter : undefined,
        fields: 'id,title',
        sort: '-date',
      })
      events = (eventsResult || []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        title: (e.title as string) || '',
      }))
    } catch {
      // Non-fatal
    }

    return <RegistrationsClient registrations={registrations} total={result.totalItems} events={events} />
  } catch {
    return <RegistrationsClient registrations={[]} total={0} events={[]} />
  }
}
