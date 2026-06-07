import type { Metadata } from 'next';
import type { Member, Society } from '@/types'
import { createPB } from '@/lib/pb'

export const dynamic = 'force-dynamic'
import Navbar from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { GridBackground } from '@/components/GridBackground';
import { TechnicalDetails } from '@/components/TechnicalDetails';
import { FloatingIcons } from '@/components/FloatingIcons';
import { WhatsHappening } from '@/components/WhatsHappening';
import { Execom } from '@/components/Execom';
import { EventsShowcase } from '@/components/EventsShowcase';
import Footer from '@/components/Footer';

interface ExecomDoc extends Record<string, unknown> { photo?: string; linkedin?: string; email?: string; phone?: string }

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

export default async function Home() {
  const pb = createPB()

  const [eventsResult, execomResult, societiesRes] = await Promise.allSettled([
    pb.collection('events').getList(1, 1, { filter: 'status="published"', sort: 'date', expand: 'society' }),
    pb.collection('execom').getList(1, 20, { filter: 'sectionId="core"', sort: 'order' }),
    fetch(`${process.env.POCKETBASE_URL}/api/collections/societies/records?sort=displayOrder&skipTotal=1&fields=id,name,slug,logo`).then(r => r.json()),
  ])

  const societies: Society[] = societiesRes.status === 'fulfilled'
    ? (societiesRes.value.items || []).map((s: Record<string, unknown>) => {
        const logoFileName = s.logo as string | undefined
        return {
          id: s.id as string,
          name: s.name as string,
          slug: s.slug as string,
          logoUrl: logoFileName
            ? `${process.env.POCKETBASE_URL}/api/files/societies/${s.id}/${logoFileName}`
            : undefined,
        }
      })
    : []

  const latestEvent = eventsResult.status === 'fulfilled' && eventsResult.value.items[0]
    ? {
        id: eventsResult.value.items[0].id,
        title: eventsResult.value.items[0].title,
        shortTitle: eventsResult.value.items[0].short_title as string | undefined,
        description: eventsResult.value.items[0].description || 'Join us for this exciting IEEE event!',
        date: eventsResult.value.items[0].date,
        bannerUrl: eventsResult.value.items[0].banner
          ? `${process.env.POCKETBASE_URL}/api/files/events/${eventsResult.value.items[0].id}/${eventsResult.value.items[0].banner}`
          : '',
        tag: eventsResult.value.items[0].event_type || 'UPCOMING EVENT',
      }
    : null

  const coreMembers: Member[] = execomResult.status === 'fulfilled'
    ? (execomResult.value.items || []).map((raw: Record<string, unknown>) => {
        const doc = raw as ExecomDoc
        const pos = (doc.position as string) || ''
        return {
          name: doc.name as string,
          role: pos,
          tagline: (POSITION_TAGLINES as Record<string, string>)[pos] || pos.toUpperCase(),
          image: doc.photo
            ? `${process.env.POCKETBASE_URL}/api/files/execom/${doc.id}/${doc.photo}`
            : '/placeholder-person.jpg',
          linkedin: doc.linkedin,
          email: doc.email,
          phone: doc.phone,
        }
      })
    : []

  return (
    <div className="relative w-full bg-white text-gray-900 font-sans selection:bg-ieee-blue/20">
      <div id="home" className="absolute top-0 left-0 w-full h-1" />
      <div className="fixed inset-0 z-0 h-[100dvh] overflow-hidden">
        <GridBackground />
        <FloatingIcons />
        <TechnicalDetails />
        <Hero />
      </div>
      <Navbar />
      <div className="relative z-10 mt-[100dvh]">
        <WhatsHappening latestEvent={latestEvent} societies={societies} />
        <Execom members={coreMembers} />
        <EventsShowcase />
        <Footer />
      </div>
    </div>
  );
}
