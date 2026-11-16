/**
 * Self-service cancellation.
 *
 * Port of `POST /api/app/registrations/{id}/cancel` from
 * `pb_hooks/attendee-lifecycle.pb.js`.
 *
 * Two outcomes, decided by the event's policy:
 *   - `cancelled` (200): an unpaid registration is released immediately, the
 *     seat goes back to the pool, and the waitlist is reconciled so the next
 *     waiting attendee is offered it.
 *   - `refund_requested` (202): a paid registration cannot be cancelled
 *     unilaterally; a request is opened for a finance decision.
 *
 * Idempotent: cancelling an already-cancelled registration returns the same
 * `cancelled` outcome instead of a conflict, so a double-submit or a retry is
 * safe.
 */

import { query, withTransaction } from "@/lib/db.server";
import {
	cancelUnpaidRegistration,
	cancellationPolicy,
	createRefundRequest,
	recomputeCouponUsedCount,
	reconcileEventWaitlist,
	requestSnapshot,
	type EventRow,
	type RegistrationRow,
} from "./waitlist";

export interface CancelInput {
	registrationId: string;
	userId: string;
	reason?: string;
	now?: Date;
}

export interface CancelSuccess {
	ok: true;
	status: number;
	action: "cancelled" | "refund_requested";
	registration?: Record<string, unknown>;
	request?: ReturnType<typeof requestSnapshot>;
}

export interface CancelFailure {
	ok: false;
	status: number;
	code: string;
	error: string;
}

export type CancelResult = CancelSuccess | CancelFailure;

function fail(status: number, code: string, error: string): CancelFailure {
	return { ok: false, status, code, error };
}

/** A small projection of the registration for the response. */
function snapshot(row: RegistrationRow): Record<string, unknown> {
	return {
		id: row.id,
		eventId: row.event_id,
		registrationStatus: row.registration_status ?? "",
		paymentStatus: row.payment_status ?? "",
		ticketId: row.ticket_id ?? "",
	};
}

export async function cancelRegistration(input: CancelInput): Promise<CancelResult> {
	const now = input.now ?? new Date();
	const nowIsoValue = now.toISOString();
	const nowMs = now.getTime();
	const reason = String(input.reason ?? "").trim();

	try {
		return await withTransaction(async (): Promise<CancelResult> => {
			const found = await query<RegistrationRow>("SELECT * FROM registrations WHERE id = ?", [
				input.registrationId,
			]);
			const registration = found.rows[0];
			if (!registration) {
				return fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
			}

			// IDOR guard: a registration id is not a capability. Someone else's id
			// answers 404, not 403, so existence is not disclosed.
			if (registration.user_id !== input.userId) {
				return fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
			}

			// Idempotent replay: already cancelled is a success, not a conflict.
			if (registration.registration_status === "cancelled") {
				return { ok: true, status: 200, action: "cancelled", registration: snapshot(registration) };
			}

			const eventFound = await query<EventRow>("SELECT * FROM events WHERE id = ?", [
				registration.event_id,
			]);
			const event = eventFound.rows[0];
			if (!event) return fail(404, "EVENT_NOT_FOUND", "Event not found");

			const policy = await cancellationPolicy(event, registration, nowMs);
			if (!policy.allowed) {
				return fail(
					409,
					"SELF_CANCELLATION_NOT_AVAILABLE",
					"Self-cancellation is not available for this registration",
				);
			}

			if (policy.mode === "refund_request") {
				const request = await createRefundRequest(
					registration,
					event,
					input.userId,
					reason,
					nowIsoValue,
				);
				await audit(event.id, registration.id, input.userId, "registration.refund-requested", reason);
				return {
					ok: true,
					status: 202,
					action: "refund_requested",
					request: requestSnapshot(request),
				};
			}

			const couponCode = registration.coupon_code ?? "";
			await cancelUnpaidRegistration(registration, input.userId, reason, nowIsoValue);
			// Releasing the seat may let the waitlist promote someone.
			await reconcileEventWaitlist(event.id, nowIsoValue);
			if (couponCode) await recomputeCouponUsedCount(couponCode, event.id);
			await audit(event.id, registration.id, input.userId, "registration.self-cancelled", reason);

			const after = await query<RegistrationRow>("SELECT * FROM registrations WHERE id = ?", [
				registration.id,
			]);
			return {
				ok: true,
				status: 200,
				action: "cancelled",
				registration: snapshot(after.rows[0] ?? registration),
			};
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message === "PAID_REGISTRATION_REQUIRES_REQUEST") {
			return fail(
				409,
				"REFUND_REQUEST_REQUIRED",
				"A paid registration must be cancelled through a refund request",
			);
		}
		return fail(500, "CANCELLATION_FAILED", "Could not cancel this registration");
	}
}

/** Append an audit row. Best-effort: never fails the command. */
async function audit(
	eventId: string,
	registrationId: string,
	actorId: string,
	action: string,
	note: string,
): Promise<void> {
	try {
		await query(
			`INSERT INTO admin_audit_log
			   (id, event_id, registration_id, actor_id, action, note, outcome)
			 VALUES (?, ?, ?, ?, ?, ?, 'success')`,
			[crypto.randomUUID(), eventId, registrationId, actorId, action, note.slice(0, 2000)],
		);
	} catch {
		// Audit is not allowed to break a user action.
	}
}
