import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole, AuthError } from "@/lib/auth";
import { requireEventScope } from "@/lib/chair-scope";
import { handleError } from "@/lib/api-error";
import { softDeleteEvent } from "@/lib/event-service";
import { parseFormData } from "@/lib/parse-form-data";
import { EventUpdateSchema } from "@/schemas/events";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/events/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin", "chair"], pb);
          try {
            await requireEventScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          const event = await pb
            .collection("events")
            .getOne(id, { expand: "society" });
          return Response.json({ event }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-events-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data') && request.method !== 'GET') {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin", "chair"], pb);
          try {
            await requireEventScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          const body = await parseFormData(request);
          const parsed = EventUpdateSchema.parse(body);
          const event = await pb.collection("events").update(id, parsed);
          return Response.json({ event });
        } catch (error) {
          return handleError(error, "admin-events-update");
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data') && request.method !== 'GET') {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin", "chair"], pb);
          try {
            await requireEventScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          await softDeleteEvent(id, pb);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-events-delete");
        }
      },
    },
  },
});
