/**
 * `POST /api/events/:id/pricing-preview` — read-only price computation.
 *
 * No charge and no provider call. Phase 3 reuses the same `calculate()` with the
 * provider validation switched on.
 */

import type { ActionFunctionArgs } from "react-router";
import { query } from "@/lib/db.server";
import { requireApiUser } from "@/server/auth/session.server";
import { couponLookup } from "@/server/registration/coupons";
import { calculate } from "@/server/registration/pricing";
import { registrationMode, registrationWindowOpen, type EventRow } from "@/server/registration/waitlist";

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}

	await requireApiUser(request);
	const eventId = String(params.id ?? "");
	const body = (await request.json().catch(() => ({}))) as {
		isIeeeMember?: boolean;
		ieeeMembershipId?: string;
		couponCode?: string;
	};

	const found = await query<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
	const event = found.rows[0];
	if (!event) return json({ error: "Event not found" }, 404);
	if (event.is_deleted === 1 || event.status !== "published") {
		return json({ error: "Event is not available for registration" }, 400);
	}
	if (registrationMode(event) !== "internal" || !registrationWindowOpen(event, Date.now())) {
		return json({ error: "Registration is closed for this event" }, 400);
	}

	const result = await calculate(
		{
			id: event.id,
			base_fee_paise: event.base_fee_paise,
			price: event.price,
			ieee_member_discount_percent: event.ieee_member_discount_percent,
		},
		{
			isIeeeMember: body.isIeeeMember === true,
			ieeeMembershipId: body.ieeeMembershipId,
			couponCode: body.couponCode,
		},
		couponLookup,
	);

	if (!result.ok) return json({ code: result.code, error: result.error }, result.status);

	return json(
		{
			baseFeePaise: result.baseFeePaise,
			ieeeDiscountPercent: result.ieeeDiscountPercent,
			ieeeDiscountPaise: result.ieeeDiscountPaise,
			couponDiscountPercent: result.couponDiscountPercent,
			couponDiscountPaise: result.couponDiscountPaise,
			appliedDiscountPaise: result.appliedDiscountPaise,
			finalFeePaise: result.finalFeePaise,
			baseAmount: result.baseFeePaise / 100,
			discountAmount: result.appliedDiscountPaise / 100,
			amount: result.finalFeePaise / 100,
			discountSource: result.discountSource,
			requestedCouponCode: result.requestedCouponCode,
			appliedCouponCode: result.appliedCouponCode,
			label: result.label,
		},
		200,
	);
}

export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
