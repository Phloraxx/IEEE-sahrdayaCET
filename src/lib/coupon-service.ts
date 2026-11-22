import type { AppClient } from "@/lib/pb-client";

/** Atomically reconciles the coupon set for one event through PocketBase. */
export async function reconcileCoupons(
  pb: AppClient,
  eventId: string,
  incoming: Array<{
    id?: string;
    code: string;
    discountPercent: number;
    maxUses: number;
    expiresAt?: string;
    isActive: boolean;
  }>,
): Promise<void> {
  await pb.send(`/api/app/events/${encodeURIComponent(eventId)}/coupons`, {
    method: "PUT",
    body: { coupons: incoming },
  });
}
