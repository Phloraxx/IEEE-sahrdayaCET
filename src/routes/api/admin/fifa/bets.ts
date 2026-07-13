import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField, getExpand } from "@/lib/safe-get";
import { userDisplayName } from "@/lib/user-display-name";

// Admin-only: list ALL bets for a match (or a market) with user display names.
// Used by the admin testing console to see who bet what without digging into
// PB admin UI (FIFA-GAME.md §2.6).
export const Route = createFileRoute("/api/admin/fifa/bets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const url = new URL(request.url);
          const matchId = url.searchParams.get("match");
          const marketId = url.searchParams.get("market");
          const status = url.searchParams.get("status");

          const parts: string[] = [];
          if (matchId) parts.push(`match = ${escapeFilterValue(matchId)}`);
          if (marketId) parts.push(`market = ${escapeFilterValue(marketId)}`);
          if (status) parts.push(`status = ${escapeFilterValue(status)}`);
          const filter = parts.join(" && ") || undefined;

          const result = await pb.collection("fifa_bets").getList(1, 500, {
            filter,
            sort: "-placed_at",
            expand: "user,match,market",
            fields: "id,user,match,market,selection,stake,mode,odds_locked,status,payout,placed_at,expand",
          });

          return Response.json({
            bets: result.items.map((b) => {
              const expand = getExpand(b);
              const user = expand?.user
              return {
                id: getField(b, 'id', ''),
                user: user ? {
                  id: getField(user, 'id', ''),
                  display_name: userDisplayName({
                    name: getField(user, 'name', ''),
                    display_name: getField(user, 'display_name', ''),
                  }),
                  email: getField(user, 'email', ''),
                } : { id: getField(b, 'user', ''), display_name: '', email: '' },
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
                } : null,
                market: expand?.market ? {
                  id: getField(expand.market, 'id', ''),
                  market_type: getField(expand.market, 'market_type', ''),
                } : null,
              };
            }),
            total: result.totalItems,
          });
        } catch (error) {
          return handleError(error, "admin-fifa-bets-list");
        }
      },
    },
  },
})