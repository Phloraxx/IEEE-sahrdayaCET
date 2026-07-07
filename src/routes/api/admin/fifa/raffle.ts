import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FIFA_RATE_LIMITS } from "@/lib/constants";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Admin-only: trigger the raffle draw. The PB custom route /api/fifa/raffle
// does the weighted pick + snapshot storage (see pb_hooks/fifa.pb.js).
export const Route = createFileRoute("/api/admin/fifa/raffle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin"], pb);

          const rl = checkRateLimit({ key: `fifa-raffle:${user.id}`, max: FIFA_RATE_LIMITS.raffle.max, windowMs: FIFA_RATE_LIMITS.raffle.windowMs });
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

          const res = await fetch(`${process.env.POCKETBASE_URL}/api/fifa/raffle`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return Response.json({ error: data.error || 'Raffle failed' }, { status: res.status });
          }
          return Response.json(data);
        } catch (error) {
          return handleError(error, "admin-fifa-raffle");
        }
      },
    },
  },
});
