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
              discountType: coupon.discountType,
              discountValue: coupon.discountValue,
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
