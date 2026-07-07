import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parsePagination, buildFilter } from "@/lib/route-helpers";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaMatchCreateSchema } from "@/schemas/fifa";
import { getField } from "@/lib/safe-get";

// Admin-only (NOT chair — chairs have no game role). Admin creates matches,
// opens/closes markets, enters results, triggers settlement.
export const Route = createFileRoute("/api/admin/fifa/matches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url, { defaultPerPage: 50, maxPerPage: 200 });
          const status = url.searchParams.get("status");
          const stage = url.searchParams.get("stage");

          const parts: string[] = [];
          if (status) parts.push(`status = ${escapeFilterValue(status)}`);
          if (stage) parts.push(`stage = ${escapeFilterValue(stage)}`);
          const filter = buildFilter(parts);

          const result = await pb.collection("fifa_matches").getList(page, perPage, {
            filter: filter || undefined,
            sort: "kickoff_at",
          });

          return Response.json({
            matches: result.items.map((m) => ({
              id: getField(m, 'id', ''),
              team_home: getField(m, 'team_home', ''),
              team_away: getField(m, 'team_away', ''),
              stage: getField(m, 'stage', ''),
              kickoff_at: getField(m, 'kickoff_at', ''),
              betting_locks_at: getField(m, 'betting_locks_at', ''),
              status: getField(m, 'status', 'upcoming'),
              settled: getField(m, 'settled', false),
            })),
            total: result.totalItems,
            page: result.page,
            perPage: result.perPage,
          });
        } catch (error) {
          return handleError(error, "admin-fifa-matches-list");
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
          const parsed = FifaMatchCreateSchema.parse(await request.json());
          // Default betting_locks_at to kickoff_at if not provided.
          const body = {
            ...parsed,
            betting_locks_at: parsed.betting_locks_at || parsed.kickoff_at,
          };
          const match = await pb.collection("fifa_matches").create(body);
          return Response.json({ match }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-fifa-matches-create");
        }
      },
    },
  },
});
