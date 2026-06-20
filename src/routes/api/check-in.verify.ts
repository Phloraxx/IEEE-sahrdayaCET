import { createFileRoute } from "@tanstack/react-router";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { checkInRegistration } from "@/lib/registration-service";

export const Route = createFileRoute("/api/check-in/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireAuth(pb);

          const { ticketId, eventId } = (await request.json()) as {
            ticketId?: string;
            eventId?: string;
          };
          if (!ticketId || !eventId) {
            return Response.json(
              { error: "Missing required fields" },
              { status: 400 },
            );
          }

          const event = await pb
            .collection("events")
            .getOne(eventId, { fields: "id,society,checkInEnabled" })
            .catch(() => null);
          if (!event) {
            return Response.json({ error: "Event not found" }, { status: 404 });
          }

          const eventR = event as unknown as Record<string, unknown>;
          if (!eventR.checkInEnabled) {
            return Response.json(
              { error: "Check-in is not enabled for this event" },
              { status: 400 },
            );
          }

          const registration = await pb
            .collection("registrations")
            .getFirstListItem(
              "event = " +
                escapeFilterValue(eventId) +
                " && (ticketId = " +
                escapeFilterValue(ticketId) +
                " || paymentTicketId = " +
                escapeFilterValue(ticketId) +
                ")",
              { fields: "id,registrationStatus,checkedIn" },
            )
            .catch(() => null);

          if (!registration) {
            return Response.json(
              { error: "Registration not found" },
              { status: 404 },
            );
          }

          const regR = registration as unknown as Record<string, unknown>;

          if (regR.registrationStatus !== "confirmed") {
            return Response.json(
              { error: "Registration is not confirmed" },
              { status: 400 },
            );
          }
          if (regR.checkedIn) {
            return Response.json({
              error: "Already checked in",
              registrationId: registration.id,
            });
          }

          await checkInRegistration(pb, registration.id);
          return Response.json({
            success: true,
            registrationId: registration.id,
          });
        } catch (error) {
          return handleError(error, "check-in-verify");
        }
      },
    },
  },
});
