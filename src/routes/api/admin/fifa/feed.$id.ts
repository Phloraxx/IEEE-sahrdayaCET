import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/fifa/feed/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);

          await pb.collection("fifa_feed_events").delete(params.id);

          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-fifa-feed-delete");
        }
      },
    },
  },
});
