import { createFileRoute } from "@tanstack/react-router";
import { getLiveScores } from "@/lib/fifa-live";
import { handleError } from "@/lib/api-error";

// Public, unauthenticated: returns cached live WC 2026 scores from
// football-data.org (60s server-side cache — see src/lib/fifa-live.ts).
// If FOOTBALL_DATA_API_TOKEN isn't set, returns { matches: [], configured: false }
// and the UI hides the live-score overlay gracefully (FIFA-GAME.md §2.7).
export const Route = createFileRoute("/api/fifa/live-scores")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await getLiveScores()
          return Response.json({
            matches: result.matches,
            configured: result.configured,
            source: result.source,
            fetchedAt: result.fetchedAt,
          })
        } catch (error) {
          return handleError(error, "fifa-live-scores")
        }
      },
    },
  },
})