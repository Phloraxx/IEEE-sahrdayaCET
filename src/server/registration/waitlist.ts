/**
 * Waitlist and cancellation semantics — port of `pb_hooks/attendee-lifecycle-helpers.js`.
 *
 * These functions read and write the database directly. They are only called
 * from inside `withTransaction`, so `query()` joins the ambient transaction and
 * a reconcile is atomic with the registration that triggered it.
 *
 * The model, unchanged from PocketBase:
 *   - A seat is occupied by an *active registration* (pending or confirmed) or
 *     by an unexpired *offer* to a waitlisted attendee.
 *   - `registered_count` counts active registrations; `waitlist_reserved_count`
 *     counts unexpired offers.
 *   - Offers expire, and an expired offer releases its seat.
 *   - A direct registration may not steal a seat that is offered to someone.
 */

import { query } from "@/lib/db.server";
import { getEventEndTimestamp, type EventLifecycleInput } from "@/lib/event-lifecycle";
import { nowIso } from "@/lib/db.server";

/** Parse an ISO string to epoch ms, or 0. */
export function dateMs(value: string | null | undefined): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export interface EventRow {
	id: string;
	// Display columns, used by the my-events projection.
	title: string;
	slug: string;
	venue: string | null;
	timezone: string | null;
	attendance_mode: string | null;
	location_address: string | null;
	banner: string | null;
	society_id: string | null;
	// Lifecycle and capacity columns.
	status: string | null;
	date: string;
	end_date: string | null;
	time_tbc: number;
	is_deleted: number;
	registration_open: number;
	registration_mode: string | null;
	external_form_url: string | null;
	registration_start: string | null;
	registration_deadline: string | null;
	max_capacity: number | null;
	waitlist_enabled: number;
	waitlist_offer_minutes: number;
	allow_self_cancellation: number;
	self_cancellation_until: string | null;
	refund_request_until: string | null;
	refund_policy: string | null;
	price: number | null;
	base_fee_paise: number | null;
	ieee_member_discount_percent: number;
	eligible_semesters: string | null;
	eligible_programmes: string | null;
	form_template: string | null;
}

/** The lifecycle shape `event-lifecycle.ts` expects. */
export function lifecycleOf(event: EventRow): EventLifecycleInput {
	return {
		status: event.status,
		date: event.date,
		endDate: event.end_date,
		timeTbc: event.time_tbc === 1,
		registrationOpen: event.registration_open === 1,
		registrationMode: event.registration_mode,
		externalFormUrl: event.external_form_url,
		registrationStart: event.registration_start,
		registrationDeadline: event.registration_deadline,
		isDeleted: event.is_deleted === 1,
	};
}

export function registrationMode(event: EventRow): string {
	const explicit = event.registration_mode ?? "";
	if (explicit === "internal" || explicit === "external" || explicit === "closed") return explicit;
	if (event.external_form_url) return "external";
	return event.registration_open === 1 ? "internal" : "closed";
}

/** Is the registration window open right now? */
export function registrationWindowOpen(event: EventRow, nowMs: number): boolean {
	if (event.is_deleted === 1 || event.status !== "published") return false;
	if (registrationMode(event) !== "internal" || event.registration_open !== 1) return false;
	const end = getEventEndTimestamp(lifecycleOf(event));
	if (end !== null && end <= nowMs) return false;
	const starts = dateMs(event.registration_start);
	if (starts && starts > nowMs) return false;
	const deadline = dateMs(event.registration_deadline);
	if (deadline && deadline <= nowMs) return false;
	return true;
}

/** Offer lifetime in minutes, clamped to the schema's 15..10080. */
export function offerMinutes(event: EventRow): number {
	const value = Number(event.waitlist_offer_minutes) || 360;
	if (!Number.isFinite(value) || value < 15) return 360;
	return Math.min(10080, Math.floor(value));
}

/**
 * When an offer made now would expire, as ISO — or "" when it would expire
 * immediately (event already over, or deadline already passed).
 */
export function offerExpiry(event: EventRow, nowMs: number): string {
	let expiry = nowMs + offerMinutes(event) * 60 * 1000;
	const deadline = dateMs(event.registration_deadline);
	if (deadline && deadline < expiry) expiry = deadline;
	const end = getEventEndTimestamp(lifecycleOf(event));
	if (end !== null && end < expiry) expiry = end;
	return expiry > nowMs ? new Date(expiry).toISOString() : "";
}

export interface RegistrationRow {
	id: string;
	user_id: string | null;
	event_id: string;
	registration_status: string | null;
	payment_status: string | null;
	ticket_id: string | null;
	payment_ticket_id: string | null;
	checked_in: number;
	checked_in_at: string | null;
	coupon_code: string | null;
	discount_source: string | null;
	form_responses: string | null;
	payment_data: string | null;
	final_fee_paise: number;
	discount_paise: number;
	amount: number | null;
	discount_amount: number | null;
	registration_date: string | null;
	created_at: string;
	user_name: string | null;
	user_email: string | null;
	user_phone: string | null;
	programme_code: string | null;
	semester: string | null;
	ieee_member: number;
	ieee_member_id: string | null;
}

export interface WaitlistRow {
	id: string;
	event_id: string;
	user_id: string;
	status: string;
	joined_at: string;
	offered_at: string | null;
	offer_expires_at: string | null;
	accepted_registration: string | null;
	programme_code: string | null;
	semester: string | null;
}

/** Active registrations for an event (pending + confirmed). */
export async function activeRegistrations(eventId: string): Promise<RegistrationRow[]> {
	const result = await query<RegistrationRow>(
		`SELECT * FROM registrations
		  WHERE event_id = ? AND registration_status <> 'cancelled'`,
		[eventId],
	);
	return result.rows;
}

/** Offers that have not expired yet. */
export async function activeOffers(eventId: string, nowMs: number): Promise<WaitlistRow[]> {
	const result = await query<WaitlistRow>(
		`SELECT * FROM event_waitlist
		  WHERE event_id = ? AND status = 'offered'
		  ORDER BY joined_at ASC, id ASC`,
		[eventId],
	);
	return result.rows.filter((row) => dateMs(row.offer_expires_at) > nowMs);
}

async function waitingRows(eventId: string): Promise<WaitlistRow[]> {
	const result = await query<WaitlistRow>(
		`SELECT * FROM event_waitlist
		  WHERE event_id = ? AND status = 'waiting'
		  ORDER BY joined_at ASC, id ASC`,
		[eventId],
	);
	return result.rows;
}

/** Mark expired offers as expired and release their seats. Returns the count. */
async function expireOffers(eventId: string, nowMs: number): Promise<number> {
	const result = await query<WaitlistRow>(
		"SELECT * FROM event_waitlist WHERE event_id = ? AND status = 'offered'",
		[eventId],
	);
	let expired = 0;
	for (const row of result.rows) {
		const expires = dateMs(row.offer_expires_at);
		if (!expires || expires > nowMs) continue;
		await query("UPDATE event_waitlist SET status = 'expired', active_key = NULL WHERE id = ?", [
			row.id,
		]);
		expired += 1;
	}
	return expired;
}

/** Is the waitlist closed for business (event over, cancelled, deadline passed)? */
function waitlistTerminal(event: EventRow, nowMs: number): boolean {
	if (event.is_deleted === 1) return true;
	const status = event.status ?? "";
	if (status === "cancelled" || status === "completed") return true;
	const deadline = dateMs(event.registration_deadline);
	if (deadline && deadline <= nowMs) return true;
	const end = getEventEndTimestamp(lifecycleOf(event));
	return end !== null && end <= nowMs;
}

async function retireActiveWaitlist(eventId: string): Promise<number> {
	const result = await query<{ id: string }>(
		`UPDATE event_waitlist SET status = 'expired', active_key = NULL
		  WHERE event_id = ? AND status IN ('waiting', 'offered')`,
		[eventId],
	);
	return result.rows.length;
}

/** Rewrite the event's seat counters from live rows. Self-healing. */
export async function updateSeatCounters(event: EventRow, nowMs: number): Promise<{
	activeRegistrations: number;
	reservedOffers: number;
}> {
	const active = (await activeRegistrations(event.id)).length;
	const reserved = (await activeOffers(event.id, nowMs)).length;
	await query("UPDATE events SET registered_count = ?, waitlist_reserved_count = ? WHERE id = ?", [
		active,
		reserved,
		event.id,
	]);
	return { activeRegistrations: active, reservedOffers: reserved };
}

/**
 * Bring the waitlist into a consistent state and offer any free seats.
 *
 * Called at the start of the create command (before capacity is decided) and
 * after a cancellation, exactly as the PocketBase hook did.
 */
export async function reconcileEventWaitlist(
	eventId: string,
	nowIsoValue: string,
): Promise<{ expired: number; offered: number; activeRegistrations: number; reservedOffers: number }> {
	const nowMs = dateMs(nowIsoValue) || Date.now();
	const found = await query<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
	const event = found.rows[0];
	if (!event) return { expired: 0, offered: 0, activeRegistrations: 0, reservedOffers: 0 };

	let expired = await expireOffers(eventId, nowMs);

	const capacity = Number(event.max_capacity) || 0;
	if (waitlistTerminal(event, nowMs) || event.waitlist_enabled !== 1 || capacity <= 0) {
		expired += await retireActiveWaitlist(eventId);
	}

	let counts = await updateSeatCounters(event, nowMs);

	if (
		event.waitlist_enabled !== 1 ||
		capacity <= 0 ||
		!registrationWindowOpen(event, nowMs)
	) {
		return { expired, offered: 0, ...counts };
	}

	let slots = Math.max(0, capacity - counts.activeRegistrations - counts.reservedOffers);
	let offered = 0;
	if (slots > 0) {
		const waiting = await waitingRows(eventId);
		for (const row of waiting) {
			if (slots <= 0) break;
			const expiry = offerExpiry(event, nowMs);
			if (!expiry) break;
			await query(
				`UPDATE event_waitlist
				    SET status = 'offered', offered_at = ?, offer_expires_at = ?
				  WHERE id = ?`,
				[new Date(nowMs).toISOString(), expiry, row.id],
			);
			offered += 1;
			slots -= 1;
		}
	}

	counts = await updateSeatCounters(event, nowMs);
	return { expired, offered, ...counts };
}

/** The user's active waitlist entry (waiting or offered), if any. */
export async function activeWaitlistEntry(
	eventId: string,
	userId: string,
): Promise<WaitlistRow | undefined> {
	const result = await query<WaitlistRow>(
		`SELECT * FROM event_waitlist
		  WHERE event_id = ? AND user_id = ? AND status IN ('waiting', 'offered')
		  LIMIT 1`,
		[eventId, userId],
	);
	return result.rows[0];
}

/** An unexpired offer held by this user, if any. */
export async function validOfferForUser(
	eventId: string,
	userId: string,
	nowMs: number,
): Promise<WaitlistRow | null> {
	const row = await activeWaitlistEntry(eventId, userId);
	if (!row || row.status !== "offered") return null;
	return dateMs(row.offer_expires_at) > nowMs ? row : null;
}

// ---------------------------------------------------------------------------
// Cancellation policy
// ---------------------------------------------------------------------------

export interface CancellationPolicy {
	allowed: boolean;
	mode: "none" | "direct" | "refund_request";
	deadline: string;
	refundPolicy: string;
	request: CancellationRequestSnapshot | null;
}

export interface CancellationRequestSnapshot {
	id: string;
	kind: string;
	status: string;
	reason: string;
	requestedAt: string;
	decisionAt: string;
	resolutionNote: string;
	resolvedAt: string;
}

interface CancellationRequestRow {
	id: string;
	kind: string;
	status: string;
	reason: string | null;
	requested_at: string;
	decision_at: string | null;
	resolution_note: string | null;
	resolved_at: string | null;
}

export async function activeCancellationRequest(
	registrationId: string,
): Promise<CancellationRequestRow | undefined> {
	const result = await query<CancellationRequestRow>(
		`SELECT * FROM registration_cancellation_requests
		  WHERE registration_id = ? AND status IN ('open', 'accepted')
		  LIMIT 1`,
		[registrationId],
	);
	return result.rows[0];
}

export function requestSnapshot(
	row: CancellationRequestRow | undefined,
): CancellationRequestSnapshot | null {
	if (!row) return null;
	return {
		id: row.id,
		kind: row.kind || "refund",
		status: row.status || "open",
		reason: row.reason ?? "",
		requestedAt: row.requested_at ?? "",
		decisionAt: row.decision_at ?? "",
		resolutionNote: row.resolution_note ?? "",
		resolvedAt: row.resolved_at ?? "",
	};
}

/** Which deadline governs cancellation: refund window for paid, else self-cancel. */
function cancellationDeadline(event: EventRow, paid: boolean): string {
	let value = paid ? event.refund_request_until : event.self_cancellation_until;
	if (!value && paid) value = event.self_cancellation_until;
	if (!value) value = event.registration_deadline;
	if (!value) value = event.date;
	return value ?? "";
}

/**
 * May this attendee cancel, and how?
 *
 * `direct` means the registration is cancelled immediately; `refund_request`
 * means a cancellation request is opened for a finance decision.
 */
export async function cancellationPolicy(
	event: EventRow,
	registration: RegistrationRow,
	nowMs: number,
): Promise<CancellationPolicy> {
	const request = await activeCancellationRequest(registration.id);
	const status = registration.registration_status ?? "";
	const paymentStatus = registration.payment_status ?? "";
	const paymentData = registration.payment_data
		? (JSON.parse(registration.payment_data) as Record<string, unknown>)
		: {};
	const paid = paymentStatus === "paid";
	const deadline = cancellationDeadline(event, paid);
	const deadlineMs = dateMs(deadline);

	const end = getEventEndTimestamp(lifecycleOf(event));
	const ended = end !== null && end <= nowMs;

	let allowed =
		event.allow_self_cancellation === 1 &&
		status !== "cancelled" &&
		!ended &&
		registration.checked_in !== 1;
	if (deadlineMs && deadlineMs <= nowMs) allowed = false;
	if (paymentData.manualReview === true) allowed = false;
	if (paymentStatus === "refunded") allowed = false;

	return {
		allowed,
		mode: allowed ? (paid ? "refund_request" : "direct") : "none",
		deadline,
		refundPolicy: event.refund_policy ?? "",
		request: requestSnapshot(request),
	};
}

/** Open a refund request, or return the one already open. */
export async function createRefundRequest(
	registration: RegistrationRow,
	event: EventRow,
	userId: string,
	reason: string,
	nowIsoValue: string,
): Promise<CancellationRequestRow> {
	const existing = await activeCancellationRequest(registration.id);
	if (existing) return existing;

	const id = crypto.randomUUID();
	await query(
		`INSERT INTO registration_cancellation_requests
		   (id, registration_id, event_id, user_id, kind, active_key, status, reason, requested_at)
		 VALUES (?, ?, ?, ?, 'refund', ?, 'open', ?, ?)`,
		[
			id,
			registration.id,
			event.id,
			userId,
			registration.id,
			String(reason ?? "").trim().slice(0, 2000),
			nowIsoValue,
		],
	);
	const created = await activeCancellationRequest(registration.id);
	return created as CancellationRequestRow;
}

/**
 * Cancel an unpaid registration immediately.
 *
 * A paid registration must go through a refund request instead — the caller
 * checks the policy first, and this throws if that check was skipped.
 */
export async function cancelUnpaidRegistration(
	registration: RegistrationRow,
	userId: string,
	reason: string,
	nowIsoValue: string,
): Promise<void> {
	const status = registration.registration_status ?? "";
	if (status === "cancelled") return;

	const paymentStatus = registration.payment_status ?? "";
	if (paymentStatus === "paid" || paymentStatus === "refunded") {
		throw new Error("PAID_REGISTRATION_REQUIRES_REQUEST");
	}

	const data = registration.payment_data
		? (JSON.parse(registration.payment_data) as Record<string, unknown>)
		: {};
	data.attendeeCancellation = {
		cancelledAt: nowIsoValue,
		cancelledBy: userId,
		reason: String(reason ?? "").trim().slice(0, 2000),
	};

	await query(
		`UPDATE registrations
		    SET registration_status = 'cancelled',
		        payment_status = CASE WHEN payment_status = 'pending' THEN 'failed' ELSE payment_status END,
		        payment_data = ?
		  WHERE id = ?`,
		[JSON.stringify(data), registration.id],
	);

	// Release any ledger rows that never captured.
	await query(
		`UPDATE payments SET status = 'cancelled'
		  WHERE registration_id = ? AND status IN ('created', 'pending', 'authorized')`,
		[registration.id],
	);
}

/** Recompute `coupons.used_count` from active registrations. Self-healing. */
export async function recomputeCouponUsedCount(couponCode: string, eventId: string): Promise<void> {
	if (!couponCode) return;
	const used = await query<{ n: number }>(
		`SELECT count(*) AS n FROM registrations
		  WHERE coupon_code = ? AND event_id = ? AND registration_status <> 'cancelled'`,
		[couponCode, eventId],
	);
	await query("UPDATE coupons SET used_count = ? WHERE code = ? AND event_id = ?", [
		used.rows[0]?.n ?? 0,
		couponCode,
		eventId,
	]);
}

/** Recompute the event's counters from live rows. Self-healing. */
export async function recomputeEventCounters(eventId: string): Promise<void> {
	const active = await query<{ n: number }>(
		`SELECT count(*) AS n FROM registrations
		  WHERE event_id = ? AND registration_status <> 'cancelled'`,
		[eventId],
	);
	const checkedIn = await query<{ n: number }>(
		`SELECT count(*) AS n FROM registrations
		  WHERE event_id = ? AND registration_status = 'confirmed' AND checked_in = 1`,
		[eventId],
	);
	await query("UPDATE events SET registered_count = ?, checked_in_count = ? WHERE id = ?", [
		active.rows[0]?.n ?? 0,
		checkedIn.rows[0]?.n ?? 0,
		eventId,
	]);
}

export { nowIso };
