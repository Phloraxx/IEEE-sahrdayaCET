import { createFileRoute } from "@tanstack/react-router";
import { createPB, getPBUrl } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
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

          // PB 0.39.1 routerAdd returns 404 on custom routes (goja bug).
          // Query the coupons collection directly via admin token instead.
          const adminToken = process.env.POCKETBASE_ADMIN_TOKEN;
          if (!adminToken) {
            return Response.json(
              { error: "Coupon validation unavailable" },
              { status: 503 },
            );
          }

          const now = new Date().toISOString().split('T')[0];
          const filter = `code='${code.replace(/'/g, "''")}' && event='${eventId}' && enabled=true && (maxUses=0 || usedCount<maxUses) && (expiresAt='' || expiresAt>='${now}')`;
          const pbUrl = getPBUrl();
          const couponRes = await fetch(
            `${pbUrl}/api/collections/coupons/records?filter=${encodeURIComponent(filter)}&perPage=1`,
            { headers: { 'Authorization': `Bearer ${adminToken}` } },
          );

          if (!couponRes.ok) {
            return Response.json(
              { error: "Failed to validate coupon" },
              { status: 502 },
            );
          }

          const couponData = await couponRes.json();
          const coupon = couponData?.items?.[0];

          if (!coupon) {
            return Response.json(
              { valid: false, error: "Invalid or expired coupon code" },
            );
          }

          return Response.json({
            valid: true,
            discountAmount: Number(coupon.discountAmount) || 0,
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
