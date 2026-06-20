import { createFileRoute } from "@tanstack/react-router";
import { pbFetch, buildFileUrl } from "@/lib/pb";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import EventsPageClient from "@/app/(main)/events/EventsPageClient";
import type { EventWithSociety } from "@/types";

interface EventItem {
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

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events" },
      {
        name: "description",
        content:
          "Browse upcoming IEEE Sahrdaya events — workshops, hackathons, seminars, conferences and more.",
      },
    ],
    links: [{ rel: "canonical", href: "/events" }],
  }),
  loader: async (): Promise<EventItem[]> => {
    const PB_URL = process.env.POCKETBASE_URL;
    if (!PB_URL) throw new Error("Missing POCKETBASE_URL");

    try {
      const result = await pbFetch<{ items: Record<string, unknown>[] }>(
        `${PB_URL}/api/collections/events/records?perPage=20&filter=${encodeURIComponent('status="published"')}&sort=date&expand=society&skipTotal=1&fields=id,title,description,date,endDate,venue,price,banner,status,registrationOpen,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember`,
      );
      return (result?.items || []).map((raw: Record<string, unknown>) => {
        const expand = raw.expand as Record<string, unknown> | undefined;
        const societyData = (
          raw.society && typeof raw.society === "object"
            ? raw.society
            : expand?.society
        ) as Record<string, unknown> | undefined;
        const society = societyData
          ? {
              id: societyData.id as string,
              name: societyData.name as string,
              slug: societyData.slug as string,
              logoUrl: societyData.logo
                ? buildFileUrl(
                    "societies",
                    societyData.id as string,
                    societyData.logo as string,
                  )
                : "",
            }
          : undefined;
        const price = Number(raw.price) || 0;
        return {
          id: raw.id as string,
          createdAt: (raw.created as string) || "",
          updatedAt: (raw.updated as string) || "",
          title: (raw.title as string) || "",
          description: (raw.description as string) || "",
          date: (raw.date as string) || "",
          endDate: (raw.endDate as string) || "",
          venue: (raw.venue as string) || "",
          price,
          isPaid: price > 0,
          bannerUrl: raw.banner
            ? buildFileUrl("events", raw.id as string, raw.banner as string)
            : "",
          status: (raw.status as string) || "published",
          registrationOpen: !!raw.registrationOpen,
          maxCapacity: (raw.maxCapacity as number) || 0,
          registeredCount: (raw.registeredCount as number) || 0,
          externalFormUrl: (raw.externalFormUrl as string) || undefined,
          collectIeeeMember: !!raw.collectIeeeMember,
          society,
        };
      });
    } catch {
      return [];
    }
  },
  component: EventsPage,
});

function EventsPage() {
  const initialEvents = Route.useLoaderData();
  return (
    <ErrorBoundary>
      <EventsPageClient initialEvents={initialEvents as EventWithSociety[]} />
    </ErrorBoundary>
  );
}
