import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/features/societies/SocietiesClient";
import type { Society } from "@/types";
import { fetchSocieties } from "@/server/public/societies.server";
import { fetchEvents } from "@/server/public/events.server";
import { CanonicalLink } from "@/components/CanonicalLink";

const description = "Explore technical societies under IEEE Sahrdaya Student Branch — Computer Society, RAS, WIE, IAS, PES and more.";

export const meta = () => [
  { title: "Societies | IEEE Sahrdaya Student Branch" },
  { name: "description", content: description },
  { property: "og:title", content: "Societies | IEEE Sahrdaya Student Branch" },
  { property: "og:description", content: description },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/societies` },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Societies | IEEE Sahrdaya Student Branch" },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: `${APP_URL}/web.png` },
];

export interface SocietyActivitySignal {
  eventCount: number;
  nextEvent?: { title: string; slug: string; date: string };
}

export async function loader(): Promise<{ societies: Society[]; activityBySociety: Record<string, SocietyActivitySignal> }> {
  const [societies, events] = await Promise.all([fetchSocieties(), fetchEvents()]);
  const now = Date.now();
  const activityBySociety: Record<string, SocietyActivitySignal> = {};

  for (const event of events) {
    if (event.status !== "published" || !event.society?.id) continue;
    const eventTime = Date.parse(event.date);
    if (!Number.isFinite(eventTime) || eventTime < now) continue;
    const signal = activityBySociety[event.society.id] ?? { eventCount: 0 };
    signal.eventCount += 1;
    if (!signal.nextEvent || eventTime < Date.parse(signal.nextEvent.date)) {
      signal.nextEvent = { title: event.title, slug: event.slug, date: event.date };
    }
    activityBySociety[event.society.id] = signal;
  }

  return { societies, activityBySociety };
}

export default function SocietiesPage() {
  const { societies, activityBySociety } = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path="/societies" />
    <ErrorBoundary>
      <SocietiesClient societies={societies} activityBySociety={activityBySociety} />
    </ErrorBoundary>
    </>
  );
}
