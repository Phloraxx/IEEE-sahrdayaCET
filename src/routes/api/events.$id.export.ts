import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole, AuthError } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { requireEventScope } from "@/lib/chair-scope";
import { streamRegistrationsCSV, csvFilename, type EventLite } from "@/lib/csv-export";

export const Route = createFileRoute("/api/events/$id/export")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin","chair"], pb);
          try {
            await requireEventScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }

          const event = await pb
            .collection("events")
            .getOne<EventLite>(id, { fields: "id,title,society" })
            .catch(() => null);
          if (!event) {
            return Response.json({ error: "Event not found" }, { status: 404 });
          }

          const stream = await streamRegistrationsCSV(pb, id, {
            event: event,
          });
          const filename = csvFilename(event.title, id);

          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${  filename  }"`,
            },
          });
        } catch (error) {
          return handleError(error, "event-export");
        }
      },
    },
  },
});
