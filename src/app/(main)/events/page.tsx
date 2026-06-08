import type { Metadata } from 'next';
import { createAdminPB } from '@/lib/pb'
import { APP_URL } from '@/lib/constants'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
  const pb = createAdminPB()
  const result = await pb.collection('events').getList(1, 20, {
    filter: 'status="published"',
    sort: 'date',
    expand: 'society',
  })

  const events = (result.items || []).map((raw: Record<string, unknown>) => {
    const doc = raw as {
      id: string
      created?: string
      updated?: string
      title?: string
      description?: string
      date?: string
      endDate?: string
      venue?: string
      price?: number
      banner?: string
      status?: string
      registrationOpen?: boolean
      maxCapacity?: number
      registeredCount?: number
      slug?: string
      society?: Record<string, unknown> | string | null
      expand?: { society?: Record<string, unknown> }
    }

    const societyRaw = doc.society
    const societyExpand = doc.expand?.society
    const societyData = typeof societyRaw === 'object' && societyRaw !== null ? societyRaw : societyExpand
    const society = societyData
      ? {
          id: societyData.id as string,
          name: societyData.name as string,
          slug: societyData.slug as string,
          logoUrl: societyData.logo
            ? `${process.env.POCKETBASE_URL}/api/files/societies/${societyData.id}/${societyData.logo}`
            : '',
        }
      : undefined

    const price = Number(doc.price) || 0

    return {
      id: doc.id,
      createdAt: doc.created || '',
      updatedAt: doc.updated || '',
      title: doc.title || '',
      description: doc.description || '',
      date: doc.date || '',
      endDate: doc.endDate || '',
      venue: doc.venue || '',
      price,
      isPaid: price > 0,
      bannerUrl: doc.banner
        ? `${process.env.POCKETBASE_URL}/api/files/events/${doc.id}/${doc.banner}`
        : '',
      status: doc.status || 'published',
      registrationOpen: !!doc.registrationOpen,
      maxCapacity: doc.maxCapacity || 0,
      registeredCount: doc.registeredCount || 0,
      slug: doc.slug || '',
      society,
    }
  })

  return (
    <ErrorBoundary>
      <EventsPageClient initialEvents={events} />
    </ErrorBoundary>
  )
}
