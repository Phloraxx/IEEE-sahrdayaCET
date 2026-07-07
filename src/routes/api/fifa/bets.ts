import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { FIFA_RATE_LIMITS } from "@/lib/constants";
import { FifaBetCreateSchema } from "@/schemas/fifa";
import { getField, getExpand } from "@/lib/safe-get";

export const Route = createFileRoute("/api/fifa/bets")({
  server: {
    handlers: {
      // GET: list the authenticated user's own bets (with optional ?match= filter)
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireAuth(pb);
          const url = new URL(request.url);
          const matchId = url.searchParams.get("match");
          const status = url.searchParams.get("status");

          const parts: string[] = [`user = ${escapeFilterValue(user.id)}`];
          if (matchId) parts.push(`match = ${escapeFilterValue(matchId)}`);
          if (status) parts.push(`status = ${escapeFilterValue(status)}`);
          const filter = parts.join(" && ");

          const result = await pb.collection("fifa_bets").getList(1, 100, {
            filter,
            sort: "-placed_at",
            expand: "match,market",
            fields: "id,match,market,selection,stake,mode,odds_locked,status,payout,placed_at,expand",
          });

          return Response.json({
            bets: result.items.map((b) => {
              const expand = getExpand(b);
              return {
                id: getField(b, 'id', ''),
                selection: getField(b, 'selection', ''),
                stake: getField(b, 'stake', 0),
                mode: getField(b, 'mode', 'pool'),
                odds_locked: getField(b, 'odds_locked', 0),
                status: getField(b, 'status', 'pending'),
                payout: getField(b, 'payout', 0),
                placed_at: getField(b, 'placed_at', ''),
                match: expand?.match ? {
                  id: getField(expand.match, 'id', ''),
                  team_home: getField(expand.match, 'team_home', ''),
                  team_away: getField(expand.match, 'team_away', ''),
                  stage: getField(expand.match, 'stage', ''),
                  kickoff_at: getField(expand.match, 'kickoff_at', ''),
                } : null,
                market: expand?.market ? {
                  id: getField(expand.market, 'id', ''),
                  market_type: getField(expand.market, 'market_type', ''),
                  mode: getField(expand.market, 'mode', 'pool'),
                } : null,
              };
            }),
            total: result.totalItems,
          });
        } catch (error) {
          return handleError(error, "fifa-bets-list");
        }
      },
      // POST: place a bet. Auth + rate limit + create with the user's own
      // client. The PB hook (pb_hooks/fifa.pb.js) enforces all business rules
      // (market open, deadline, stake limits, balance) and deducts balance
      // atomically. We just authenticate and forward.
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireAuth(pb);

          const rl = checkRateLimit({ key: `fifa-bet:${user.id}`, max: FIFA_RATE_LIMITS.bet.max, windowMs: FIFA_RATE_LIMITS.bet.windowMs });
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

          const parsed = FifaBetCreateSchema.parse(await request.json());

          // Create with the user's own client. The createRule + onRecordCreate
          // hook enforce everything else. If the hook throws (e.g. insufficient
          // balance, market closed), PB returns a 400 that handleError maps.
          const bet = await pb.collection("fifa_bets").create({
            user: user.id,
            match: parsed.match,
            market: parsed.market,
            selection: parsed.selection,
            stake: parsed.stake,
          });

          // Read back the hook-populated fields (mode, odds_locked, status,
          // placed_at are set by the hook, not the client)
          const created = await pb.collection("fifa_bets").getOne(bet.id, {
            fields: "id,selection,stake,mode,odds_locked,status,payout,placed_at",
          });

          return Response.json({
            bet: {
              id: getField(created, 'id', ''),
              selection: getField(created, 'selection', ''),
              stake: getField(created, 'stake', 0),
              mode: getField(created, 'mode', 'pool'),
              odds_locked: getField(created, 'odds_locked', 0),
              status: getField(created, 'status', 'pending'),
              payout: getField(created, 'payout', 0),
              placed_at: getField(created, 'placed_at', ''),
            },
          }, { status: 201 });
        } catch (error) {
          return handleError(error, "fifa-bets-create");
        }
      },
    },
  },
});
