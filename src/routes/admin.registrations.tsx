import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { RegistrationsClient } from "@/app/admin/registrations/RegistrationsClient";

interface RegistrationRow {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt: string;
  ticketId: string;
  amount: number;
  createdAt: string;
  eventTitle: string;
  eventId: string;
}

interface EventOption {
  id: string;
  title: string;
}

interface RegData {
  registrations: RegistrationRow[];
  total: number;
  events: EventOption[];
}

const getRegistrationsData = createServerFn({ method: "GET" }).handler(
  async () => {
    const cookieHeader = getRequestHeader("cookie") || "";
    const pb = createPB(cookieHeader);
    try {
      await requireAuth(pb);
      const result = await pb.collection("registrations").getList(1, 50, {
        sort: "-registrationDate",
        expand: "event",
        fields:
          "id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand.event.id,expand.event.title",
      });

      const registrations: RegistrationRow[] = result.items.map(
        (r: Record<string, unknown>) => {
          const expand = r.expand as Record<string, unknown> | undefined;
          const event = expand?.event as Record<string, unknown> | undefined;
          return {
            id: r.id as string,
            userName: (r.userName as string) || "Unknown",
            userEmail: (r.userEmail as string) || "",
            userPhone: (r.userPhone as string) || "",
            registrationStatus: (r.registrationStatus as string) || "pending",
            paymentStatus: (r.paymentStatus as string) || "",
            checkedIn: !!r.checkedIn,
            checkedInAt: (r.checkedInAt as string) || "",
            ticketId: (r.ticketId as string) || "",
            amount: Number(r.amount) || 0,
            createdAt: (r.created as string) || "",
            eventTitle: (event?.title as string) || "",
            eventId: (event?.id as string) || "",
          };
        },
      );

      let events: EventOption[] = [];
      try {
        const eventsResult = await pb.collection("events").getFullList({
          fields: "id,title",
          sort: "-date",
        });
        events = (eventsResult || []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          title: (e.title as string) || "",
        }));
      } catch {
        /* non-fatal */
      }

      return {
        registrations,
        total: result.totalItems,
        events,
      } satisfies RegData;
    } catch {
      return { registrations: [], total: 0, events: [] } satisfies RegData;
    }
  },
);

export const Route = createFileRoute("/admin/registrations")({
  loader: () => getRegistrationsData(),
  component: AdminRegistrationsPage,
});

function AdminRegistrationsPage() {
  const { registrations, total, events } = Route.useLoaderData();
  return (
    <RegistrationsClient
      registrations={registrations}
      total={total}
      events={events}
    />
  );
}
