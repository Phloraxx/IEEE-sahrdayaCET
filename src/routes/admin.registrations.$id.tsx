import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getPBWithRole } from "@/lib/admin-loader";
import { logError } from "@/lib/logger";
import { getField, getExpand } from "@/lib/safe-get";
import { RegistrationDetailClient } from "@/features/admin/RegistrationDetailClient";
import type { Registration } from "@/types";

const getRegistrationDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const pb = await getPBWithRole(["admin", "chair"]);
    try {
      const reg = await pb
      .collection("registrations")
      .getOne(id, { expand: "event" });
    const expand = getExpand(reg);
    const event = expand?.event;
    return {
      id: getField(reg, 'id', ''),
      userName: getField(reg, 'userName', ''),
      userEmail: getField(reg, 'userEmail', ''),
      userPhone: getField(reg, 'userPhone', ''),
      registrationStatus: getField(reg, 'registrationStatus', ''),
      paymentStatus: getField(reg, 'paymentStatus', ''),
      checkedIn: !!getField(reg, 'checkedIn', false),
      checkedInAt: getField(reg, 'checkedInAt', ''),
      ticketId: getField(reg, 'ticketId', ''),
      amount: Number(getField(reg, 'amount', 0)) || 0,
      couponCode: getField(reg, 'couponCode', ''),
      discountAmount: Number(getField(reg, 'discountAmount', 0)) || 0,
      paymentData: getField(reg, 'paymentData', null),
      formResponses: getField(reg, 'formResponses', null),
      createdAt: getField(reg, 'created', ''),
      eventTitle: getField(event, 'title', ''),
      eventId: getField(event, 'id', ''),
    } satisfies Registration;
    } catch (e) {
      logError("admin-reg-detail", e);
      throw new Error("Failed to load registration");
    }
  });

export const Route = createFileRoute("/admin/registrations/$id")({
  loader: async ({ params }) => getRegistrationDetail({ data: params.id }),
  component: function RouteComponent() {
    const reg = Route.useLoaderData();
    return <RegistrationDetailClient reg={reg} />;
  },
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});
