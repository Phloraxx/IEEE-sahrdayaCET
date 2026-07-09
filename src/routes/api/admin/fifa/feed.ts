import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField } from "@/lib/safe-get";

export const Route = createFileRoute("/api/admin/fifa/feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);

          const result = await pb.collection("fifa_feed_events").getList(1, 50, {
            sort: "-created",
            expand: "user",
          });

          return Response.json({
            events: result.items.map((e) => {
              const expand = getField(e, 'expand', {}) as any;
              const userObj = expand?.user || null;
              return {
                id: getField(e, 'id', ''),
                type: getField(e, 'type', 'system'),
                message: getField(e, 'message', ''),
                created: getField(e, 'created', ''),
                user: userObj ? {
                  id: userObj.id,
                  display_name: userObj.display_name,
                } : null,
              }
            }),
            total: result.totalItems,
          });
        } catch (error) {
          return handleError(error, "admin-fifa-feed-list");
        }
      },
    },
  },
});
