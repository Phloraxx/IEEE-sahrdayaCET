import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server";
import { requireRole, AuthError } from "@/lib/auth";
import { requireEventScope } from "@/lib/chair-scope";
import { handleError } from "@/lib/api-error";
import { escapeFilterValue } from "@/lib/pb";

/**
 * GET /api/admin/events/$id/coupons
 * Returns the coupons for an event from the `coupons` collection
 * (the single source of truth). Gated by admin/chair + event scope.
 */
export const Route = createFileRoute("/api/admin/events/$id/coupons")({
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
            throw new AuthError(
              e instanceof Error ? e.message : "Forbidden",
              403,
            );
          }
          // Use the user's own session — the simplified listRule
          // (admin || chair) accepts chair tokens directly without needing
          // superuser elevation. requireEventScope already verified scope above.
          const coupons = await pb.collection("coupons").getFullList({
            filter: `event.id = ${escapeFilterValue(id)}`,
            sort: "created",
          });
          return Response.json({ coupons }, {
            headers: { "Cache-Control": "private, max-age=10, s-maxage=30" },
          });
        } catch (error) {
          return handleError(error, "admin-event-coupons");
        }
      },
    },
  },
});
