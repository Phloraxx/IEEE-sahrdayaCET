import { createFileRoute } from '@tanstack/react-router'
import { getField } from '@/lib/safe-get';
import type { Society } from '@/types'
import { createPB, buildFileUrl } from '@/lib/pb'
import { APP_URL } from "@/lib/constants";
import Navbar from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { DotPattern } from '@/components/ui/dot-pattern'
import { ShootingStars } from '@/components/ui/shooting-stars'
import { WhatsHappening } from '@/components/WhatsHappening'
import { Execom } from '@/components/Execom'
import { EventsShowcase } from '@/components/EventsShowcase'
import Footer from '@/components/Footer'
import { FloatingAction } from '@/components/FloatingAction'
import { ErrorBoundary } from '@/components/ErrorBoundary'



interface HomeData {
  latestEvent: {
    id: string
    title: string
    description: string
    date: string
    bannerUrl: string
  } | null
  societies: Society[]
  eventItems: Array<{ id: string; bannerUrl: string; title: string }>
}

export const Route = createFileRoute('/')({
  head: ({ loaderData }) => {
    const data = loaderData as unknown as HomeData | undefined;
    const preload = data?.latestEvent?.bannerUrl
      ? [{ rel: 'preload', as: 'image', href: data.latestEvent.bannerUrl }]
      : [];
    return {
      meta: [
        {
          title: 'Home | IEEE Sahrdaya Student Branch',
        },
        {
          name: 'description',
          content:
            'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.',
        },
        { property: 'og:title', content: 'Home | IEEE Sahrdaya Student Branch' },
        {
          property: 'og:description',
          content:
            'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.',
        },
        { property: 'og:image', content: `${APP_URL}/web.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:url', content: `${APP_URL}/` },
      ],
      links: [
        { rel: 'canonical', href: '/' },
        ...preload,
      ],
      scripts: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
            ],
          }),
        },
      ],
    };
  },
  loader: async ({ context }): Promise<HomeData> => {
    try {
      const response = (context as unknown as { response: { headers: Headers } }).response;
      response.headers.set('Cache-Control', 'public, max-age=300');
      const pb = createPB();
      const [eventsResult, societiesRes] = await Promise.allSettled([
        pb.collection("events").getList(1, 20, {
          filter: 'status="published"',
          sort: "-date",
          skipTotal: true,
          fields: "id,title,description,date,banner",
        }),
        pb.collection("societies").getList(1, 200, {
          skipTotal: true,
          fields: "id,name,slug,logo",
        }),
      ]);

      const societies: Society[] =
        societiesRes.status === "fulfilled"
          ? (societiesRes.value.items || []).map((s: Record<string, unknown>) => ({
              id: getField(s, 'id', ''),
              name: getField(s, 'name', ''),
              slug: getField(s, 'slug', ''),
              logoUrl: s.logo ? buildFileUrl("societies", getField(s, 'id', ''), getField(s, 'logo', '')) : undefined,
            }))
          : [];

      const latestEvent =
        eventsResult.status === "fulfilled" && eventsResult.value?.items?.[0]
          ? (() => {
              const ev = eventsResult.value.items[0];
              return {
                id: getField(ev, 'id', ''),
                title: getField(ev, 'title', ''),
                description: getField(ev, 'description', 'Join us for this exciting IEEE event!'),
                date: getField(ev, 'date', ''),
                bannerUrl: ev.banner ? buildFileUrl("events", getField(ev, 'id', ''), getField(ev, 'banner', '')) : "",
              };
            })()
          : null;

      const eventItems: Array<{ id: string; bannerUrl: string; title: string }> =
        eventsResult.status === "fulfilled" && eventsResult.value?.items
          ? eventsResult.value.items.slice(0, 20).map((ev) => ({
              id: getField(ev, 'id', ''),
              title: getField(ev, 'title', ''),
              bannerUrl: ev.banner
                ? buildFileUrl("events", getField(ev, 'id', ''), getField(ev, 'banner', ''))
                : "",
            }))
          : [];

      return { latestEvent, societies, eventItems };
    } catch {
      return { latestEvent: null, societies: [], eventItems: [] };
    }
  },
  component: Home,
  errorComponent: ({ error }) => (
    <div className="flex items-center justify-center min-h-screen bg-white px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-2xl font-bold text-red-600">!</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-500 mb-4">{error?.message || 'An unexpected error occurred'}</p>
      </div>
    </div>
  ),
})

function Home() {
  const loaderData = (Route.useLoaderData() || {}) as HomeData
  const latestEvent = loaderData.latestEvent ?? null
  const societies = loaderData.societies ?? []

  return (
    <div className="relative w-full bg-white text-gray-900 font-sans selection:bg-ieee-blue/20">
      <div id="home" className="absolute top-0 left-0 w-full h-1" />
      <div className="fixed inset-0 z-0 h-dvh overflow-hidden">
        <DotPattern
          width={32}
          height={32}
          cr={2.5}
          glow
          className="text-neutral-300"
        />
        <ShootingStars starColor="#00629b" trailColor="#0099D6" minDelay={2000} maxDelay={5000} />
        <Hero />
      </div>
      <Navbar />
      <ErrorBoundary>
        <div className="relative z-10 mt-[100dvh]">
          <WhatsHappening latestEvent={latestEvent} societies={societies} />
          <Execom />
          <EventsShowcase />
          <Footer />
        </div>
      </ErrorBoundary>
      <FloatingAction />
    </div>
  )
}
