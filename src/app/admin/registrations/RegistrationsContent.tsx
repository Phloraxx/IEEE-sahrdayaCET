import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { cookies } from 'next/headers'
import { RegistrationsClient } from './RegistrationsClient'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function RegistrationsContent() {
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)
  const adminPB = createAdminPB()

  try {
    // Authenticate and get user role
    await pb.collection('users').authRefresh()
    const record = pb.authStore.record as { id: string; role: string } | null
    const userId = record?.id || ''
    const userRole = record?.role || ''

    // Build chair-scoped filter
    let eventFilter = ''
    let chairEventIds: string[] = []
    if (userRole === 'chair' && userId) {
      const societyIds = await getChairSocietyIds(adminPB, userId)
      if (societyIds.length === 0) {
        return <RegistrationsClient registrations={[]} total={0} events={[]} />
      }
      const societyFilter = societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
      const chairEvents = await adminPB.collection('events').getFullList({
        filter: societyFilter,
        fields: 'id',
      })
      chairEventIds = (chairEvents || []).map((e: Record<string, unknown>) => e.id as string)
      if (chairEventIds.length === 0) {
        return <RegistrationsClient registrations={[]} total={0} events={[]} />
      }
      eventFilter = chairEventIds.map((id) => `event = ${escapeFilterValue(id)}`).join(' || ')
    }

    const result = await adminPB.collection('registrations').getList(1, 50, {
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand',
      filter: eventFilter || undefined,
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

    // Fetch events for filter dropdown (scoped for chairs)
    let events: { id: string; title: string }[] = []
    try {
      const eventsQuery: Record<string, unknown> = {
        fields: 'id,title',
        sort: '-date',
      }
      // Build a separate events-collection filter (eventFilter uses `event =` for registrations)
      if (chairEventIds && chairEventIds.length > 0) {
        const eventsFilter = chairEventIds.map((id) => `id = ${escapeFilterValue(id)}`).join(' || ')
        eventsQuery.filter = eventsFilter
      }
      const eventsResult = await adminPB.collection('events').getFullList(eventsQuery)
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
