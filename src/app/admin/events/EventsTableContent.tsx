import { createPB } from "@/lib/pb";
import { PB_AUTH_COOKIE } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import { getRequestHeader } from "@tanstack/react-start/server";
import { EventsTableClient } from "./EventsTableClient";
import { logError } from "@/lib/logger";

export async function EventsTableContent() {
  const cookieHeader = getRequestHeader("cookie") || "";
  const pb = createPB(cookieHeader);
  try {
    const result = await pb.collection("events").getList(1, 20, {
      sort: "-date",
      expand: "society",
      fields:
        "id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name",
    });

    const events = result.items.map((e: Record<string, unknown>) => {
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
    });

    return <EventsTableClient events={events} total={result.totalItems} />;
  } catch (e) {
    logError("admin-events-list", e);
    return <EventsTableClient events={[]} total={0} />;
  }
}
