import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import EventsPageClient from "@/features/events/EventsPageClient";
import type { EventWithSociety } from "@/types";
import { getField, getExpand } from "@/lib/safe-get";
import { canRegisterForEvent } from "@/lib/event-lifecycle";

interface SerializableEvent {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: number;
  isPaid: boolean;
  bannerUrl: string;
  status: string;
  registrationOpen: boolean;
  maxCapacity: number;
  registeredCount: number;
  externalFormUrl?: string;
  collectIeeeMember?: boolean;
  society?: { id: string; name: string; slug: string; logoUrl: string };
}

const fetchEvents = createServerFn().handler(async (): Promise<SerializableEvent[]> => {
  try {
    const pb = createPB();
    // getFullList handles pagination internally so the public archive never
    // silently stops at the first 20 records.
    const records = await pb.collection("events").getFullList({
      batch: 200,
      filter: 'status="published" || status="completed"',
      sort: "date",
      expand: "society",
      fields:
        "id,created,updated,title,description,date,endDate,venue,price,banner,status,registrationOpen,registrationStart,registrationDeadline,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember,society,expand.society.id,expand.society.name,expand.society.slug,expand.society.logo",
    });

    return records.map((raw: Record<string, unknown>) => {
      const expand = getExpand(raw);
      const societyRaw = expand?.society;
      const society = societyRaw
        ? {
            id: getField(societyRaw, "id", ""),
            name: getField(societyRaw, "name", ""),
            slug: getField(societyRaw, "slug", ""),
            logoUrl: getField(societyRaw, "logo", "")
              ? buildFileUrl(
                  "societies",
                  getField(societyRaw, "id", ""),
                  getField(societyRaw, "logo", ""),
                )
              : "",
          }
        : undefined;
      const price = Number(getField(raw, "price", 0)) || 0;
      const status = getField(raw, "status", "published");
      const date = getField(raw, "date", "");
      const endDate = getField(raw, "endDate", "");
      const registrationStart = getField(raw, "registrationStart", "");
      const registrationDeadline = getField(raw, "registrationDeadline", "");
      const rawRegistrationOpen = !!getField(raw, "registrationOpen", false);
      const externalFormUrl = getField(raw, "externalFormUrl", "") || undefined;

      return {
        id: getField(raw, "id", ""),
        createdAt: getField(raw, "created", ""),
        updatedAt: getField(raw, "updated", ""),
        title: getField(raw, "title", ""),
        description: getField(raw, "description", ""),
        date,
        endDate,
        venue: getField(raw, "venue", ""),
        price,
        isPaid: price > 0,
        bannerUrl: getField(raw, "banner", "")
          ? buildFileUrl("events", getField(raw, "id", ""), getField(raw, "banner", ""))
          : "",
        status,
        // `registrationOpen` controls the internal IEEE form. An external form
        // is also a valid public registration action, but both paths are still
        // disabled when the event is completed/past or outside its window.
        registrationOpen: canRegisterForEvent({
          status,
          date,
          endDate,
          registrationOpen: rawRegistrationOpen || Boolean(externalFormUrl),
          registrationStart,
          registrationDeadline,
        }),
        maxCapacity: getField(raw, "maxCapacity", 0),
        registeredCount: getField(raw, "registeredCount", 0),
        externalFormUrl,
        collectIeeeMember: !!getField(raw, "collectIeeeMember", false),
        society,
      };
    });
  } catch {
    return [];
  }
});

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events | IEEE Sahrdaya Student Branch" },
      {
        name: "description",
        content:
          "Browse upcoming and past IEEE Sahrdaya events — workshops, hackathons, seminars, conferences and more. Explore technical events from 14 IEEE societies.",
      },
      { property: "og:title", content: "Events | IEEE Sahrdaya Student Branch" },
      {
        property: "og:description",
        content:
          "Browse upcoming and past IEEE Sahrdaya events — workshops, hackathons, seminars, conferences and more.",
      },
      { property: "og:url", content: `${APP_URL}/events` },
      { property: "og:image", content: `${APP_URL}/web.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/events` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
            { "@type": "ListItem", position: 2, name: "Events", item: `${APP_URL}/events` },
          ],
        })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026"),
      },
    ],
  }),
  loader: async ({ context }) => {
    const response = (context as unknown as { response?: { headers?: Headers } })?.response;
    // Publishing/editing an event should be reflected on the next navigation,
    // rather than serving a five-minute stale event catalogue.
    response?.headers?.set("Cache-Control", "no-cache, must-revalidate");
    return fetchEvents();
  },
  component: EventsPage,
});

function EventsPage() {
  const initialEvents = Route.useLoaderData();
  const appUrl = typeof window !== "undefined" ? window.location.origin : APP_URL;
  const itemListSchema =
    initialEvents.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: initialEvents.slice(0, 50).map((ev, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${appUrl}/events`,
            name: ev.title,
          })),
        }
      : null;
  return (
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
  );
}
