import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaSettleSchema } from "@/schemas/fifa";

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

          // Call the PB custom route. The pb_auth cookie auto-attaches, so
          // the route's e.auth check sees the admin role.
          const res = await fetch(`${process.env.POCKETBASE_URL}/api/fifa/settle`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify(parsed),
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
