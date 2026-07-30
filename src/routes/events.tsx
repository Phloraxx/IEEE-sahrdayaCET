import { useLoaderData } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import { fetchEvents, type SerializableEvent } from "@/server/public/events.server";
import EventsPageClient from "@/features/events/EventsPageClient";
import type { EventWithSociety } from "@/types";
import { CanonicalLink } from "@/components/CanonicalLink";

const description = "Browse upcoming and past IEEE Sahrdaya events — workshops, hackathons, seminars, conferences and more.";

export const meta = () => [
  { title: "Events | IEEE Sahrdaya Student Branch" },
  { name: "description", content: description },
  { property: "og:title", content: "Events | IEEE Sahrdaya Student Branch" },
  { property: "og:description", content: description },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/events` },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Events | IEEE Sahrdaya Student Branch" },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: `${APP_URL}/web.png` },
];

export async function loader(): Promise<SerializableEvent[]> {
  return fetchEvents();
}

export default function EventsPage() {
  const initialEvents = useLoaderData<typeof loader>();
  const appUrl = APP_URL;
  const itemListSchema =
    initialEvents.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: initialEvents.slice(0, 50).map((ev, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${appUrl}/events/${ev.slug}`,
            name: ev.title,
          })),
        }
      : null;
  return (
    <>
      <CanonicalLink path="/events" />
    <>
      {itemListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListSchema)
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e")
              .replace(/&/g, "\\u0026"),
          }}
        />
      )}
      <ErrorBoundary>
        <EventsPageClient initialEvents={initialEvents as EventWithSociety[]} />
      </ErrorBoundary>
    </>
    </>
  );
}
