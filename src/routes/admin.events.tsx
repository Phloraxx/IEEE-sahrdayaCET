import { createFileRoute } from "@tanstack/react-router";
import { getField, getExpand } from "@/lib/safe-get";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import { EventsTableClient } from "@/features/admin/EventsTableClient";
import type { Event } from "@/types";

export interface EventRow extends Pick<Event, 'id' | 'title' | 'date' | 'endDate' | 'venue' | 'price' | 'status' | 'registrationOpen' | 'maxCapacity' | 'registeredCount' | 'checkedInCount'> {
  isPaid: boolean;
  societyName: string;
  societyId: string;
}

export interface EventsLoaderData {
  events: EventRow[];
  total: number;
}

const EMPTY: EventsLoaderData = { events: [], total: 0 };

const getEventsList = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const result = await pb.collection("events").getList(1, 20, {
        sort: "-date",
        expand: "society",
        fields:
          "id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name",
      });

      const events: EventRow[] = result.items.map((e) => {
        const expand = getExpand(e);
        const society = expand?.society;
        return {
          id: getField(e, 'id', ''),
          title: getField(e, 'title', ''),
          date: getField(e, 'date', ''),
          endDate: getField(e, 'endDate', '') || "",
          venue: getField(e, 'venue', ''),
          price: Number(getField(e, 'price', 0)) || 0,
          status: getField(e, 'status', 'draft'),
          registrationOpen: !!getField(e, 'registrationOpen', false),
          maxCapacity: Number(getField(e, 'maxCapacity', 0)) || 0,
          registeredCount: Number(getField(e, 'registeredCount', 0)) || 0,
          checkedInCount: Number(getField(e, 'checkedInCount', 0)) || 0,
          isPaid: Number(getField(e, 'price', 0)) > 0,
          societyName: getField(society, 'name', ''),
          societyId: getField(society, 'id', ''),
        };
      });

      return { events, total: result.totalItems } satisfies EventsLoaderData;
    },
    EMPTY,
    { context: "admin-events-list" },
  ),
);

export const Route = createFileRoute("/admin/events")({
  loader: () => getEventsList(),
  component: AdminEventsPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminEventsPage() {
  const { events, total } = Route.useLoaderData();
  return <EventsTableClient events={events} total={total} />;
}
