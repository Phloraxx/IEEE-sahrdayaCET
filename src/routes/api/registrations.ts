import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"; import { buildFileUrl, escapeFilterValue } from "@/lib/pb"
import { requireAuth } from "@/lib/auth";
import { handleError, RegistrationError } from "@/lib/api-error";
import { RegistrationBodySchema } from "@/schemas/registrations";
import { z } from "zod";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { getField, getExpand } from '@/lib/safe-get';
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
          const rl = checkRateLimit({ key: `reg:${user.id}`, max: 10, windowMs: 60_000 })
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)
          const parsed = RegistrationBodySchema.parse(await request.json());
          const { eventId, formResponses, couponCode } = parsed;

          // NEW-1: Enforce registration business rules before create
          const eventRecord = await userPb.collection("events").getOne(eventId, {
            fields: "price,status,maxCapacity,registrationOpen,registrationDeadline,formTemplate,registeredCount",
          });
          const eventStatus = getField<string>(eventRecord, 'status', '');
          if (eventStatus === 'cancelled' || eventStatus === 'draft') {
            return Response.json({ error: 'Event is not accepting registrations' }, { status: 400 });
          }
          if (!getField<boolean>(eventRecord, 'registrationOpen', false)) {
            return Response.json({ error: 'Registration is closed for this event' }, { status: 400 });
          }
          const deadline = getField<string>(eventRecord, 'registrationDeadline', '');
          if (deadline && new Date(deadline) < new Date()) {
            return Response.json({ error: 'Registration deadline has passed' }, { status: 400 });
          }
          const maxCapacity = Number(getField(eventRecord, 'maxCapacity', 0)) || 0;
          if (maxCapacity > 0) {
            const registeredCount = Number(getField(eventRecord, 'registeredCount', 0)) || 0;
            if (registeredCount >= maxCapacity) {
              return Response.json({ error: 'Event is at full capacity' }, { status: 400 });
            }
          }
          // Basic form validation: check required fields if formTemplate defined
          const formTemplate = getField<Array<{id: string; required?: boolean}>>(eventRecord, 'formTemplate', []);
          if (Array.isArray(formTemplate) && formTemplate.length > 0) {
            const requiredFields = formTemplate.filter((f: {required?: boolean}) => f.required).map((f: {id: string}) => f.id);
            for (const fieldId of requiredFields) {
              const val = formResponses?.[fieldId];
              if (val === undefined || val === null || val === '') {
                return Response.json({ error: `Required field "${fieldId}" is missing` }, { status: 400 });
              }
            }
          }

          // Create with the user's own client. API rules enforce auth + user match.
          const registration = await userPb.collection("registrations").create({
            user: user.id,
            event: eventId,
            userName: getField(formResponses, 'name', ''),
            userEmail: getField(formResponses, 'email', ''),
            userPhone: getField(formResponses, 'phone', ''),
            formResponses,
            couponCode: couponCode || '',
          });

          // Read back the hook-populated fields (pb_hooks sets amount,
          // paymentStatus, ticketId, etc. via DAO after create)
          const created = await userPb.collection("registrations").getOne(registration.id, {
            fields: "id,ticketId,paymentTicketId,paymentStatus,registrationStatus,amount",
          });
          // Determine payment status from hook-set fields
          const readAmount = Number(getField(created, 'amount', 0)) || 0;
          const readTicketId = getField<string>(created, 'ticketId', '');
          const readPaymentTicketId = getField<string>(created, 'paymentTicketId', '');
          const readPaymentStatus = getField<string>(created, 'paymentStatus', '');
          const paymentRequired = readPaymentStatus === 'pending' || readPaymentStatus === 'paid';
          const displayId = readTicketId || readPaymentTicketId || registration.id;

          return Response.json({
            registrationId: registration.id,
            ticketId: displayId,
            paymentRequired,
            amount: readAmount,
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
