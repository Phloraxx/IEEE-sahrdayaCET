import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"; import { escapeFilterValue } from "@/lib/pb"
import { requireAuth } from "@/lib/auth";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { handleError } from "@/lib/api-error";

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

          const body = await request.json();
          const { eventId, code } = body;

          if (!eventId || !code) {
            return Response.json(
              { error: "eventId and code are required" },
              { status: 400 },
            );
          }

          // Query via user-authenticated PB client (coupons listRule allows @request.auth.id != "")
          const now = new Date().toISOString().split('T')[0];
          const filter = `code=${escapeFilterValue(code)} && event=${escapeFilterValue(eventId)} && isActive=true && (maxUses=0 || usedCount<maxUses) && (expiresAt='' || expiresAt>='${now}')`;
          let coupon: Record<string, unknown> | null = null;
          try {
            coupon = await userPb.collection("coupons").getFirstListItem(filter, {
              fields: "code,discountPercent,description",
            }) as unknown as Record<string, unknown>;
          } catch {
            // getFirstListItem throws on no match — treat as invalid coupon
          }
          if (!coupon) {
            return Response.json(
              { valid: false, error: "Invalid or expired coupon code" },
            );
          }
          const discountPercent = Number(coupon.discountPercent) || 0;
          return Response.json({
            valid: true,
            discountPercent,
            discountAmount: discountPercent, // Backwards-compat field name for older clients
            code: coupon.code,
            description: coupon.description || '',
          });
        } catch (error) {
          return handleError(error, "validate-coupon");
        }
      },
    },
  },
});
