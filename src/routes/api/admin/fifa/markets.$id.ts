import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaMarketUpdateSchema } from "@/schemas/fifa";

export const Route = createFileRoute("/api/admin/fifa/markets/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const market = await pb.collection("fifa_bet_markets").getOne(id);
          return Response.json({ market });
        } catch (error) {
          return handleError(error, "admin-fifa-market-get");
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
          const parsed = FifaMarketUpdateSchema.parse(await request.json());
          // Admin can edit odds/options/open/void, but NOT pool_total/pool_by_option
          // (those are hook-maintained). Strip them defensively.
          const { pool_total: _pt, pool_by_option: _pb, ...safeFields } = parsed as Record<string, unknown>;
          // Voiding a market must also close it — otherwise the market lingers as
          // is_open=true while void=true (betting is still blocked by the void check,
          // but the UI would misrender it as open). The match-void cascade and
          // auto-void cron already set both; mirror that here for direct voids.
          if (safeFields.void === true) safeFields.is_open = false;
          const market = await pb.collection("fifa_bet_markets").update(id, safeFields);
          return Response.json({ market });
        } catch (error) {
          return handleError(error, "admin-fifa-market-update");
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { id } = params;
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const pending = await pb.collection("fifa_bets").getList(1, 1, {
            filter: `market = ${escapeFilterValue(id)} && status = 'pending'`,
          });
          if (pending.totalItems > 0) {
            return Response.json(
              { error: "Cannot delete market with pending bets — void the market instead" },
              { status: 409 },
            );
          }
          await pb.collection("fifa_bet_markets").delete(id);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-fifa-market-delete");
        }
      },
    },
  },
});
