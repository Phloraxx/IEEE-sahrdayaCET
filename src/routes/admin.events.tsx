import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { EventsTableClient } from "@/app/admin/events/EventsTableClient";
import { logError } from "@/lib/logger";

interface EventRow {
  id: string;
  title: string;
  date: string;
  endDate: string;
  venue: string;
  price: number;
  status: string;
  registrationOpen: boolean;
  maxCapacity: number;
  registeredCount: number;
  checkedInCount: number;
  isPaid: boolean;
  societyName: string;
  societyId: string;
}

const getEventsList = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") || "";
  const pb = createPB(cookieHeader);
  try {
    await requireRole(["admin", "chair"], pb);
    const result = await pb.collection("events").getList(1, 20, {
      sort: "-date",
      expand: "society",
      fields:
        "id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name",
    });

    const events: EventRow[] = result.items.map(
      (e: Record<string, unknown>) => {
        const expand = e.expand as Record<string, unknown> | undefined;
        const society = expand?.society as Record<string, unknown> | undefined;
        return {
          id: e.id as string,
          title: e.title as string,
          date: e.date as string,
          endDate: e.endDate as string,
          venue: e.venue as string,
          price: Number(e.price) || 0,
          status: (e.status as string) || "draft",
          registrationOpen: !!e.registrationOpen,
          maxCapacity: (e.maxCapacity as number) || 0,
          registeredCount: (e.registeredCount as number) || 0,
          checkedInCount: (e.checkedInCount as number) || 0,
          isPaid: Number(e.price) > 0,
          societyName: (society?.name as string) || "",
          societyId: (society?.id as string) || "",
        };
      },
    );

    return { events, total: result.totalItems };
  } catch (e) {
    logError("admin-events-list", e);
    return { events: [] as EventRow[], total: 0 };
  }
});

export const Route = createFileRoute("/admin/events")({
  loader: () => getEventsList(),
  component: AdminEventsPage,
});

function AdminEventsPage() {
  const { events, total } = Route.useLoaderData();
  return <EventsTableClient events={events} total={total} />;
}
