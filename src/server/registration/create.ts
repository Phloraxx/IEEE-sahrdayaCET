/**
 * The registration create command.
 *
 * Port of `POST /api/app/events/{id}/register` from
 * `pb_hooks/registration-create.pb.js`.
 *
 * Everything below runs inside **one** `withTransaction` (BEGIN IMMEDIATE), so
 * the capacity check, the insert, the waitlist reconciliation and the counter
 * updates are a single atomic unit. That is what makes overselling impossible:
 * the read of "how many seats are taken" and the write that takes one cannot be
 * separated by another request.
 *
 * Order matters and is preserved from the hook:
 *   1. event availability
 *   2. a previous manual-review payment blocks a second attempt
 *   3. idempotent replay (before the window checks — a retry may recover its
 *      committed response even if the event closed in between)
 *   4. registration window / time semantics
 *   5. eligibility
 *   6. required form fields
 *   7. waitlist reconciliation, then capacity
 *   8. pricing
 *   9. insert + waitlist acceptance + counters
 */

import { query, withTransaction } from "@/lib/db.server";
import { evaluateAudienceEligibility } from "@/lib/event-audience";
import { getEventEndTimestamp, type EventLifecycleInput } from "@/lib/event-lifecycle";
import { couponLookup } from "./coupons";
import {
	amountRupees,
	finalFeePaise,
	generatePaymentTicketId,
	generateTicketId,
	jsonObject,
	replayCompatible,
} from "./helpers";
import { calculate } from "./pricing";
import {
	activeOffers,
	activeRegistrations,
	cancellationPolicy as _unusedPolicy,
	dateMs,
	lifecycleOf,
	reconcileEventWaitlist,
	registrationMode,
	updateSeatCounters,
	validOfferForUser,
	type EventRow,
	type RegistrationRow,
} from "./waitlist";

export interface CreateInput {
	eventId: string;
	userId: string;
	/** Free-form answers from the registration form. */
	formResponses: Record<string, unknown>;
	couponCode?: string;
	/** Injected for tests; defaults to now. */
	now?: Date;
}

export interface CreateSuccess {
	ok: true;
	status: number;
	registrationId: string;
	ticketId: string;
	paymentRequired: boolean;
	amount: number;
	registrationStatus: string;
	paymentStatus: string;
	reused: boolean;
}

export interface CreateFailure {
	ok: false;
	status: number;
	code: string;
	error: string;
}

export type CreateResult = CreateSuccess | CreateFailure;

function fail(status: number, code: string, error: string): CreateFailure {
	return { ok: false, status, code, error };
}

/** Parse a JSON array column into a string array. */
function jsonArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

interface FormField {
	id?: string;
	name?: string;
	label?: string;
	required?: boolean;
}

function formFields(value: string | null): FormField[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is FormField => typeof item === "object" && item !== null);
	} catch {
		return [];
	}
}

/**
 * Create (or idempotently replay) a registration.
 *
 * Returns a result object rather than throwing, so the route can map it to a
 * status code without a try/catch ladder.
 */
export async function createRegistration(input: CreateInput): Promise<CreateResult> {
	const now = input.now ?? new Date();
	const nowMs = now.getTime();
	const nowIsoValue = now.toISOString();
	const responses = input.formResponses ?? {};
	const couponCode = String(input.couponCode ?? "").trim().toUpperCase();

	try {
		return await withTransaction(async (): Promise<CreateResult> => {
			const found = await query<EventRow>("SELECT * FROM events WHERE id = ?", [input.eventId]);
			const event = found.rows[0];
			if (!event) return fail(404, "EVENT_NOT_FOUND", "Event not found");

			if (event.is_deleted === 1 || event.status !== "published") {
				return fail(400, "EVENT_UNAVAILABLE", "Event is not available for registration");
			}

			// A cancelled registration whose payment is under organizer review is
			// financially real: never allow a second attempt (and a possible second
			// charge) while that review is open.
			const previous = await query<RegistrationRow>(
				"SELECT * FROM registrations WHERE user_id = ? AND event_id = ?",
				[input.userId, input.eventId],
			);
			for (const row of previous.rows) {
				if (row.registration_status !== "cancelled") continue;
				const data = jsonObject(row.payment_data);
				if (data.manualReview === true) {
					return fail(
						400,
						"PAYMENT_UNDER_REVIEW",
						"A previous payment for this event is under organizer review",
					);
				}
			}

			// Idempotent replay. Runs before the window checks on purpose: a retry
			// must be able to recover its committed response even if the event has
			// closed in the meantime.
			const duplicates = await query<RegistrationRow>(
				`SELECT * FROM registrations
				  WHERE user_id = ? AND event_id = ? AND registration_status <> 'cancelled'
				  LIMIT 1`,
				[input.userId, input.eventId],
			);
			const existing = duplicates.rows[0];
			if (existing) {
				const existingCoupon = existing.coupon_code ?? "";
				const sameCoupon =
					existingCoupon === couponCode ||
					(existing.discount_source === "ieee_member" && existingCoupon === "");
				if (!sameCoupon || !replayCompatible(existing.form_responses, responses)) {
					return fail(409, "ALREADY_REGISTERED", "You are already registered for this event");
				}

				const needsPayment =
					existing.registration_status === "pending" &&
					existing.payment_status === "pending" &&
					finalFeePaise(existing) > 0;

				return {
					ok: true,
					status: 200,
					registrationId: existing.id,
					ticketId: (needsPayment ? existing.payment_ticket_id : existing.ticket_id) ?? "",
					paymentRequired: needsPayment,
					amount: amountRupees(existing),
					registrationStatus: existing.registration_status ?? "",
					paymentStatus: existing.payment_status ?? "",
					reused: true,
				};
			}

			// Registration window.
			const mode = registrationMode(event);
			if (mode !== "internal") {
				return fail(
					400,
					"REGISTRATION_CLOSED",
					mode === "external"
						? "This event uses external registration"
						: "Registration is closed for this event",
				);
			}
			if (event.registration_open !== 1) {
				return fail(400, "REGISTRATION_CLOSED", "Registration is closed for this event");
			}

			const lifecycle = lifecycleOf(event);
			const end = getEventEndTimestamp(lifecycle);
			if (end !== null && end <= nowMs) {
				return fail(400, "EVENT_ENDED", "This event has already ended");
			}
			const startMs = dateMs(event.registration_start);
			if (startMs && startMs > nowMs) {
				return fail(400, "REGISTRATION_NOT_OPEN", "Registration has not opened yet");
			}
			const deadlineMs = dateMs(event.registration_deadline);
			if (deadlineMs && deadlineMs < nowMs) {
				return fail(400, "REGISTRATION_CLOSED", "Registration deadline has passed");
			}

			// Eligibility, before capacity or a coupon can be consumed.
			const eligibility = evaluateAudienceEligibility(
				{
					eligibleSemesters: jsonArray(event.eligible_semesters),
					eligibleProgrammes: jsonArray(event.eligible_programmes),
				},
				{
					programmeCode: String(responses.programmeCode ?? ""),
					branch: String(responses.branch ?? ""),
					semester: String(responses.semester ?? ""),
				},
			);
			if (!eligibility.eligible) {
				return fail(400, eligibility.code, eligibility.message);
			}

			// Required dynamic form fields.
			for (const field of formFields(event.form_template)) {
				if (!field.required) continue;
				const key = String(field.name ?? field.id ?? "");
				let value = responses[key];
				if (value === undefined && field.id) value = responses[field.id];
				const missing =
					value === undefined ||
					value === null ||
					(typeof value === "string" && value.trim() === "");
				if (missing) {
					return fail(
						400,
						"REQUIRED_FIELD_MISSING",
						`Required field '${String(field.label ?? key)}' is missing`,
					);
				}
			}

			// Reconcile the waitlist before deciding capacity: an unexpired offer is
			// a real reservation, and a direct registration may not steal it.
			await reconcileEventWaitlist(input.eventId, nowIsoValue);

			const refreshed = await query<EventRow>("SELECT * FROM events WHERE id = ?", [
				input.eventId,
			]);
			const currentEvent = refreshed.rows[0] ?? event;

			const activeRegs = await activeRegistrations(input.eventId);
			const offers = await activeOffers(input.eventId, nowMs);
			const offer = await validOfferForUser(input.eventId, input.userId, nowMs);
			const maxCapacity = Number(currentEvent.max_capacity) || 0;

			if (maxCapacity > 0) {
				const occupied = activeRegs.length + offers.length;
				const blocked = offer
					? activeRegs.length >= maxCapacity
					: occupied >= maxCapacity;
				if (blocked) {
					return fail(409, "EVENT_FULL", "Event is at full capacity");
				}
			}

			// Pricing.
			const pricing = await calculate(
				{
					id: currentEvent.id,
					base_fee_paise: currentEvent.base_fee_paise,
					price: currentEvent.price,
					ieee_member_discount_percent: currentEvent.ieee_member_discount_percent,
				},
				{
					isIeeeMember: responses.isIeeeMember === true,
					ieeeMembershipId: String(responses.ieeeMembershipId ?? ""),
					couponCode,
				},
				couponLookup,
			);
			if (!pricing.ok) return fail(pricing.status, pricing.code, pricing.error);

			const needsPayment = pricing.finalFeePaise > 0;
			const registrationId = crypto.randomUUID();
			const ticketId = needsPayment ? "" : generateTicketId();
			const paymentTicketId = needsPayment ? generatePaymentTicketId() : "";

			await query(
				`INSERT INTO registrations (
				   id, user_id, event_id, user_name, user_email, user_phone, form_responses,
				   payment_status, registration_status, ticket_id, checked_in, payment_ticket_id,
				   amount, payment_data, registration_date, coupon_code, discount_amount,
				   registration_source, base_fee_paise, discount_paise, final_fee_paise,
				   programme_code, semester, ieee_member, ieee_member_id, discount_source
				 ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				[
					registrationId,
					input.userId,
					input.eventId,
					String(responses.name ?? ""),
					String(responses.email ?? ""),
					String(responses.phone ?? ""),
					JSON.stringify(responses),
					needsPayment ? "pending" : "not_required",
					needsPayment ? "pending" : "confirmed",
					ticketId,
					0,
					paymentTicketId,
					pricing.finalFeePaise / 100,
					needsPayment ? JSON.stringify({ provider: "paygate", providerStatus: "not_initialized" }) : null,
					nowIsoValue,
					pricing.appliedCouponCode || null,
					pricing.appliedDiscountPaise / 100,
					"self_service",
					pricing.baseFeePaise,
					pricing.appliedDiscountPaise,
					pricing.finalFeePaise,
					eligibility.programmeCode || null,
					eligibility.semester || null,
					responses.isIeeeMember === true ? 1 : 0,
					String(responses.ieeeMembershipId ?? "").trim().slice(0, 80) || null,
					pricing.discountSource,
				],
			);

			// Consume the offer this attendee was holding.
			if (offer) {
				await query(
					`UPDATE event_waitlist
					    SET status = 'accepted', active_key = NULL, accepted_registration = ?
					  WHERE id = ?`,
					[registrationId, offer.id],
				);
			}

			await updateSeatCounters(currentEvent, nowMs);

			if (pricing.discountSource === "coupon" && pricing.appliedCouponCode) {
				const used = await query<{ n: number }>(
					`SELECT count(*) AS n FROM registrations
					  WHERE coupon_code = ? AND event_id = ? AND registration_status <> 'cancelled'`,
					[pricing.appliedCouponCode, input.eventId],
				);
				await query("UPDATE coupons SET used_count = ? WHERE code = ? AND event_id = ?", [
					used.rows[0]?.n ?? 0,
					pricing.appliedCouponCode,
					input.eventId,
				]);
			}

			return {
				ok: true,
				status: 201,
				registrationId,
				ticketId: needsPayment ? paymentTicketId : ticketId,
				paymentRequired: needsPayment,
				amount: pricing.finalFeePaise / 100,
				registrationStatus: needsPayment ? "pending" : "confirmed",
				paymentStatus: needsPayment ? "pending" : "not_required",
				reused: false,
			};
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// The partial unique index is the last line of defence against a double
		// seat; surface it as a conflict rather than a 500.
		if (/UNIQUE|registrations_active_uq/i.test(message)) {
			return fail(409, "ALREADY_REGISTERED", "You are already registered for this event");
		}
		return fail(500, "REGISTRATION_FAILED", "Could not complete this registration");
	}
}

export type { EventLifecycleInput };
