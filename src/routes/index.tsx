import { createFileRoute } from '@tanstack/react-router'
import type { Member, Society } from '@/types'
import { buildFileUrl } from '@/lib/pb'
import Navbar from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { GridBackground } from '@/components/GridBackground'
import { TechnicalDetails } from '@/components/TechnicalDetails'
import { FloatingIcons } from '@/components/FloatingIcons'
import { WhatsHappening } from '@/components/WhatsHappening'
import { Execom } from '@/components/Execom'
import { EventsShowcase } from '@/components/EventsShowcase'
import Footer from '@/components/Footer'
import { FloatingAction } from '@/components/FloatingAction'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface ExecomDoc extends Record<string, unknown> {
  photo?: string
  linkedin?: string
  email?: string
  phone?: string
}

const POSITION_TAGLINES: Record<string, string> = {
  'Branch Counselor': 'GUIDING LIGHT',
  'Chairperson': 'LEADING THE CHARGE',
  'Vice Chair': 'VISION & STRATEGY',
  'Secretary': 'KEEPING IT TOGETHER',
  'Joint Secretary': 'BRIDGING THE GAP',
  'Treasurer': 'NUMBERS & BEYOND',
  'Web Master': 'DIGITAL ARCHITECT',
  'MDC': 'MEMBERSHIP DRIV',
  'ECC': 'ELECTRONIC & COMM',
  'Technical Coordinator': 'TECH WIZARD',
  'Link Rep': 'LINKING MINDS',
}

interface HomeData {
  latestEvent: {
    id: string
    title: string
    shortTitle?: string
    description: string
    date: string
    bannerUrl: string
    tag: string
  } | null
  coreMembers: Member[]
  societies: Society[]
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        title: 'IEEE Sahrdaya Student Branch — Home',
      },
      {
        name: 'description',
        content:
          'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.',
      },
    ],
    links: [{ rel: 'canonical', href: '/' }],
  }),
  loader: async (): Promise<HomeData> => {
    const PB_URL = process.env.POCKETBASE_URL
    if (!PB_URL) throw new Error('Missing POCKETBASE_URL')

    const [eventsResult, execomResult, societiesRes] = await Promise.allSettled([
      fetch(
        `${PB_URL}/api/collections/events/records?perPage=1&filter=${encodeURIComponent('status="published"')}&sort=date&expand=society&skipTotal=1&fields=id,title,description,date,short_title,banner,event_type`,
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `${PB_URL}/api/collections/execom/records?perPage=20&filter=${encodeURIComponent('sectionId="core"')}&sort=order&skipTotal=1&fields=id,order,name,position,photo,linkedin,email,phone`,
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(`${PB_URL}/api/collections/societies/records?skipTotal=1&fields=id,name,slug,logo`).then(
        (r) => r.json(),
      ),
    ])

    const societies: Society[] =
      societiesRes.status === 'fulfilled'
        ? (societiesRes.value.items || []).map((s: Record<string, unknown>) => ({
            id: s.id as string,
            name: s.name as string,
            slug: s.slug as string,
            logoUrl: s.logo ? buildFileUrl('societies', s.id as string, s.logo as string) : undefined,
          }))
        : []

    const latestEvent =
      eventsResult.status === 'fulfilled' && eventsResult.value?.items?.[0]
        ? (() => {
            const ev = eventsResult.value.items[0] as Record<string, unknown>
            return {
              id: ev.id as string,
              title: ev.title as string,
              shortTitle: ev.short_title as string | undefined,
              description: (ev.description as string) || 'Join us for this exciting IEEE event!',
              date: ev.date as string,
              bannerUrl: ev.banner ? buildFileUrl('events', ev.id as string, ev.banner as string) : '',
              tag: (ev.event_type as string) || 'UPCOMING EVENT',
            }
          })()
        : null

    const coreMembers: Member[] =
      execomResult.status === 'fulfilled' && execomResult.value
        ? (execomResult.value.items || []).map((raw: Record<string, unknown>) => {
            const doc = raw as ExecomDoc
            const pos = (doc.position as string) || ''
            return {
              name: doc.name as string,
              role: pos,
              tagline: (POSITION_TAGLINES as Record<string, string>)[pos] || pos.toUpperCase(),
              image: doc.photo
                ? buildFileUrl('execom', doc.id as string, doc.photo)
                : '/placeholder-person.jpg',
              linkedin: doc.linkedin,
              email: doc.email,
              phone: doc.phone,
            }
          })
        : []

    return { latestEvent, coreMembers, societies }
  },
  component: Home,
})

function Home() {
  const { latestEvent, coreMembers, societies } = Route.useLoaderData()

  return (
    <div className="relative w-full bg-white text-gray-900 font-sans selection:bg-ieee-blue/20">
      <div id="home" className="absolute top-0 left-0 w-full h-1" />
      <div className="fixed inset-0 z-0 h-dvh overflow-hidden">
        <GridBackground />
        <FloatingIcons />
        <TechnicalDetails />
        <Hero />
      </div>
      <Navbar />
      <ErrorBoundary>
        <div className="relative z-10 mt-[100dvh]">
          <WhatsHappening latestEvent={latestEvent} societies={societies} />
          <Execom members={coreMembers} />
          <EventsShowcase />
          <Footer />
        </div>
      </ErrorBoundary>
      <FloatingAction />
    </div>
  )
}
