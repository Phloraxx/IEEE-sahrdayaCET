import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server";
import { requireAuth } from "@/lib/auth";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { handleError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const Route = createFileRoute("/api/events/validate-coupon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);

          const userPb = createPB(request.headers.get("cookie") || undefined);
          await requireAuth(userPb);

          const authRecord = userPb.authStore.record;
          const rlKey = authRecord?.id || request.headers.get('x-forwarded-for') || 'anon';
          const rl = checkRateLimit({ key: `coupon:${rlKey}`, max: 30, windowMs: 60_000 });
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
          const body = await request.json();
          const { eventId, code } = body;

          if (!eventId || !code) {
            return Response.json(
              { error: "eventId and code are required" },
              { status: 400 },
            );
          }

          const pbUrl = process.env.POCKETBASE_URL;
          const internalSecret = process.env.INTERNAL_API_SECRET;
          if (!pbUrl || !internalSecret) {
            return Response.json({ error: "Server configuration error" }, { status: 500 });
          }

          const pbResponse = await fetch(`${pbUrl}/api/coupons/validate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
            },
            body: JSON.stringify({ code, eventId }),
          });

          const result = await pbResponse.json();
          return Response.json(result);
        } catch (error) {
          return handleError(error, "validate-coupon");
        }
      },
    },
  },
});
