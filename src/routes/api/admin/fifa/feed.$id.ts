import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/lib/admin-middleware"
import { AuthError } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/fifa/feed/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          verifySameOrigin(request);
          const { pb, role } = await authenticateAdmin(request);
          if (role !== "admin") throw new AuthError("Admin only", 403);

          await pb.collection("fifa_feed_events").delete(params.id);

          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-fifa-feed-delete");
        }
      },
    },
  },
});
