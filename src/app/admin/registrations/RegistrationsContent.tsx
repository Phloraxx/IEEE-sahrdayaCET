import { createPB, createAdminPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import { RegistrationsClient } from './RegistrationsClient'

export async function RegistrationsContent() {
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)

  try {
    const result = await pb.collection('registrations').getList(1, 50, {
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand',
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

    // Fetch events for filter dropdown
    let events: { id: string; title: string }[] = []
    try {
      const adminPB = createAdminPB()
      const eventsResult = await adminPB.collection('events').getFullList({
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
    return <RegistrationsClient registrations={[]} total={0} />
  }
}
