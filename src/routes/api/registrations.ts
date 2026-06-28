import { createFileRoute } from "@tanstack/react-router";
import { createPB, buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { RegistrationError } from "@/lib/registration-service";
import { RegistrationBodySchema } from "@/schemas/registrations";
import { z } from "zod";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { getField, getExpand } from '@/lib/safe-get';

export const Route = createFileRoute("/api/registrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireAuth(pb);
          const url = new URL(request.url);
          const eventId = url.searchParams.get("eventId");
          const ticketId = url.searchParams.get("ticketId");

          const parts: string[] = [`user = ${escapeFilterValue(user.id)}`];
          if (eventId) parts.push(`event = ${escapeFilterValue(eventId)}`);
          if (ticketId)
            parts.push(
              `(ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)})`,
            );
          const filter = parts.join(" && ");

          const perPage = ticketId ? 1 : 50;
          const result = await pb
            .collection("registrations")
            .getList(1, perPage, {
              filter,
              sort: "-created",
              expand: "event",
              fields:
                "id,event,ticketId,paymentTicketId,paymentStatus,registrationStatus,formResponses,checkedIn,checkedInAt,created,registrationDate,expand",
            });

          const items = result.items.map((reg) => {
            const expand = getExpand(reg);
            const evt = expand?.event;
            return {
              id: getField(reg, 'id', ''),
              ticket: getField(reg, 'ticketId', '')
                ? {
                    id: getField(reg, 'ticketId', ''),
                    qr_data: getField(reg, 'ticketId', ''),
                    is_scanned: !!getField(reg, 'checkedIn', false),
                    scanned_at: getField(reg, 'checkedInAt', '') || null,
                    createdAt:
                      getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
                  }
                : null,
              event: evt
                ? {
                    id: getField(evt, 'id', ''),
                    title: getField(evt, 'title', ''),
                    description: getField(evt, 'description', ''),
                    date: getField(evt, 'date', ''),
                    venue: getField(evt, 'venue', ''),
                    price: Number(getField(evt, 'price', 0)) || 0,
                    bannerUrl: getField(evt, 'banner', '')
                      ? buildFileUrl(
                          "events",
                          getField(evt, 'id', ''),
                          getField(evt, 'banner', ''),
                        )
                      : "",
                    status: getField(evt, 'status', '') || "published",
                  }
                : null,
              registration: {
                id: getField(reg, 'id', ''),
                eventId: getField(reg, 'event', ''),
                paymentStatus: getField(reg, 'paymentStatus', '') || "pending",
                registrationStatus:
                  getField(reg, 'registrationStatus', '') || "pending",
                formResponses: getField(reg, 'formResponses', {}),
                createdAt:
                  getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
                updatedAt:
                  getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
              },
            };
          });

          return Response.json({
            items,
            total: result.totalItems,
            limit: result.perPage,
            page: result.page,
            totalPages: result.totalPages,
          });
        } catch (error) {
          return handleError(error, "registrations-get");
        }
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const userPb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireAuth(userPb);
          const parsed = RegistrationBodySchema.parse(await request.json());
          const { eventId, formResponses, couponCode } = parsed;

          // Create with the user's own client. The onRecordCreateRequest hook
          // (pb_hooks/registrations.pb.js) enforces all business rules,
          // pins the user to the caller, and sets server-authoritative
          // fields (paymentStatus, registrationStatus, ticketId, amount).
          const registration = await userPb.collection("registrations").create({
            user: user.id,
            event: eventId,
            userName: getField(formResponses, 'name', ''),
            userEmail: getField(formResponses, 'email', ''),
            userPhone: getField(formResponses, 'phone', ''),
            formResponses,
            couponCode: couponCode || '',
          });

          // Read back the server-set fields the hook wrote (paymentTicketId,
          // ticketId, paymentStatus, registrationStatus, amount).
          const created = await userPb.collection("registrations").getOne(registration.id, {
            fields: "id,ticketId,paymentTicketId,paymentStatus,registrationStatus,amount",
          });

          const isFree = getField<string>(created, 'paymentStatus', '') === 'not_required';
          const paymentTicketId = getField<string>(created, 'paymentTicketId', '');
          const ticketId = getField<string>(created, 'ticketId', '');

          return Response.json({
            registrationId: registration.id,
            ticketId: isFree ? ticketId : (paymentTicketId || registration.id),
            paymentRequired: !isFree,
            amount: Number(getField(created, 'amount', 0)) || 0,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            const messages = error.issues
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; ");
            return Response.json(
              { error: `Validation failed: ${messages}` },
              { status: 400 },
            );
          }
          if (error instanceof RegistrationError) {
            return Response.json(
              { error: error.message },
              { status: error.statusCode },
            );
          }
          return handleError(error, "registrations-post");
        }
      },
    },
  },
});
