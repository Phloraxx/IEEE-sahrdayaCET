import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField } from "@/lib/safe-get";

// Admin-only: list past raffle draws (with entries_snapshot for transparency).
// The draw trigger is POST /api/admin/fifa/raffle (separate route). This route
// is just the read side, kept separate because the draw POST forwards to the
// PB custom route while this reads the collection directly.
export const Route = createFileRoute("/api/admin/fifa/raffle-draws")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const result = await pb.collection("fifa_raffle_draws").getList(1, 20, {
            sort: "-drawn_at",
            fields: "id,drawn_at,winner,entries_snapshot,seed",
          });
          return Response.json({
            draws: result.items.map((d) => ({
              id: getField(d, 'id', ''),
              drawn_at: getField(d, 'drawn_at', ''),
              winner: getField(d, 'winner', ''),
              entries_snapshot: getField(d, 'entries_snapshot', null),
              seed: getField(d, 'seed', ''),
            })),
          });
        } catch (error) {
          return handleError(error, "admin-fifa-raffle-draws");
        }
      },
    },
  },
});
