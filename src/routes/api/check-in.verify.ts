import { createFileRoute } from "@tanstack/react-router";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireRole, AuthError } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { checkInRegistration } from "@/lib/registration-service";
import { getField } from '@/lib/safe-get';
import { requireEventScope } from "@/lib/chair-scope";
import { z } from 'zod';
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/check-in/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin","chair"], pb);

          const BodySchema = z.object({
            ticketId: z.string().min(1),
            eventId: z.string().optional(),
          });
          const { ticketId, eventId } = BodySchema.parse(await request.json());
          if (!ticketId) {
            return Response.json(
              { error: "Missing required field: ticketId" },
              { status: 400 },
            );
          }

          // Lookup registration by ticket ID (optionally scoped to event)
          const filter = eventId
            ? `event = ${escapeFilterValue(eventId)} && (ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)})`
            : `ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)}`;

          const registration = await pb
            .collection("registrations")
            .getFirstListItem(filter, {
              fields: "id,event,registrationStatus,checkedIn,userName",
            })
            .catch(() => null);

          if (!registration) {
            return Response.json(
              { error: "Registration not found" },
              { status: 404 },
            );
          }


          // Derive eventId from registration if not provided
            const resolvedEventId = eventId || getField(registration, 'event', '');
          try {
            await requireEventScope(pb, user, resolvedEventId);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          if (!resolvedEventId) {
            return Response.json(
              { error: "Could not determine event" },
              { status: 400 },
            );
          }

          // Verify event exists and has check-in enabled
          const event = await pb
            .collection("events")
            .getOne(resolvedEventId, { fields: "id,checkInEnabled,title" })
            .catch(() => null);
          if (!event) {
            return Response.json({ error: "Event not found" }, { status: 404 });
          }

          if (!event.checkInEnabled) {
            return Response.json(
              { error: "Check-in is not enabled for this event" },
              { status: 400 },
            );
          }

          if (getField<string>(registration, 'registrationStatus', '') !== "confirmed") {
            return Response.json(
              { error: "Registration is not confirmed" },
              { status: 400 },
            );
          }
          if (getField(registration, 'checkedIn', false)) {
            return Response.json({ error: "Already checked in", registrationId: registration.id }, { status: 409 });
          }

          await checkInRegistration(pb, registration.id);
          return Response.json({
            success: true,
            message: "Checked in successfully",
            registration: {
              id: registration.id,
              userName: getField(registration, 'userName', '') as string,
              userEmail: '',
              eventTitle: getField(event, 'title', '') as string,
              ticketId: ticketId,
              checkedIn: true,
              checkedInAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          return handleError(error, "check-in-verify");
        }
      },
    },
  },
});
