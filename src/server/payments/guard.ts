/**
 * Payment confirmation guard — port of `pb_hooks/paygate-registration-guard.js`.
 *
 * The scenario this exists for: a payment is real, but the seat it was meant to
 * buy is gone. The event was cancelled, the registration was cancelled and its
 * capacity released, or the event was soft-deleted. Issuing a ticket would
 * resurrect released capacity or a cancelled event, so the payment is recorded
 * for manual review instead.
 *
 * Money is never discarded — it is parked, not applied.
 */

import { query } from "@/lib/db.server";

export interface GuardRegistration {
	id: string;
	event_id: string;
	registration_status: string | null;
}

export interface Disposition {
	blocked: boolean;
	reason: string;
}

/**
 * May a successful payment mint/confirm a ticket for this registration?
 *
 * A missing registration, a cancelled registration, a missing/cancelled/deleted
 * event all block. Everything else allows.
 */
export async function paymentConfirmationDisposition(
	registration: GuardRegistration | undefined,
): Promise<Disposition> {
	if (!registration) {
		return { blocked: true, reason: "Payment arrived for an unavailable registration" };
	}
	if (registration.registration_status === "cancelled") {
		return {
			blocked: true,
			reason: "PayGate reported a successful payment after the registration seat was released",
		};
	}
	if (!registration.event_id) {
		return { blocked: true, reason: "Payment arrived for a registration with no event" };
	}

	const found = await query<{ status: string | null; is_deleted: number }>(
		"SELECT status, is_deleted FROM events WHERE id = ?",
		[registration.event_id],
	);
	const event = found.rows[0];
	if (!event) {
		return { blocked: true, reason: "Payment arrived after the event became unavailable" };
	}
	if (event.is_deleted === 1) {
		return { blocked: true, reason: "Payment arrived after the event was archived" };
	}
	if (event.status === "cancelled") {
		return { blocked: true, reason: "Payment arrived after the event was cancelled" };
	}
	return { blocked: false, reason: "" };
}

/**
 * Park a blocked payment for manual review.
 *
 * The registration keeps its cancelled/failed state; only the payment data and
 * the ledger record that money arrived.
 */
export async function recordPaidManualReview(
	registrationId: string,
	payment: { id: string; payableAmountPaise: number; paidAt: string },
	eventId: string,
	reason: string,
): Promise<void> {
	const found = await query<{ payment_data: string | null }>(
		"SELECT payment_data FROM registrations WHERE id = ?",
		[registrationId],
	);
	const current = found.rows[0]?.payment_data;
	let data: Record<string, unknown> = {};
	if (current) {
		try {
			const parsed: unknown = JSON.parse(current);
			if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
		} catch {
			data = {};
		}
	}

	data.paymentId = payment.id;
	data.providerStatus = "paid";
	data.manualReview = true;
	data.reviewReason = reason;
	data.paidAt = payment.paidAt || new Date().toISOString();
	data.payableAmountPaise = payment.payableAmountPaise;

	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify(data),
		registrationId,
	]);
	await query(
		`INSERT INTO admin_audit_log (id, event_id, registration_id, action, note, outcome)
		 VALUES (?, ?, ?, 'payment.manual-review', ?, 'success')`,
		[crypto.randomUUID(), eventId, registrationId, reason.slice(0, 2000)],
	);
}
