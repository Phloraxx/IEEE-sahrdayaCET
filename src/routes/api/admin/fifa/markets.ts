import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaMarketCreateSchema } from "@/schemas/fifa";
import { getField } from "@/lib/safe-get";

// Markets list/create. Markets belong to a match (filter by ?match=ID).
export const Route = createFileRoute("/api/admin/fifa/markets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const url = new URL(request.url);
          const matchId = url.searchParams.get("match");
          const filter = matchId ? `match = ${escapeFilterValue(matchId)}` : undefined;
          const result = await pb.collection("fifa_bet_markets").getFullList({
            filter,
            sort: "id",
          });
          return Response.json({
            markets: result.map((m) => ({
              id: getField(m, 'id', ''),
              match: getField(m, 'match', ''),
              market_type: getField(m, 'market_type', ''),
              mode: getField(m, 'mode', 'pool'),
              line: getField(m, 'line', 0),
              fixed_odds: getField(m, 'fixed_odds', null),
              options: getField(m, 'options', []),
              is_open: getField(m, 'is_open', true),
              void: getField(m, 'void', false),
              pool_total: getField(m, 'pool_total', 0),
              pool_by_option: getField(m, 'pool_by_option', {}),
            })),
          });
        } catch (error) {
          return handleError(error, "admin-fifa-markets-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const parsed = FifaMarketCreateSchema.parse(await request.json());
          const market = await pb.collection("fifa_bet_markets").create({
            ...parsed,
            pool_total: 0,
            pool_by_option: {},
          });
          return Response.json({ market }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-fifa-markets-create");
        }
      },
    },
  },
});

// ─── Markets $id (update/delete) ────────────────────────────────────
// Defined in the same file via a second createFileRoute — but TanStack
// file-based routing requires one route per file. So this handler set is
// registered in markets.$id.ts instead. This file only handles the
// collection-level list/create.
