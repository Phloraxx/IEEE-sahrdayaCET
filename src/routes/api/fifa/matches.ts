import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { handleError } from "@/lib/api-error";
import { getField } from "@/lib/safe-get";

// Public, unauthenticated: list matches with their markets + live pool totals.
// Used by the /FIFA/matches page (SSR initial data, then SSE for live pool updates).
export const Route = createFileRoute("/api/fifa/matches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB();
          const url = new URL(request.url);
          const stage = url.searchParams.get("stage");
          const filter = stage ? `stage = '${stage}'` : undefined;

          const matches = await pb.collection("fifa_matches").getFullList({
            filter,
            sort: "kickoff_at",
            fields: "id,team_home,team_away,stage,kickoff_at,betting_locks_at,status,result_winner,result_home_goals,result_away_goals,settled",
          });

          // Fetch all open markets for these matches in one query
          const matchIds = matches.map((m) => getField(m, 'id', '')).filter(Boolean);
          const marketsByMatch: Record<string, unknown[]> = {};
          if (matchIds.length > 0) {
            const markets = await pb.collection("fifa_bet_markets").getFullList({
              filter: `match ?= "${matchIds.join('","')}"`,
              fields: "id,match,market_type,mode,line,fixed_odds,options,is_open,void,pool_total,pool_by_option",
            });
            for (const mkt of markets) {
              const mid = getField(mkt, 'match', '');
              if (!marketsByMatch[mid]) marketsByMatch[mid] = [];
              marketsByMatch[mid].push({
                id: getField(mkt, 'id', ''),
                market_type: getField(mkt, 'market_type', ''),
                mode: getField(mkt, 'mode', 'pool'),
                line: getField(mkt, 'line', 0),
                fixed_odds: getField(mkt, 'fixed_odds', null),
                options: getField(mkt, 'options', []),
                is_open: getField(mkt, 'is_open', true),
                void: getField(mkt, 'void', false),
                pool_total: getField(mkt, 'pool_total', 0),
                pool_by_option: getField(mkt, 'pool_by_option', {}),
              });
            }
          }

          return Response.json({
            matches: matches.map((m) => ({
              id: getField(m, 'id', ''),
              team_home: getField(m, 'team_home', ''),
              team_away: getField(m, 'team_away', ''),
              stage: getField(m, 'stage', ''),
              kickoff_at: getField(m, 'kickoff_at', ''),
              betting_locks_at: getField(m, 'betting_locks_at', ''),
              status: getField(m, 'status', 'upcoming'),
              result_winner: getField(m, 'result_winner', ''),
              result_home_goals: getField(m, 'result_home_goals', 0),
              result_away_goals: getField(m, 'result_away_goals', 0),
              settled: getField(m, 'settled', false),
              markets: marketsByMatch[getField(m, 'id', '')] || [],
            })),
          });
        } catch (error) {
          return handleError(error, "fifa-matches-public");
        }
      },
    },
  },
});
