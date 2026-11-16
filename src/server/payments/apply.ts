/**
 * Apply a provider state to a registration — port of `applyProviderState` from
 * `pb_hooks/paygate-helpers.js`.
 *
 * Called by the webhook and by reconciliation, so both paths converge on the
 * same state machine. Every branch is inside the caller's transaction.
 *
 * The `noop` branch is deliberately non-mutating for provider state: a stale or
 * out-of-order terminal event must not regress a confirmed payment. It still
 * records the webhook event id (so retries stay idempotent) and re-syncs the
 * ledger (so an interrupted ledger write repairs itself).
 */

import { query } from "@/lib/db.server";
import { finalFeePaise, generateTicketId } from "@/server/registration/helpers";
import { recomputeCouponUsedCount, recomputeEventCounters } from "@/server/registration/waitlist";
import { syncPaymentLedger } from "./ledger";
import {
	PAYGATE_PROVIDER,
	expectedRequestedPaise,
	resolveProviderTransition,
	type ProviderPayment,
	type Transition,
} from "./paygate";

export interface ApplyRegistration {
	id: string;
	event_id: string;
	registration_status: string | null;
	payment_status: string | null;
	ticket_id: string | null;
	coupon_code: string | null;
	payment_data: string | null;
	final_fee_paise: number;
	discount_paise: number;
	base_fee_paise: number;
	amount: number | null;
}

function parseData(value: string | null): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/** Remember a webhook event id so a retry is recognised. */
function appendEventId(data: Record<string, unknown>, eventId: string): Record<string, unknown> {
	const seen = Array.isArray(data.eventIds) ? (data.eventIds as unknown[]).map(String) : [];
	if (!seen.includes(eventId)) seen.push(eventId);
	// Keep the list bounded; only recent ids matter for replay detection.
	return { ...data, eventIds: seen.slice(-50) };
}

export function hasEventId(data: Record<string, unknown>, eventId: string): boolean {
	const seen = Array.isArray(data.eventIds) ? (data.eventIds as unknown[]).map(String) : [];
	return seen.includes(eventId);
}

/** Merge provider fields into the registration's payment data. */
function updateProviderData(
	current: Record<string, unknown>,
	payment: ProviderPayment,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...current,
		provider: PAYGATE_PROVIDER,
		paymentId: payment.id,
		providerStatus: payment.status,
		requestedAmountPaise: payment.requestedAmountPaise,
		payableAmountPaise: payment.payableAmountPaise,
		payableAmount: payment.payableAmount,
		paidAt: payment.paidAt || current.paidAt || "",
		...patch,
	};
}

async function confirmRegistration(
	registration: ApplyRegistration,
	payment: ProviderPayment,
	eventId: string,
): Promise<void> {
	const data = appendEventId(
		updateProviderData(parseData(registration.payment_data), payment, {
			manualReview: false,
			reviewReason: "",
		}),
		eventId,
	);

	await query(
		`UPDATE registrations
		    SET registration_status = 'confirmed',
		        payment_status = 'paid',
		        ticket_id = CASE WHEN ticket_id IS NULL OR ticket_id = '' THEN ? ELSE ticket_id END,
		        payment_data = ?
		  WHERE id = ?`,
		[generateTicketId(), JSON.stringify(data), registration.id],
	);

	await syncPaymentLedger(registration, payment, { manualReview: false, reviewReason: "" });
	await recomputeEventCounters(registration.event_id);
	if (registration.coupon_code) {
		await recomputeCouponUsedCount(registration.coupon_code, registration.event_id);
	}
}

async function cancelRegistration(
	registration: ApplyRegistration,
	payment: ProviderPayment,
	eventId: string,
	reason: string,
	manualReview: boolean,
): Promise<void> {
	const data = appendEventId(
		updateProviderData(parseData(registration.payment_data), payment, {
			manualReview,
			reviewReason: reason,
		}),
		eventId,
	);

	await query(
		`UPDATE registrations
		    SET registration_status = 'cancelled',
		        payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'failed' END,
		        payment_data = ?
		  WHERE id = ?`,
		[JSON.stringify(data), registration.id],
	);

	await syncPaymentLedger(registration, payment, { manualReview, reviewReason: reason });
	await recomputeEventCounters(registration.event_id);
	if (registration.coupon_code) {
		await recomputeCouponUsedCount(registration.coupon_code, registration.event_id);
	}
}

/**
 * Apply one provider event.
 *
 * Returns the transition so the caller can decide whether to notify.
 */
export async function applyProviderState(
	registration: ApplyRegistration,
	payment: ProviderPayment,
	eventType: string,
	eventId: string,
): Promise<Transition> {
	const data = parseData(registration.payment_data);
	const expectedPaise = expectedRequestedPaise(Number(registration.amount) || 0);

	if (eventType !== `payment.${payment.status}`) {
		return { action: "error", error: "PayGate event type does not match payment status" };
	}

	const transition = resolveProviderTransition({
		eventType,
		registrationStatus: registration.registration_status ?? "",
		paymentStatus: registration.payment_status ?? "",
		amountMatches: payment.requestedAmountPaise === expectedPaise,
		paymentIdMatches: !data.paymentId || String(data.paymentId) === payment.id,
	});

	if (transition.action === "error") return transition;

	if (transition.action === "noop") {
		// Non-mutating for provider state, but remember the event id and repair
		// the ledger if an earlier write was interrupted.
		if (eventId) {
			await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
				JSON.stringify(appendEventId(data, eventId)),
				registration.id,
			]);
		}
		await syncPaymentLedger(registration, payment, {
			manualReview: data.manualReview === true,
			reviewReason: String(data.reviewReason ?? ""),
		});
		return transition;
	}

	if (transition.action === "confirm") {
		await confirmRegistration(registration, payment, eventId);
		return transition;
	}

	if (transition.action === "cancel") {
		await cancelRegistration(registration, payment, eventId, "PayGate payment was cancelled", false);
		return transition;
	}

	if (transition.action === "mark_expired") {
		const expired = appendEventId(
			updateProviderData(data, payment, { providerStatus: "expired", manualReview: false }),
			eventId,
		);
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify(expired),
			registration.id,
		]);
		await syncPaymentLedger(registration, payment, { manualReview: false, reviewReason: "" });
		return transition;
	}

	if (transition.action === "manual_review") {
		const cancelled = registration.registration_status === "cancelled";
		const reason =
			eventType === "payment.late"
				? "PayGate detected a payment after the accepted payment window"
				: "PayGate reported payment after the registration seat was released";

		if (cancelled) {
			const review = appendEventId(
				updateProviderData(data, payment, {
					providerStatus: payment.status,
					manualReview: true,
					reviewReason: reason,
				}),
				eventId,
			);
			await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
				JSON.stringify(review),
				registration.id,
			]);
			await syncPaymentLedger(registration, payment, { manualReview: true, reviewReason: reason });
		} else {
			await cancelRegistration(registration, payment, eventId, reason, true);
		}
		return transition;
	}

	// Any other transition: record provider data only.
	const next = appendEventId(updateProviderData(data, payment, {}), eventId);
	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify(next),
		registration.id,
	]);
	return transition;
}

export { finalFeePaise };
