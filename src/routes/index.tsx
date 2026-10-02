import { useLoaderData, useRevalidator } from 'react-router'
import { APP_URL } from '@/lib/constants'
import { fetchHomeData, type HomeData } from '@/server/public/home.server'
import Navbar from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { StarsBackground } from '@/components/ui/stars-background'
import { ShootingStars } from '@/components/ui/shooting-stars'
import { TechnicalDetails } from '@/components/TechnicalDetails'
import { NowAtSahrdaya } from '@/components/home/NowAtSahrdaya'
import { Execom } from '@/components/Execom'
import { EventsShowcase } from '@/components/EventsShowcase'
import Footer from '@/components/Footer'
import { LatestSignals } from '@/components/home/LatestSignals'
import { FloatingAction } from '@/components/FloatingAction'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CanonicalLink } from "@/components/CanonicalLink";

const description = "Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.";

export const meta = () => [
  { title: "Home | IEEE Sahrdaya Student Branch" },
  { name: "description", content: description },
  { property: "og:title", content: "Home | IEEE Sahrdaya Student Branch" },
  { property: "og:description", content: description },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/` },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Home | IEEE Sahrdaya Student Branch" },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: `${APP_URL}/web.png` },
];

export async function loader(): Promise<HomeData> {
  return fetchHomeData();
}

export default function Home() {
  const revalidator = useRevalidator();
  const loaderData = (useLoaderData<typeof loader>() || {}) as HomeData
  const upcomingEvents = loaderData.upcomingEvents ?? []
  const upcomingCount = loaderData.upcomingCount ?? 0
  const societies = loaderData.societies ?? []
  const execomCount = loaderData.execomCount ?? 0
  const latestBlogs = loaderData.latestBlogs ?? []

  return (
    <>
      <CanonicalLink path="/" />
    <div className="relative w-full bg-white text-gray-900 font-sans selection:bg-ieee-blue/20">
      <Navbar />
      <main data-page-content tabIndex={-1}>
      <div className="relative isolate h-[max(78svh,560px)] overflow-hidden md:h-[max(84svh,640px)]">
        <StarsBackground starDensity={0.0004} allStarsTwinkle starColor="#1e293b" />
        <ShootingStars starColor="#00629b" trailColor="#0099D6" minDelay={1500} maxDelay={4000} minSpeed={8} maxSpeed={20} starWidth={12} starHeight={2} />
        <ShootingStars starColor="#00629b" trailColor="#0099D6" minDelay={2000} maxDelay={5000} minSpeed={12} maxSpeed={25} starWidth={10} starHeight={1} />
        <ShootingStars starColor="#0099D6" trailColor="#00629b" minDelay={3000} maxDelay={6000} minSpeed={10} maxSpeed={22} starWidth={8} starHeight={1} />
        <div className="relative z-10 h-full">
          <TechnicalDetails />
          <Hero nextEvent={upcomingEvents[0]} upcomingCount={upcomingCount} societyCount={societies.length} dataAvailable={!loaderData.unavailable?.some(section => section === "programme" || section === "communities")} />
        </div>
      </div>
      <ErrorBoundary>
        <div className="relative z-10">
          {loaderData.unavailable?.length > 0 && <div role="status" className="mx-auto max-w-5xl px-5 py-6 text-sm text-gray-600">Some {loaderData.unavailable.join(", ")} information is temporarily unavailable. <button type="button" onClick={() => void revalidator.revalidate()} disabled={revalidator.state === "loading"} className="ml-2 inline-flex min-h-11 items-center font-semibold text-ieee-blue">{revalidator.state === "loading" ? "Retrying…" : "Try again"}</button></div>}
          {!loaderData.unavailable?.some(section => section === "programme" || section === "communities" || section === "team") && <NowAtSahrdaya events={upcomingEvents} upcomingCount={upcomingCount} societyCount={societies.length} execomCount={execomCount} />}
          <Execom members={loaderData.coreTeam ?? []} />
          {/* Intentionally hardcoded visual showcase; live event data is used above. */}
          <EventsShowcase />
          <LatestSignals blogs={latestBlogs} />

        </div>
      </ErrorBoundary>
      </main>
      <Footer />
      <FloatingAction />
    </div>
    </>
  )
}
