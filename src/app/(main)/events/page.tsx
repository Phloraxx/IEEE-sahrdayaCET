import type { Metadata } from 'next';
import { APP_URL } from '@/lib/constants'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { pbFetch } from '@/lib/pb'
import EventsPageClient from './EventsPageClient'

interface EventItem {
  id: string; createdAt: string; updatedAt: string; title: string; description: string
  date: string; endDate: string; venue: string; price: number; isPaid: boolean
  bannerUrl: string; status: string; registrationOpen: boolean; maxCapacity: number
  registeredCount: number; society?: { id: string; name: string; slug: string; logoUrl: string }
}

export const dynamic = 'force-dynamic'

const PB_URL = process.env.POCKETBASE_URL
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
  if (!PB_URL) throw new Error('Missing POCKETBASE_URL')
  const fileUrl = (col: string, id: string, name: string) => `${PB_URL}/api/files/${col}/${id}/${name}`

  let events: EventItem[] = []
  try {
    const result = await pbFetch<{ items: Record<string, unknown>[] }>(`${PB_URL}/api/collections/events/records?perPage=20&filter=${encodeURIComponent('status="published"')}&sort=date&expand=society&skipTotal=1&fields=id,title,description,date,endDate,venue,price,banner,status,registrationOpen,maxCapacity,registeredCount`)

  events = (result?.items || []).map((raw: Record<string, unknown>) => {
    const doc = raw as Record<string, unknown>
    const expand = doc.expand as Record<string, unknown> | undefined
    const societyData = (doc.society && typeof doc.society === 'object' ? doc.society : expand?.society) as Record<string, unknown> | undefined
    const society = societyData
      ? { id: societyData.id as string, name: societyData.name as string, slug: societyData.slug as string, logoUrl: societyData.logo ? fileUrl('societies', societyData.id as string, societyData.logo as string) : '' }
      : undefined
    const price = Number(doc.price) || 0
    return {
      id: doc.id as string,
      createdAt: (doc.created as string) || '',
      updatedAt: (doc.updated as string) || '',
      title: (doc.title as string) || '',
      description: (doc.description as string) || '',
      date: (doc.date as string) || '',
      endDate: (doc.endDate as string) || '',
      venue: (doc.venue as string) || '',
      price,
      isPaid: price > 0,
      bannerUrl: doc.banner ? fileUrl('events', doc.id as string, doc.banner as string) : '',
      status: (doc.status as string) || 'published',
      registrationOpen: !!doc.registrationOpen,
      maxCapacity: (doc.maxCapacity as number) || 0,
      registeredCount: (doc.registeredCount as number) || 0,
      society,
    }
  })
  } catch (e) {
    console.error('Failed to fetch events:', e)
  }

  return (
    <ErrorBoundary>
      <EventsPageClient initialEvents={events} />
    </ErrorBoundary>
  )
}
