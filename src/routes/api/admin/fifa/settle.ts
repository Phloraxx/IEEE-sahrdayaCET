import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaSettleSchema } from "@/schemas/fifa";
import { PB_AUTH_COOKIE } from "@/lib/constants";

// Admin-only: enter match result + trigger settlement. The PB custom route
// /api/fifa/settle does the actual payout math (see pb_hooks/fifa.pb.js).
// This route just authenticates and forwards.
export const Route = createFileRoute("/api/admin/fifa/settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const parsed = FifaSettleSchema.parse(await request.json());

          // Auto-fill result_advance from result_winner when the 90-min result
          // wasn't a draw (FIFA-GAME.md §2.1). The PB hook does this too —
          // belt and braces.
          const body: Record<string, unknown> = { ...parsed };
          if (
            !parsed.result_advance &&
            parsed.result_winner &&
            parsed.result_winner !== 'draw'
          ) {
            body.result_advance = parsed.result_winner;
          }

          // Extract the auth token from the cookie and pass it as a Bearer
          // token. The pb_auth cookie value is URL-encoded JSON; PocketBase
          // may not decode it when received via forwarded header, but it
          // always accepts Authorization: Bearer.
          const cookieStr = request.headers.get('cookie') || '';
          const token = pb.authStore.token;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            headers['cookie'] = cookieStr;
          }

          const res = await fetch(`${process.env.POCKETBASE_URL}/api/fifa/settle`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return Response.json({ error: data.error || 'Settlement failed' }, { status: res.status });
          }
          return Response.json(data);
        } catch (error) {
          return handleError(error, "admin-fifa-settle");
        }
      },
    },
  },
});
