/**
 * Coupon lookup for pricing.
 *
 * Phase 2 is read-only: coupons are consulted to compute a price, never
 * consumed. Consumption (`used_count`) is recomputed from live registrations
 * after a create or cancel, which is self-healing and matches the hook.
 */

import { query } from "@/lib/db.server";
import type { CouponLookup, CouponRow } from "./pricing";

export const couponLookup: CouponLookup = {
	async find(eventId: string, code: string): Promise<CouponRow | null> {
		// Mirrors the PocketBase filter: active, and either no expiry or a future one.
		const result = await query<CouponRow>(
			`SELECT id, code, discount_percent, max_uses, used_count
			   FROM coupons
			  WHERE event_id = ? AND upper(code) = ? AND is_active = 1
			    AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)
			  LIMIT 1`,
			[eventId, code, new Date().toISOString()],
		);
		return result.rows[0] ?? null;
	},

	async activeUses(eventId: string, code: string): Promise<number> {
		const result = await query<{ n: number }>(
			`SELECT count(*) AS n FROM registrations
			  WHERE event_id = ? AND coupon_code = ? AND registration_status <> 'cancelled'`,
			[eventId, code],
		);
		return result.rows[0]?.n ?? 0;
	},
};

/** All coupons for an event (read-only listing, used by the preview UI later). */
export async function listEventCoupons(eventId: string): Promise<CouponRow[]> {
	const result = await query<CouponRow>(
		`SELECT id, code, discount_percent, max_uses, used_count
		   FROM coupons WHERE event_id = ? AND is_active = 1 ORDER BY code`,
		[eventId],
	);
	return result.rows;
}
