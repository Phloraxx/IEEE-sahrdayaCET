import { createServerFn } from "@tanstack/react-start";
import { createPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import { getField } from "@/lib/safe-get";
import { createFileRoute } from "@tanstack/react-router";
import RegisterPage from "@/features/register/RegisterPage";

const fetchEventForRegistration = createServerFn()
  .validator((eventId: string) => eventId)
  .handler(async ({ data: eventId }) => {
    const pb = createPB();
    const record = await pb.collection("events").getOne(eventId);
    if (!record) throw new Error("Event not found");
    const price = Number(getField(record, "price", 0)) || 0;
    const bannerRaw = getField(record, "banner", "");
    const event = {
      id: getField(record, "id", ""),
      title: getField(record, "title", ""),
      description: getField(record, "description", ""),
      date: getField(record, "date", ""),
      endDate: getField(record, "endDate", ""),
      venue: getField(record, "venue", ""),
      price,
      isPaid: price > 0,
      bannerUrl: bannerRaw ? buildFileUrl("events", eventId, bannerRaw) : "",
      registrationOpen: !!getField(record, "registrationOpen", false),
      maxCapacity: getField(record, "maxCapacity", 0),
      registeredCount: getField(record, "registeredCount", 0),
      collectIeeeMember: !!getField(record, "collectIeeeMember", false),
      formFields:
        getField(record, "formFields", undefined) ||
        getField(record, "formTemplate", undefined),
    };
    return { event };
  });

export const Route = createFileRoute("/register/$eventId")({
  loader: async ({ params }) => fetchEventForRegistration({ data: params.eventId }),
  head: () => ({
    meta: [
      { title: "Register | IEEE Sahrdaya Student Branch" },
      { name: "description", content: "Register for an IEEE Sahrdaya event" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RouteRegister,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function RouteRegister() {
  const { event } = Route.useLoaderData();
  const { eventId } = Route.useParams();
  return <RegisterPage eventId={eventId} initialEvent={event} />;
}
