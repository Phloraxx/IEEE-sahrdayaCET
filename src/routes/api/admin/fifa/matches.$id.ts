import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaMatchUpdateSchema } from "@/schemas/fifa";

export const Route = createFileRoute("/api/admin/fifa/matches/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const match = await pb.collection("fifa_matches").getOne(id, { expand: "fifa_bet_markets(match)" });
          return Response.json({ match });
        } catch (error) {
          return handleError(error, "admin-fifa-match-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const parsed = FifaMatchUpdateSchema.parse(await request.json());
          // Strip server-authoritative fields — only the settle route sets these.
          const { settled: _s, ...safeFields } = parsed as Record<string, unknown>;
          const match = await pb.collection("fifa_matches").update(id, safeFields);
          return Response.json({ match });
        } catch (error) {
          return handleError(error, "admin-fifa-match-update");
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { id } = params;
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const pending = await pb.collection("fifa_bets").getList(1, 1, {
            filter: `match = ${escapeFilterValue(id)} && status = 'pending'`,
          });
          if (pending.totalItems > 0) {
            return Response.json(
              { error: "Cannot delete match with pending bets — void the match instead" },
              { status: 409 },
            );
          }
          await pb.collection("fifa_matches").delete(id);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-fifa-match-delete");
        }
      },
    },
  },
});
