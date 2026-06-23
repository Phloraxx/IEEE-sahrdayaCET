import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getPBWithRole } from "@/lib/admin-loader"
import { escapeFilterValue } from "@/lib/pb"
import { logError } from "@/lib/logger"
import { getField, getExpand } from "@/lib/safe-get"
import { EventDetailClient } from "@/features/admin/EventDetailClient";
import type { Registration } from "@/types";
import type { EventData } from "@/features/admin/EventDetailClient";

type RegistrationItem = Pick<Registration, 'id' | 'userName' | 'userEmail' | 'userPhone' | 'registrationStatus' | 'paymentStatus' | 'checkedIn' | 'checkedInAt' | 'ticketId' | 'amount' | 'createdAt'>;

const getEventDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const pb = await getPBWithRole(["admin", "chair"])
    try {
      const eventRecord = await pb.collection("events").getOne(id, {
        expand: "society",
        fields:
          "id,title,description,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name,registrationDeadline,contactEmail,contactPhone",
      })

      const expand = getExpand(eventRecord);
      const society = expand?.society;

      const event: EventData = {
        id: getField(eventRecord, 'id', ''),
        title: getField(eventRecord, 'title', ''),
        description: getField(eventRecord, 'description', ''),
        date: getField(eventRecord, 'date', ''),
        endDate: getField(eventRecord, 'endDate', ''),
        venue: getField(eventRecord, 'venue', ''),
        price: Number(getField(eventRecord, 'price', 0)) || 0,
        status: getField(eventRecord, 'status', 'draft'),
        registrationOpen: !!getField(eventRecord, 'registrationOpen', false),
        maxCapacity: getField(eventRecord, 'maxCapacity', 0),
        registeredCount: getField(eventRecord, 'registeredCount', 0),
        checkedInCount: getField(eventRecord, 'checkedInCount', 0),
        isPaid: Number(getField(eventRecord, 'price', 0)) > 0,
        societyName: society ? getField(society, 'name', '') : '',
        registrationDeadline: getField(eventRecord, 'registrationDeadline', ''),
        contactEmail: getField(eventRecord, 'contactEmail', ''),
        contactPhone: getField(eventRecord, 'contactPhone', ''),
      }
      const regRecords = await pb.collection("registrations").getFullList({
        filter: `event = ${escapeFilterValue(id)}`,
        sort: "-created",
      })
      const registrations: RegistrationItem[] = regRecords.map((r: Record<string, unknown>) => ({
        id: getField(r, 'id', ''),
        userName: getField(r, 'userName', ''),
        userEmail: getField(r, 'userEmail', ''),
        userPhone: getField(r, 'userPhone', ''),
        registrationStatus: getField(r, 'registrationStatus', ''),
        paymentStatus: getField(r, 'paymentStatus', ''),
        checkedIn: !!getField(r, 'checkedIn', false),
        checkedInAt: getField(r, 'checkedInAt', ''),
        ticketId: getField(r, 'ticketId', ''),
        amount: Number(getField(r, 'amount', 0)) || 0,
        createdAt: getField(r, 'created', ''),
      }))
      return { event, registrations }
    } catch (e) {
      logError('getEventDetail', e)
      throw new Error('Failed to load event details')
    }
  })

export const Route = createFileRoute("/admin/events/$id")({
  loader: async ({ params }) => getEventDetail({ data: params.id }),
  component: RouteComponent,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
})

function RouteComponent() {
  const { event, registrations } = Route.useLoaderData() as { event: EventData; registrations: RegistrationItem[] }
  return <EventDetailClient event={event} registrations={registrations} />
}
