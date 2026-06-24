import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import {
  validateCouponCode,
  computeDiscount,
} from "@/lib/registration-service";

export const Route = createFileRoute("/api/events/validate-coupon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireAuth(pb);

          const body = await request.json();
          const { eventId, code } = body;

          if (!eventId || !code) {
            return Response.json(
              { error: "eventId and code are required" },
              { status: 400 },
            );
          }

          const { coupon, event } = await validateCouponCode(pb, eventId, code);
          const price = Number(event.price) || 0;
          const discountAmount = computeDiscount(price, coupon);
          const finalPrice = Math.max(0, price - discountAmount);

          return Response.json({
            valid: true,
            coupon: {
              code: coupon.code,
              discountPercent: coupon.discountPercent,
              discountAmount,
              finalPrice,
            },
          });
        } catch (error) {
          return handleError(error, "validate-coupon");
        }
      },
    },
  },
});
