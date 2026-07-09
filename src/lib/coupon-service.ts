import type PocketBase from "pocketbase";
import { escapeFilterValue } from "@/lib/pb";

/**
 * Reconciles the `coupons` collection for an event to match the incoming
 * list from the admin UI. The `coupons` collection is the single source of
 * truth — the `events.coupons` JSON field is no longer read or written.
 *
 * - Existing coupons whose `id` is in `incoming` are **updated** (preserves
 *   `usedCount` so in-flight discounts aren't lost on edit).
 * - Existing coupons whose `id` is NOT in `incoming` are deleted.
 * - Incoming coupons whose client `id` matches no existing record are created
 *   with `usedCount = 0`.
 *
 * The caller must have already verified the user's scope (admin or chair of
 * the event's society) — PB rules enforce per-record access on each call.
 */
export async function reconcileCoupons(
  pb: PocketBase,
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
  const existing = await pb.collection("coupons").getFullList({
    filter: `event = ${escapeFilterValue(eventId)}`,
  });

  const existingMap = new Map(existing.map((c) => [c.id, c]));
  // Only treat an incoming id as a real match if it corresponds to an
  // existing DB record; otherwise the coupon is new and gets created.
  const matchedIds = new Set(
    incoming
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string" && existingMap.has(id)),
  );

  // Delete coupons removed from the UI (skip if actively used)
  for (const ex of existing) {
    if (!matchedIds.has(ex.id)) {
      const usedCount = Number(ex.usedCount) || 0;
      if (usedCount > 0) continue;
      await pb.collection("coupons").delete(ex.id);
    }
  }

  // Create or update
  for (const c of incoming) {
    if (c.id && existingMap.has(c.id)) {
      await pb.collection("coupons").update(c.id, {
        code: c.code,
        discountPercent: c.discountPercent,
        maxUses: c.maxUses,
        expiresAt: c.expiresAt || "",
        isActive: c.isActive,
      });
    } else {
      await pb.collection("coupons").create({
        event: eventId,
        code: c.code,
        discountPercent: c.discountPercent,
        maxUses: c.maxUses,
        usedCount: 0,
        expiresAt: c.expiresAt || "",
        isActive: c.isActive,
      });
    }
  }
}
