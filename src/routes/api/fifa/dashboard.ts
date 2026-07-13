import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField, getExpand } from "@/lib/safe-get";

// Authed: the player's own dashboard — balance, display_name, recent bets,
// and recent transactions. Polled every ~10s by the client.
export const Route = createFileRoute("/api/fifa/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireAuth(pb);

          // Re-read the user record to get the latest balance + display_name
          // (the auth record from requireAuth may be stale by up to authRefresh
          // interval).
          const userRec = await pb.collection("users").getOne(user.id, {
            fields: "id,display_name,balance,email",
          });

          const userIdFilter = escapeFilterValue(user.id)
          const [bets, transactions, countPage, statusPage] = await Promise.all([
            pb.collection("fifa_bets").getList(1, 20, {
              filter: `user = ${userIdFilter}`,
              sort: "-placed_at",
              expand: "match,market",
              fields: "id,selection,stake,mode,odds_locked,status,payout,placed_at,match,market,expand",
            }),
            pb.collection("fifa_transactions").getList(1, 30, {
              filter: `user = ${userIdFilter}`,
              sort: "-timestamp",
              fields: "id,type,amount,balance_after,note,timestamp",
            }),
            pb.collection("fifa_bets").getList(1, 1, {
              filter: `user = ${userIdFilter} && status != 'void'`,
              fields: "id",
            }),
            pb.collection("fifa_bets").getList(1, 100, {
              filter: `user = ${userIdFilter}`,
              sort: "-placed_at",
              fields: "id,status",
            }),
          ]);
          const validBetsCount = countPage.totalItems ?? 0;

          let maxBetPercent = 25;
          try {
            const settings = await pb.collection("fifa_settings").getFirstListItem("1=1", {
              fields: "max_bet_percent",
            });
            maxBetPercent = Number(getField(settings, 'max_bet_percent', 25)) || 25;
          } catch { /* settings not seeded — keep default */ }

          return Response.json({
            user: {
              id: getField(userRec, 'id', ''),
              display_name: getField(userRec, 'display_name', ''),
              balance: getField(userRec, 'balance', 0),
              email: getField(userRec, 'email', ''),
            },
            max_bet_percent: maxBetPercent,
            valid_bets_count: validBetsCount,
            bet_statuses: statusPage.items.map((b) => ({
              id: getField(b, 'id', ''),
              status: getField(b, 'status', 'pending'),
            })),
            bets: bets.items.map((b) => {
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
                } : null,
                market: expand?.market ? {
                  id: getField(expand.market, 'id', ''),
                  market_type: getField(expand.market, 'market_type', ''),
                } : null,
              };
            }),
            transactions: transactions.items.map((t) => ({
              id: getField(t, 'id', ''),
              type: getField(t, 'type', ''),
              amount: getField(t, 'amount', 0),
              balance_after: getField(t, 'balance_after', 0),
              note: getField(t, 'note', ''),
              timestamp: getField(t, 'timestamp', ''),
            })),
          });
        } catch (error) {
          return handleError(error, "fifa-dashboard");
        }
      },
      // Display names are set from the Google profile at first sign-in
      // (pb_hooks/fifa.pb.js OAuth2 hook) and are NOT user-editable — the
      // public leaderboard shows real identities. The users collection
      // updateRule blocks self-service display_name changes at the DB layer
      // too; admins can still correct a name via the PB dashboard.
    },
  },
});
