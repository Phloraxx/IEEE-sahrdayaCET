import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"; import { escapeFilterValue } from "@/lib/pb"
import { requireRole, AuthError } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField } from '@/lib/safe-get';
import { requireEventScope } from "@/lib/chair-scope";
import { z } from 'zod';
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const Route = createFileRoute("/api/check-in/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin","chair"], pb);
          const rl = checkRateLimit({ key: `checkin:${user.id}`, max: 60, windowMs: 60_000 })
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }

          const BodySchema = z.object({
            ticketId: z.string().min(1),
            eventId: z.string().optional(),
          });
          const { ticketId, eventId } = BodySchema.parse(await request.json());

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

          await pb.collection("registrations").update(registration.id, {
            checkedIn: true,
            checkedInAt: new Date().toISOString(),
          });
          const updated = await pb.collection("registrations").getOne(registration.id, {
            fields: 'id,userName,checkedIn,checkedInAt',
          });
          return Response.json({
            success: true,
            message: "Checked in successfully",
            registration: {
              id: updated.id,
              userName: getField(updated, 'userName', '') as string,
              userEmail: '',
              eventTitle: getField(event, 'title', '') as string,
              ticketId: ticketId,
              checkedIn: getField(updated, 'checkedIn', true),
              checkedInAt: getField(updated, 'checkedInAt', '') as string,
            },
          });
        } catch (error) {
          return handleError(error, "check-in-verify");
        }
      },
    },
  },
});
