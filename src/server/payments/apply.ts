/**
 * Apply a provider state to a registration — port of `applyProviderState` from
 * `pb_hooks/paygate-helpers.js`, plus the one transaction all three payment
 * paths use.
 *
 * The signed webhook, the reconciliation pass's provider read and the attendee's
 * "check this payment" refresh all end in `applyProviderPaymentToRegistration`,
 * which re-reads the row under the write lock and then calls
 * `applyProviderState`. So the three paths converge on one state machine and on
 * one transaction: whichever arrives first wins, the others become no-ops, and
 * the reservation state, ledger row and notification outbox rows commit or roll
 * back together.
 *
 * The `noop` branch is deliberately non-mutating for provider state: a stale or
 * out-of-order terminal event must not regress a confirmed payment. It still
 * records the webhook event id (so retries stay idempotent) and re-syncs the
 * ledger (so an interrupted ledger write repairs itself).
 */

import { query, withTransaction } from "@/lib/db.server";
import { enqueueForRegistration } from "@/server/notifications/outbox";
import { finalFeePaise, generateTicketId } from "@/server/registration/helpers";
import { recomputeCouponUsedCount, recomputeEventCounters } from "@/server/registration/waitlist";
import { paymentConfirmationDisposition, recordPaidManualReview } from "./guard";
import { syncPaymentLedger } from "./ledger";
import {
	PAYGATE_PROVIDER,
	deploymentNamespace,
	eventMatchesStatus,
	eventTypeForStatus,
	getConfig,
	readProviderPayment,
	resolveProviderTransition,
	validateProviderPayment,
	type ProviderPayment,
	type Transition,
	type TransitionAction,
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
	// `finalFeePaise` is authoritative (paise, with the legacy rupee fallback);
	// `amount` alone would reject a migrated row whose paise column is set.
	const expectedPaise = finalFeePaise(registration);

	if (!eventMatchesStatus(eventType, payment.status)) {
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

// ---------------------------------------------------------------------------
// One scoped, idempotent transaction shared by poll, webhook and user refresh
// ---------------------------------------------------------------------------

/**
 * Queue the ticket/receipt for a registration.
 *
 * `enqueueForRegistration` only writes outbox rows — it never transmits mail —
 * so it is safe inside the transition's transaction. Returning its promise (not
 * awaiting it) keeps the SQLite work on the transaction's connection.
 */
function enqueueWithinTransaction(registrationId: string): Promise<unknown> {
	return enqueueForRegistration(registrationId);
}

export interface ProviderConfirmationResult {
	/** The transition the state machine chose. `""` when the read could not be applied. */
	action: TransitionAction | "";
	error?: string;
	/** Why nothing was applied: a stale read, a changed identity. */
	reason?: string;
	/** True when the caller's provider read must not be used (kept, retried later). */
	retry?: boolean;
	/** True when the registration row no longer exists. */
	missing?: boolean;
	registrationStatus?: string;
	paymentStatus?: string;
}

/**
 * Apply one confirmed provider payment to one registration, atomically.
 *
 * This is the single transition used by all three paths:
 *   - the signed webhook (after its signature check and identity validation),
 *   - the reconciliation pass's provider read,
 *   - the attendee's "check this payment" refresh.
 *
 * It takes the write lock, re-reads the row, and re-validates against the live
 * state — so a webhook, a poll and a user refresh that race produce one
 * transition, and a stale read (the identity or amount changed since it was
 * fetched) is refused rather than misapplied. The reservation state, the
 * payment row and the outbox rows commit together; no SMTP runs here.
 *
 * Notifications are queued on `confirm` and on `noop`, matching the hook: a
 * `noop` still repairs an outbox write that an earlier pass lost.
 */
export async function applyProviderPaymentToRegistration(input: {
	registrationId: string;
	payment: ProviderPayment;
	eventType: string;
	/** "" when the provider was polled rather than signed. */
	eventId: string;
	/**
	 * Skip the provider identity/amount checks. Only for callers that already
	 * validated this exact payload (the webhook) — and even then amount and
	 * identity are re-checked against the live row below.
	 */
	revalidate?: boolean;
}): Promise<ProviderConfirmationResult> {
	return withTransaction(async (): Promise<ProviderConfirmationResult> => {
		const found = await query<Record<string, unknown> & ApplyRegistration>(
			`SELECT * FROM registrations WHERE id = ?`,
			[input.registrationId],
		);
		const registration = found.rows[0];
		if (!registration) return { action: "", missing: true };

		const live = parseData(registration.payment_data);
		if (live.provider !== PAYGATE_PROVIDER) {
			return { action: "", reason: "provider_changed", retry: true };
		}
		// The read that produced this payment must still describe the live row.
		if (live.paymentId && String(live.paymentId) !== input.payment.id) {
			return { action: "", reason: "payment_id_changed", retry: true };
		}

		const finalPaise = finalFeePaise(registration);
		if (finalPaise <= 0 || finalPaise % 100 !== 0) {
			return { action: "", reason: "amount_not_payable" };
		}

		if (input.revalidate !== false) {
			const validated = validateProviderPayment(input.payment, finalPaise / 100, {
				paymentId: input.payment.id,
				externalId: registration.event_id,
				registrationId: registration.id,
				environment: deploymentNamespace(),
			});
			if (!validated.ok) return { action: "", reason: validated.error };
		} else if (input.payment.requestedAmountPaise !== finalPaise) {
			return { action: "error", error: "Amount mismatch" };
		}

		// Money that arrives after the seat was released is parked, not applied.
		if (input.payment.status === "paid") {
			const disposition = await paymentConfirmationDisposition(registration);
			if (disposition.blocked) {
				await recordPaidManualReview(
					registration.id,
					{
						id: input.payment.id,
						payableAmountPaise: input.payment.payableAmountPaise,
						paidAt: input.payment.paidAt,
					},
					registration.event_id,
					disposition.reason,
				);
				await syncPaymentLedger(registration, input.payment, {
					manualReview: true,
					reviewReason: disposition.reason,
				});
				return { action: "manual_review", reason: disposition.reason };
			}
		}

		const result = await applyProviderState(
			registration,
			input.payment,
			input.eventType,
			input.eventId,
		);
		if (result.action === "error") return { action: "error", error: result.error };

		if (result.action === "confirm" || result.action === "noop") {
			await enqueueWithinTransaction(registration.id);
		}

		const after = await query<{ registration_status: string; payment_status: string }>(
			`SELECT registration_status, payment_status FROM registrations WHERE id = ?`,
			[registration.id],
		);
		return {
			action: result.action,
			registrationStatus: after.rows[0]?.registration_status,
			paymentStatus: after.rows[0]?.payment_status,
		};
	});
}

/**
 * The attendee/admin "refresh this payment" operation.
 *
 * Reads the provider (bounded, validated) and applies the result through the
 * shared transition. Unlike the old local-only refresh it can confirm a payment
 * whose webhook was lost.
 *
 * The rule it must never break: **it may end a reservation only on an
 * affirmative provider answer.** A 404 is not one — it can mean a wrong or
 * versioned path, a key scoped to another merchant, or a retention window — so
 * an initialised reservation is held for the reconciliation pass and for an
 * operator instead of being released. A read that is switched off is reported
 * as unverified, not as a provider outage.
 */
export async function syncRegistrationWithProvider(
	registrationId: string,
	options: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: number } = {},
): Promise<{
	state: ProviderConfirmationResult;
	providerReachable: boolean;
	/** False when the provider read is switched off, so nothing could be checked. */
	providerVerified: boolean;
	probablyExpired: boolean;
}> {
	const read = await readProviderPayment(
		await paymentIdFor(registrationId),
		{ registrationId },
		options.fetchImpl ?? fetch,
		getConfig(),
		options.timeoutMs,
	);

	if (read.kind === "ok") {
		const state = await applyProviderPaymentToRegistration({
			registrationId,
			payment: read.payment,
			eventType: eventTypeForStatus(read.payment.status),
			eventId: "",
		});
		return { state, providerReachable: true, providerVerified: true, probablyExpired: false };
	}

	if (read.kind === "disabled") {
		return {
			state: { action: "", reason: "provider_read_disabled", retry: false },
			providerReachable: true,
			providerVerified: false,
			probablyExpired: false,
		};
	}

	// A 404, 401/403 scope, 429, timeout or contradictory body: hold and retry.
	// In particular a 404 never releases an initialised reservation.
	return {
		state: {
			action: "",
			reason: read.kind === "invalid" ? "invalid_provider_response" : "provider_unavailable",
			retry: true,
		},
		providerReachable: false,
		providerVerified: false,
		probablyExpired: false,
	};
}

async function paymentIdFor(registrationId: string): Promise<string> {
	const found = await query<{ payment_data: string | null }>(
		"SELECT payment_data FROM registrations WHERE id = ?",
		[registrationId],
	);
	return String(parseData(found.rows[0]?.payment_data ?? null).paymentId ?? "");
}

export { finalFeePaise };
