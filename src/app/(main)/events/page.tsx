import type { Metadata } from 'next';
import { createPB } from '@/lib/pb'
import { APP_URL } from '@/lib/constants'
import EventsPageClient from './EventsPageClient'

export const dynamic = 'force-dynamic'

const EVENTS_URL = `${APP_URL}/events`

export const metadata: Metadata = {
  title: 'Events',
  description: 'Browse upcoming IEEE Sahrdaya events — workshops, hackathons, seminars, conferences and more.',
  openGraph: {
    title: 'Events | IEEE Sahrdaya',
    description: 'Browse upcoming IEEE Sahrdaya events, workshops, hackathons and conferences.',
    url: EVENTS_URL,
    images: [{ url: '/web.png', width: 1200, height: 630, alt: 'IEEE Sahrdaya Events' }],
  },
  alternates: { canonical: EVENTS_URL },
}

export default async function EventsPage() {
  const pb = createPB()
  const result = await pb.collection('events').getList(1, 20, { filter: 'status="published"', sort: 'date' })

  const events = (result.items || []).map((raw: Record<string, unknown>) => {
    const doc = raw as { id: string; created?: string; updated?: string; title?: string; description?: string; date?: string; venue?: string; price?: number; banner?: string; status?: string; registrationOpen?: boolean; maxCapacity?: number }
    return {
      id: doc.id,
      createdAt: doc.created || '',
      updatedAt: doc.updated || '',
      title: doc.title || '',
      description: doc.description || '',
      date: doc.date || '',
      venue: doc.venue || '',
      price: doc.price || 0,
      bannerUrl: doc.banner
        ? `${process.env.POCKETBASE_URL}/api/files/events/${doc.id}/${doc.banner}`
        : '',
      status: doc.status || 'published',
      registrationOpen: doc.registrationOpen || false,
      maxCapacity: doc.maxCapacity || 0,
      society: undefined,
    }
  })

  return <EventsPageClient initialEvents={events} />
}
