import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole, AuthError } from "@/lib/auth";
import { handleError, getErrorStatus } from "@/lib/api-error";
import { streamRegistrationsCSV, csvFilename, type EventLite } from "@/lib/csv-export";
import { requireEventScope } from "@/lib/chair-scope";

export const Route = createFileRoute("/api/admin/events/$id/registrations-csv")(
  {
    server: {
      handlers: {
        GET: async ({ request, params }) => {
          try {
            const { id: eventId } = params;
            const pb = createPB(request.headers.get("cookie") || undefined);
            const { user } = await requireRole(["admin", "chair"], pb);
            try {
              await requireEventScope(pb, user, eventId);
            } catch (e) {
              throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
            }

            const event = await pb
              .collection("events")
              .getOne<EventLite>(eventId, { fields: "id,title,formTemplate" })
              .catch(() => null);
            if (!event) {
              return new Response("Event not found", { status: 404 });
            }

            const stream = await streamRegistrationsCSV(pb, eventId, {
              adminFormat: true,
              event: event,
            });
            const filename = csvFilename(event.title, eventId);

            return new Response(stream, {
              status: 200,
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition":
                  `attachment; filename="${  filename  }"`,
                "Cache-Control": "no-store",
              },
            });
          } catch (error) {
            const status = getErrorStatus(error);
            if (status === 403)
              return new Response("Forbidden", { status: 403 });
            if (status === 404)
              return new Response("Event not found", { status: 404 });
            return handleError(error, "admin-registrations-csv");
          }
        },
      },
    },
  },
);
