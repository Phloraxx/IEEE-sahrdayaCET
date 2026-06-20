import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import {
  checkInRegistration,
  cancelRegistration,
  RegistrationError,
} from "@/lib/registration-service";
import { REGISTRATION_STATUS, PAYMENT_STATUS } from "@/lib/constants";

export const Route = createFileRoute("/api/admin/registrations/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          const reg = await pb
            .collection("registrations")
            .getOne(id, { expand: "event" });
          const r = reg as unknown as Record<string, unknown>;
          const expand = r.expand as Record<string, unknown> | undefined;
          const event = expand?.event as Record<string, unknown> | undefined;

          return Response.json({
            registration: {
              id: r.id,
              userName: r.userName,
              userEmail: r.userEmail,
              userPhone: r.userPhone,
              registrationStatus: r.registrationStatus,
              paymentStatus: r.paymentStatus,
              checkedIn: !!r.checkedIn,
              checkedInAt: r.checkedInAt,
              ticketId: r.ticketId,
              amount: Number(r.amount) || 0,
              couponCode: r.couponCode || "",
              discountAmount: Number(r.discountAmount) || 0,
              paymentData: r.paymentData || null,
              formResponses: r.formResponses,
              createdAt: r.created,
              eventTitle: event?.title || "",
              eventId: event?.id || "",
            },
          });
        } catch (error) {
          return handleError(error, "admin-registrations-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);

          const body = (await request.json().catch(() => ({}))) as {
            checkedIn?: boolean;
            registrationStatus?: string;
            paymentStatus?: string;
            amount?: number;
          };

          if (body.checkedIn === true) {
            await checkInRegistration(pb, id);
            return Response.json({ success: true, action: "checked_in" });
          }
          if (body.registrationStatus === "cancelled") {
            await cancelRegistration(pb, id);
            return Response.json({ success: true, action: "cancelled" });
          }
          if (
            body.registrationStatus &&
            (REGISTRATION_STATUS as readonly string[]).includes(
              body.registrationStatus,
            )
          ) {
            await pb
              .collection("registrations")
              .update(id, { registrationStatus: body.registrationStatus });
            return Response.json({ success: true, action: "status_updated" });
          }
          if (
            body.paymentStatus &&
            (PAYMENT_STATUS as readonly string[]).includes(body.paymentStatus)
          ) {
            await pb
              .collection("registrations")
              .update(id, { paymentStatus: body.paymentStatus });
            return Response.json({ success: true, action: "payment_updated" });
          }
          if (typeof body.amount === "number" && body.amount >= 0) {
            await pb
              .collection("registrations")
              .update(id, { amount: body.amount });
            return Response.json({ success: true, action: "amount_updated" });
          }

          return Response.json(
            { error: "No valid action specified" },
            { status: 400 },
          );
        } catch (error) {
          if (error instanceof RegistrationError) {
            return Response.json(
              { error: error.message },
              { status: error.statusCode },
            );
          }
          return handleError(error, "admin-registrations-update");
        }
      },
    },
  },
});
