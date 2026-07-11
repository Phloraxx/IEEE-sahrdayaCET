import { createFileRoute } from "@tanstack/react-router";
import { createPB, serializeToFormData } from "@/lib/pb.server"
import { requireRole, AuthError } from "@/lib/auth";
import { requireEventScope } from "@/lib/chair-scope";
import { handleError } from "@/lib/api-error";
import { softDeleteEvent } from "@/lib/event-service";
import { parseFormData } from "@/lib/parse-form-data";
import { EventUpdateSchema } from "@/schemas/events";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { reconcileCoupons } from "@/lib/coupon-service";

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
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
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
          // Coupons live in the `coupons` collection, not on the event record.
          const { coupons: incomingCoupons, ...eventFields } = parsed;
          // The chair's own session is sufficient for event field updates.
          // The PB updateRule allows chairs to edit their own events' fields.
          const event = await pb.collection("events").update(id, serializeToFormData(eventFields));
          // Reconcile coupons collection to match the incoming list.
          // Pass an empty array when the UI omits coupons (e.g. banner upload)
          // so removed coupons are deleted — but only when the key is present.
          if (incomingCoupons !== undefined) {
            await reconcileCoupons(pb, id, incomingCoupons);
          }
          return Response.json({ event });
        } catch (error) {
          return handleError(error, "admin-events-update");
        }
      },
      DELETE: async ({ request, params }) => {
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
            await requireEventScope(pb, user, id);
          } catch (e) {
            throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
          }
          // The PB updateRule now allows chairs to set isDeleted=true for their
          // own society's events. The hook in pb_hooks/events.pb.js also permits
          // the false→true transition. No elevated client needed.
          await softDeleteEvent(id, pb);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-events-delete");
        }
      },
    },
  },
});
