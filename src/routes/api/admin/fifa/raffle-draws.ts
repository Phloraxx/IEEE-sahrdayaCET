import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField } from "@/lib/safe-get";

// Admin-only: read the one-time raffle result from fifa_settings.
// The draw trigger is POST /api/admin/fifa/raffle (forwards to PB custom route).
export const Route = createFileRoute("/api/admin/fifa/raffle-draws")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const s = await pb.collection("fifa_settings").getFirstListItem("1=1", {
            fields: "id,raffle_drawn_at,raffle_winner,raffle_entries_snapshot,raffle_seed",
          });
          const drawnAt = getField(s, 'raffle_drawn_at', '')
          if (!drawnAt) {
            return Response.json({ draws: [] });
          }
          return Response.json({
            draws: [{
              id: getField(s, 'id', ''),
              drawn_at: drawnAt,
              winner: getField(s, 'raffle_winner', ''),
              entries_snapshot: getField(s, 'raffle_entries_snapshot', null),
              seed: getField(s, 'raffle_seed', ''),
            }],
          });
        } catch (error) {
          return handleError(error, "admin-fifa-raffle-draws");
        }
      },
    },
  },
});