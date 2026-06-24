import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole, AuthError } from "@/lib/auth";
import { requireRegistrationScope } from "@/lib/chair-scope";
import { AdminRegistrationUpdateSchema } from "@/schemas/admin-registrations";
import { handleError } from "@/lib/api-error";
import {
  checkInRegistration,
  cancelRegistration,
  RegistrationError,
} from "@/lib/registration-service";
import { REGISTRATION_STATUS, PAYMENT_STATUS } from "@/lib/constants";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { getField, getExpand } from "@/lib/safe-get";

export const Route = createFileRoute("/api/admin/registrations/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin", "chair"], pb);
          try {
            await requireRegistrationScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          const reg = await pb
            .collection("registrations")
            .getOne(id, { expand: "event" });
          const expand = getExpand(reg);
          const event = expand?.event;

          return Response.json({
            registration: {
              id: getField(reg, 'id', ''),
              userName: getField(reg, 'userName', ''),
              userEmail: getField(reg, 'userEmail', ''),
              userPhone: getField(reg, 'userPhone', ''),
              registrationStatus: getField(reg, 'registrationStatus', ''),
              paymentStatus: getField(reg, 'paymentStatus', ''),
              checkedIn: !!getField(reg, 'checkedIn', false),
              checkedInAt: getField(reg, 'checkedInAt', null),
              ticketId: getField(reg, 'ticketId', ''),
              amount: Number(getField(reg, 'amount', 0)) || 0,
              couponCode: getField(reg, 'couponCode', ''),
              discountAmount: Number(getField(reg, 'discountAmount', 0)) || 0,
              paymentData: getField(reg, 'paymentData', null),
              formResponses: getField(reg, 'formResponses', null),
              createdAt: getField(reg, 'created', ''),
              eventTitle: getField(event, 'title', ''),
              eventId: getField(event, 'id', ''),
            },
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-registrations-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin", "chair"], pb);
          try {
            await requireRegistrationScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }

          const body = AdminRegistrationUpdateSchema.parse(await request.json().catch(() => ({})));

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
