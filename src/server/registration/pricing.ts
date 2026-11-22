/**
 * Pricing — TypeScript port of `pb_hooks/event-pricing-helpers.js`.
 *
 * Phase 2 uses this read-only (preview + the fee snapshot written on a
 * registration). No charge, no provider call: `validateProvider` defaults to
 * true only so the whole-rupee rule keeps matching what PayGate will require in
 * phase 3.
 *
 * The money rules are ported verbatim. They are the part of the system where a
 * "small improvement" is a bug:
 *   - IEEE member discount and a coupon never stack; the larger one applies.
 *   - A coupon that loses to the member discount is not applied and not
 *     consumed, so a retry may still include it.
 *   - A member claim without a membership id is rejected, not silently ignored.
 */

import { eventBaseFeePaise } from "./helpers";

export interface PricingEvent {
	id: string;
	base_fee_paise?: number | null;
	price?: number | null;
	ieee_member_discount_percent?: number | null;
}

export interface PricingInput {
	isIeeeMember?: boolean;
	ieeeMembershipId?: string;
	couponCode?: string;
	/** Phase 3 sets this false when previewing without a provider. */
	validateProvider?: boolean;
}

/** A coupon row, already resolved by the caller. */
export interface CouponRow {
	id: string;
	code: string;
	discount_percent: number;
	max_uses: number;
	used_count: number;
}

export interface PricingSuccess {
	ok: true;
	baseFeePaise: number;
	ieeeDiscountPercent: number;
	ieeeDiscountPaise: number;
	couponDiscountPercent: number;
	couponDiscountPaise: number;
	appliedDiscountPaise: number;
	finalFeePaise: number;
	discountSource: "none" | "ieee_member" | "coupon";
	requestedCouponCode: string;
	appliedCouponCode: string;
	membershipId: string;
	couponRecord: CouponRow | null;
	label: string;
}

export interface PricingFailure {
	ok: false;
	status: number;
	code: string;
	error: string;
}

export type PricingResult = PricingSuccess | PricingFailure;

/** Coupon lookup, injected so pricing stays pure and testable. */
export interface CouponLookup {
	/** An active, unexpired coupon for this event, or null. */
	find(eventId: string, code: string): Promise<CouponRow | null>;
	/** How many active registrations already use this coupon. */
	activeUses(eventId: string, code: string): Promise<number>;
}

function num(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function ieeeDiscountPercent(event: PricingEvent): number {
	const percent = num(event.ieee_member_discount_percent);
	if (percent < 0) return 0;
	if (percent > 100) return 100;
	return percent;
}

/** Coupon codes are compared uppercase and trimmed. */
export function normalizedCouponCode(value: unknown): string {
	return String(value ?? "").trim().toUpperCase();
}

function failure(status: number, code: string, error: string): PricingFailure {
	return { ok: false, status, code, error };
}

/**
 * Compute the fee for a registration.
 *
 * `coupons` is only consulted when a code was supplied and the event is paid.
 */
export async function calculate(
	event: PricingEvent,
	input: PricingInput,
	coupons: CouponLookup,
): Promise<PricingResult> {
	const baseFeePaise = eventBaseFeePaise(event);
	const memberPercent = ieeeDiscountPercent(event);
	const memberClaim = input.isIeeeMember === true;
	const membershipId = String(input.ieeeMembershipId ?? "").trim().slice(0, 80);

	if (memberPercent > 0 && memberClaim && !membershipId) {
		return failure(
			400,
			"IEEE_MEMBERSHIP_ID_REQUIRED",
			"Enter your IEEE Membership ID to use the member price",
		);
	}

	const ieeeDiscountPaise =
		memberPercent > 0 && memberClaim && membershipId
			? Math.round((baseFeePaise * memberPercent) / 100)
			: 0;

	const requestedCouponCode = normalizedCouponCode(input.couponCode);
	let couponRecord: CouponRow | null = null;
	let couponDiscountPaise = 0;
	let couponPercent = 0;

	if (requestedCouponCode) {
		if (baseFeePaise <= 0) {
			return failure(400, "COUPONS_PAID_ONLY", "Coupons are only available for paid events");
		}
		couponRecord = await coupons.find(event.id, requestedCouponCode);
		if (!couponRecord) {
			return failure(400, "INVALID_COUPON", "Invalid or expired coupon code");
		}
		const maxUses = Number(couponRecord.max_uses) || 0;
		if (maxUses > 0) {
			const used = await coupons.activeUses(event.id, requestedCouponCode);
			if (used >= maxUses) {
				return failure(409, "COUPON_EXHAUSTED", "Coupon usage limit has been reached");
			}
		}
		couponPercent = Number(couponRecord.discount_percent) || 0;
		couponDiscountPaise = Math.round((baseFeePaise * couponPercent) / 100);
	}

	let discountSource: PricingSuccess["discountSource"] = "none";
	let appliedDiscountPaise = 0;
	let appliedCouponCode = "";

	// The larger discount wins; they never stack. A coupon that loses is not
	// applied and therefore not consumed.
	if (ieeeDiscountPaise > 0 && ieeeDiscountPaise >= couponDiscountPaise) {
		discountSource = "ieee_member";
		appliedDiscountPaise = ieeeDiscountPaise;
	} else if (couponDiscountPaise > 0) {
		discountSource = "coupon";
		appliedDiscountPaise = couponDiscountPaise;
		appliedCouponCode = requestedCouponCode;
	}

	const finalFeePaise = Math.max(0, baseFeePaise - appliedDiscountPaise);

	if (input.validateProvider !== false && finalFeePaise > 0 && finalFeePaise % 100 !== 0) {
		return failure(
			400,
			"PAYGATE_WHOLE_RUPEE_REQUIRED",
			"PayGate requires a whole-rupee final amount. Adjust the event price or discount.",
		);
	}

	let label = "Standard price";
	if (discountSource === "ieee_member") label = "IEEE member price applied";
	else if (discountSource === "coupon") label = `Coupon ${appliedCouponCode} applied`;

	return {
		ok: true,
		baseFeePaise,
		ieeeDiscountPercent: memberPercent,
		ieeeDiscountPaise,
		couponDiscountPercent: couponPercent,
		couponDiscountPaise,
		appliedDiscountPaise,
		finalFeePaise,
		discountSource,
		requestedCouponCode,
		appliedCouponCode,
		membershipId,
		couponRecord: discountSource === "coupon" ? couponRecord : null,
		label,
	};
}
