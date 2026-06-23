import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import { RegistrationsClient } from "@/features/admin/RegistrationsClient";
import { getField, getExpand } from "@/lib/safe-get";

import type { Registration } from "@/types";
export type RegistrationRow = Pick<Registration, 'id' | 'userName' | 'userEmail' | 'userPhone' | 'registrationStatus' | 'paymentStatus' | 'checkedIn' | 'checkedInAt' | 'ticketId' | 'amount' | 'createdAt' | 'eventTitle' | 'eventId'>;

export interface EventOption {
  id: string;
  title: string;
}

export interface RegistrationsLoaderData {
  registrations: RegistrationRow[];
  total: number;
  events: EventOption[];
}

const EMPTY: RegistrationsLoaderData = { registrations: [], total: 0, events: [] };

const getRegistrationsData = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const result = await pb.collection("registrations").getList(1, 50, {
        sort: "-registrationDate",
        expand: "event",
        fields:
          "id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand.event.id,expand.event.title",
      });

      const registrations: RegistrationRow[] = result.items.map((r: Record<string, unknown>) => {
        const expand = getExpand(r);
        const event = expand?.event;
        return {
          id: getField(r, 'id', ''),
          userName: getField(r, 'userName', 'Unknown'),
          userEmail: getField(r, 'userEmail', ''),
          userPhone: getField(r, 'userPhone', ''),
          registrationStatus: getField(r, 'registrationStatus', 'pending'),
          paymentStatus: getField(r, 'paymentStatus', ''),
          checkedIn: !!getField(r, 'checkedIn', false),
          checkedInAt: getField(r, 'checkedInAt', ''),
          ticketId: getField(r, 'ticketId', ''),
          amount: Number(getField(r, 'amount', 0)) || 0,
          createdAt: getField(r, 'created', ''),
          eventTitle: getField(event, 'title', ''),
          eventId: getField(event, 'id', ''),
        };
      });

      let events: EventOption[] = [];
      try {
        const eventsResult = await pb.collection("events").getFullList({
          fields: "id,title",
          sort: "-date",
        });
        events = eventsResult.map((e: Record<string, unknown>) => ({
          id: getField(e, 'id', ''),
          title: getField(e, 'title', ''),
        }));
      } catch {
        // non-fatal — event filter list is optional
      }

      return { registrations, total: result.totalItems, events } satisfies RegistrationsLoaderData;
    },
    EMPTY,
    { context: "admin-registrations-list", roles: ["admin", "chair"] },
  ),
);

export const Route = createFileRoute("/admin/registrations")({
  loader: () => getRegistrationsData(),
  component: AdminRegistrationsPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminRegistrationsPage() {
  const { registrations, total, events } = Route.useLoaderData();
  return <RegistrationsClient registrations={registrations} total={total} events={events} />;
}
