/**
 * Event operations: the workspace feed, manual registration, registration
 * commands and cancellation decisions.
 *
 * Ported from `admin-operations.pb.js` and the cancellation-decision route in
 * `attendee-lifecycle.pb.js`.
 *
 * Two disciplines carry over unchanged:
 *
 *   - **Every mutation runs in one transaction and writes its audit row inside
 *     that transaction.** A command that changes state but loses its audit row
 *     is indistinguishable from one that never ran.
 *   - **Capability is checked against the event, not the actor.** A capability
 *     held at branch scope satisfies every event; one held through an assignment
 *     satisfies only that assignment's event. A foreign event id is a 404, so a
 *     probe cannot tell "exists but forbidden" from "does not exist".
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import {
	hasEventCapability,
	type Actor,
	type Capability,
} from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import {
	activeOffers,
	activeRegistrations,
	cancelUnpaidRegistration,
	reconcileEventWaitlist,
	recomputeCouponUsedCount,
	recomputeEventCounters,
	validOfferForUser,
} from "@/server/registration/waitlist";
import {
	discountPaise,
	generatePaymentTicketId,
	generateTicketId,
} from "@/server/registration/helpers";
import { calculate } from "@/server/registration/pricing";
import { couponLookup } from "@/server/registration/coupons";
import { findLedgerForRegistration } from "@/server/payments/ledger";
import { eventHasSessions } from "@/server/attendance/service";
import { enqueueForRegistration } from "@/server/notifications/outbox";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function str(value: unknown): string {
	return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value: unknown): Record<string, unknown> {
	if (typeof value !== "string" || !value) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

interface EventRow {
	id: string;
	title: string;
	slug: string;
	date: string | null;
	end_date: string | null;
	venue: string | null;
	status: string | null;
	price: number | null;
	base_fee_paise: number | null;
	society_id: string | null;
	max_capacity: number | null;
	registration_open: number | null;
	registration_mode: string | null;
	collect_ieee_member: number | null;
	check_in_enabled: number | null;
	is_deleted: number | null;
	form_template: string | null;
	registered_count: number | null;
	checked_in_count: number | null;
	eligible_semesters: string | null;
	eligible_programmes: string | null;
	waitlist_reserved_count: number | null;
	ieee_member_discount_percent: number | null;
}

type RegistrationRow = Record<string, unknown> & { id: string };

async function loadEvent(eventId: string): Promise<EventRow> {
	const result = await query<EventRow>(`SELECT * FROM events WHERE id = ?`, [eventId]);
	const row = result.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");
	return row;
}

async function loadRegistration(id: string): Promise<RegistrationRow> {
	const result = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [id]);
	const row = result.rows[0];
	if (!row) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
	return row;
}

// ---------------------------------------------------------------------------
// permissions and projection
// ---------------------------------------------------------------------------

const PERMISSION_CAPABILITIES: Capability[] = [
	"events.view", "events.edit", "events.publish", "events.cancel", "events.archive", "events.complete",
	"registrations.view", "registrations.manage", "registrations.manual", "checkin.manage",
	"finance.view", "finance.manage", "assignments.manage", "content.manage", "reports.view",
	"certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.send",
	"certificates.revoke",
];

async function eventPermissions(actor: Actor, event: EventRow): Promise<Record<string, boolean>> {
	const assignments = await loadAssignments(actor.id);
	const context = { id: event.id, societyId: event.society_id };
	const result: Record<string, boolean> = {};
	for (const capability of PERMISSION_CAPABILITIES) {
		result[capability] = hasEventCapability(actor, capability, context, assignments);
	}
	return result;
}

interface Projection {
	finance: boolean;
	reports: boolean;
	edit: boolean;
	registrations: boolean;
	attendance: boolean;
	audience: boolean;
	workflow: boolean;
}

function projectionOf(permissions: Record<string, boolean>): Projection {
	return {
		finance: permissions["finance.view"] === true || permissions["finance.manage"] === true,
		reports: permissions["reports.view"] === true,
		edit: permissions["events.edit"] === true,
		registrations:
			permissions["registrations.view"] === true ||
			permissions["registrations.manage"] === true ||
			permissions["registrations.manual"] === true,
		attendance: permissions["events.edit"] === true || permissions["checkin.manage"] === true,
		audience: permissions["events.edit"] === true || permissions["registrations.manual"] === true,
		workflow:
			permissions["events.edit"] === true ||
			permissions["events.publish"] === true ||
			permissions["events.cancel"] === true ||
			permissions["events.archive"] === true ||
			permissions["events.complete"] === true,
	};
}

// ---------------------------------------------------------------------------
// snapshots
// ---------------------------------------------------------------------------

function providerKind(row: RegistrationRow): string {
	const data = parseJson(row.payment_data);
	if (data.manualConfirmation || data.provider === "manual") return "manual";
	if (data.provider === "razorpay" || data.provider === "razorpay_live") return "razorpay";
	if (data.provider === "paygate") return "paygate";
	if (data.provider === "legacy_paygate") return "legacy_paygate";
	if (str(row.payment_status) === "not_required") return "not_required";
	return "unknown";
}

function collectedAmount(row: RegistrationRow): number {
	const data = parseJson(row.payment_data);
	const paise = Number(data.payableAmountPaise);
	if (Number.isFinite(paise) && paise >= 0 && Math.floor(paise) === paise) return paise / 100;
	const exact = Number(data.payableAmount);
	if (Number.isFinite(exact) && exact >= 0) return exact;
	return num(row.amount);
}

function refundedAmount(row: RegistrationRow): number {
	const data = parseJson(row.payment_data);
	const paise = Number(data.amountRefundedPaise);
	if (Number.isFinite(paise) && paise >= 0 && Math.floor(paise) === paise) return paise / 100;
	if (str(row.payment_status) === "refunded") return collectedAmount(row);
	return 0;
}

export function registrationSnapshot(row: RegistrationRow | null | undefined) {
	if (!row) return null;
	const data = parseJson(row.payment_data);
	return {
		id: row.id,
		event: str(row.event_id),
		user: str(row.user_id),
		userName: str(row.user_name),
		userEmail: str(row.user_email),
		userPhone: str(row.user_phone),
		registrationStatus: str(row.registration_status),
		paymentStatus: str(row.payment_status),
		amount: num(row.amount),
		collectedAmount: collectedAmount(row),
		refundedAmount: refundedAmount(row),
		paymentMethod: str(data.paymentMethod),
		couponCode: str(row.coupon_code),
		discountAmount: discountPaise(row as never) / 100,
		ticketId: str(row.ticket_id),
		checkedIn: num(row.checked_in) === 1,
		checkedInAt: str(row.checked_in_at),
		registrationDate: str(row.registration_date),
		registrationSource: str(row.registration_source) || "self_service",
		internalNotes: str(row.internal_notes),
		provider: providerKind(row),
		providerStatus: str(data.providerStatus),
		manualReview: data.manualReview === true,
		reviewReason: str(data.reviewReason),
		manualConfirmation: (data.manualConfirmation as Record<string, unknown> | null) ?? null,
	};
}

function emptySummary() {
	return {
		totalRecords: 0, active: 0, confirmed: 0, pending: 0, cancelled: 0, checkedIn: 0,
		paidCount: 0, paidAmount: 0, confirmedPaidAmount: 0,
		pendingPaymentCount: 0, pendingPaymentAmount: 0,
		failedCount: 0, notRequiredCount: 0,
		refundedCount: 0, refundedAmount: 0,
		manualPaidCount: 0, manualPaidAmount: 0,
		providerPaidCount: 0, providerPaidAmount: 0,
		cancelledPaidCount: 0, cancelledPaidAmount: 0,
		reviewCount: 0, discountAmount: 0,
		adminCreatedCount: 0, selfServiceCount: 0,
		providers: {} as Record<string, { count: number; paidCount: number; amount: number }>,
	};
}

function addToSummary(summary: ReturnType<typeof emptySummary>, rows: RegistrationRow[]) {
	summary.totalRecords += rows.length;
	for (const row of rows) {
		const registrationStatus = str(row.registration_status);
		const paymentStatus = str(row.payment_status);
		const amount = num(row.amount);
		const collected = collectedAmount(row);
		const refunded = refundedAmount(row);
		const source = str(row.registration_source) || "self_service";
		const data = parseJson(row.payment_data);
		const kind = providerKind(row);

		if (registrationStatus !== "cancelled") summary.active++;
		if (registrationStatus === "confirmed") summary.confirmed++;
		if (registrationStatus === "pending") summary.pending++;
		if (registrationStatus === "cancelled") summary.cancelled++;
		if (num(row.checked_in) === 1) summary.checkedIn++;
		if (source === "admin") summary.adminCreatedCount++;
		else summary.selfServiceCount++;

		summary.discountAmount += discountPaise(row as never) / 100;

		if (paymentStatus === "paid") {
			summary.paidCount++;
			summary.paidAmount += collected;
			if (registrationStatus === "confirmed") summary.confirmedPaidAmount += collected;
			if (registrationStatus === "cancelled") {
				summary.cancelledPaidCount++;
				summary.cancelledPaidAmount += collected;
			}
			if (kind === "manual") {
				summary.manualPaidCount++;
				summary.manualPaidAmount += collected;
			} else {
				summary.providerPaidCount++;
				summary.providerPaidAmount += collected;
			}
		} else if (paymentStatus === "pending") {
			summary.pendingPaymentCount++;
			summary.pendingPaymentAmount += amount;
		} else if (paymentStatus === "failed") {
			summary.failedCount++;
		} else if (paymentStatus === "not_required") {
			summary.notRequiredCount++;
		} else if (paymentStatus === "refunded") {
			summary.refundedCount++;
			summary.refundedAmount += refunded;
		}

		if (data.manualReview === true || (registrationStatus === "cancelled" && paymentStatus === "paid")) {
			summary.reviewCount++;
		}

		summary.providers[kind] ??= { count: 0, paidCount: 0, amount: 0 };
		summary.providers[kind].count++;
		if (paymentStatus === "paid") {
			summary.providers[kind].paidCount++;
			summary.providers[kind].amount += collected;
		}
	}
	return summary;
}

function projectSummary(summary: ReturnType<typeof emptySummary>, flags: Projection) {
	if (flags.finance) return summary;
	const keys = [
		"totalRecords", "active", "confirmed", "pending", "cancelled",
		"checkedIn", "adminCreatedCount", "selfServiceCount",
	] as const;
	const projected: Record<string, number> = {};
	for (const key of keys) projected[key] = summary[key];
	return projected;
}

function eventPayload(event: EventRow) {
	const formTemplate = parseJson(`{"t":${event.form_template ?? "[]"}}`).t;
	return {
		id: event.id,
		title: event.title ?? "",
		slug: event.slug ?? "",
		date: event.date ?? "",
		endDate: event.end_date ?? "",
		venue: event.venue ?? "",
		status: event.status ?? "",
		price: num(event.price),
		registrationOpen: num(event.registration_open) === 1,
		registrationMode: event.registration_mode ?? "",
		collectIeeeMember: num(event.collect_ieee_member) === 1,
		eligibleSemesters: parseJson(`{"t":${event.eligible_semesters ?? "[]"}}`).t ?? [],
		eligibleProgrammes: parseJson(`{"t":${event.eligible_programmes ?? "[]"}}`).t ?? [],
		formTemplate: Array.isArray(formTemplate) ? formTemplate : [],
		checkInEnabled: num(event.check_in_enabled) === 1,
		isArchived: num(event.is_deleted) === 1,
		maxCapacity: num(event.max_capacity),
		registeredCount: num(event.registered_count),
		checkedInCount: num(event.checked_in_count),
		society: event.society_id ?? "",
	};
}

function projectEvent(payload: ReturnType<typeof eventPayload>, flags: Projection) {
	if (flags.finance && flags.edit) return payload;
	const keys = [
		"id", "title", "slug", "date", "endDate", "venue", "status", "price",
		"registrationOpen", "registrationMode", "checkInEnabled", "isArchived",
		"maxCapacity", "registeredCount", "checkedInCount", "society",
	] as const;
	const projected: Record<string, unknown> = {};
	for (const key of keys) projected[key] = payload[key];
	if (flags.audience) {
		projected.collectIeeeMember = payload.collectIeeeMember;
		projected.eligibleSemesters = payload.eligibleSemesters;
		projected.eligibleProgrammes = payload.eligibleProgrammes;
	}
	if (flags.edit) projected.formTemplate = payload.formTemplate;
	return projected;
}

function projectSnapshot(snapshot: ReturnType<typeof registrationSnapshot>, flags: Projection) {
	if (!snapshot) return null;
	if (flags.finance) return snapshot;
	const keys = [
		"id", "event", "user", "userName", "userEmail", "userPhone",
		"registrationStatus", "ticketId", "checkedIn", "checkedInAt",
		"registrationDate", "registrationSource",
	] as const;
	const projected: Record<string, unknown> = {};
	for (const key of keys) projected[key] = snapshot[key];
	return projected;
}

// ---------------------------------------------------------------------------
// the operations feed
// ---------------------------------------------------------------------------

export async function getEventOperations(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	const permissions = await eventPermissions(actor, event);

	const mayView =
		permissions["registrations.view"] === true ||
		permissions["events.edit"] === true ||
		permissions["finance.view"] === true;
	// 404, not 403: a foreign event must not confirm its own existence.
	if (!mayView) fail(404, "EVENT_NOT_FOUND", "Event not found");

	const flags = projectionOf(permissions);

	const registrations = await query<RegistrationRow>(
		`SELECT * FROM registrations WHERE event_id = ? ORDER BY registration_date DESC, id DESC`,
		[eventId],
	);
	const summary = addToSummary(emptySummary(), registrations.rows);

	const recent: unknown[] = [];
	const attention: unknown[] = [];
	const nowMs = Date.now();
	for (const row of registrations.rows) {
		const snapshot = registrationSnapshot(row);
		if (!snapshot) continue;
		if ((flags.registrations || flags.finance) && recent.length < 8) {
			recent.push(projectSnapshot(snapshot, flags));
		}
		const registrationTime = Date.parse(snapshot.registrationDate || "");
		const stalePending =
			snapshot.registrationStatus === "pending" &&
			snapshot.paymentStatus === "pending" &&
			Number.isFinite(registrationTime) &&
			nowMs - registrationTime >= 10 * 60 * 1000;
		if (
			flags.finance &&
			(snapshot.manualReview ||
				(snapshot.registrationStatus === "cancelled" && snapshot.paymentStatus === "paid") ||
				stalePending)
		) {
			// Attention rows are always the full snapshot: they exist to be acted on.
			if (attention.length < 30) attention.push(snapshot);
		}
	}

	const response: Record<string, unknown> = {
		event: projectEvent(eventPayload(event), flags),
		summary: projectSummary(summary, flags),
		permissions,
	};
	if (flags.registrations || flags.finance) response.recent = recent;

	if (flags.registrations) {
		const waiting = await query<{ n: number }>(
			`SELECT COUNT(*) AS n FROM event_waitlist WHERE event_id = ? AND status = 'waiting'`,
			[eventId],
		);
		const offered = await query<{ n: number }>(
			`SELECT COUNT(*) AS n FROM event_waitlist WHERE event_id = ? AND status = 'offered'`,
			[eventId],
		);
		response.waitlist = {
			waiting: num(waiting.rows[0]?.n),
			offered: num(offered.rows[0]?.n),
			reserved: num(event.waitlist_reserved_count),
		};
	}

	if (flags.finance) {
		response.attention = attention;
		const requests = await query<Record<string, unknown>>(
			`SELECT * FROM registration_cancellation_requests
			  WHERE event_id = ? AND status IN ('open','accepted')
			  ORDER BY requested_at, id LIMIT 100`,
			[eventId],
		);
		// One `IN (...)` read instead of one read per request. better-sqlite3 is
		// synchronous, so a 100-row loop was 100 sequential event-loop stalls with
		// no concurrency to gain from them.
		const registrationIds = requests.rows
			.map((request) => str(request.registration_id))
			.filter((id) => id.length > 0);

		const registrationsById = new Map<string, RegistrationRow>();
		if (registrationIds.length > 0) {
			const registrations = await query<RegistrationRow>(
				`SELECT * FROM registrations WHERE id IN (${registrationIds.map(() => "?").join(",")})`,
				registrationIds,
			);
			for (const row of registrations.rows) registrationsById.set(String(row.id), row);
		}

		const cancellationRequests = requests.rows.map((request) => ({
			request: cancellationRequestSnapshot(request),
			registration: registrationSnapshot(
				registrationsById.get(str(request.registration_id)),
			),
		}));
		response.cancellationRequests = cancellationRequests;
		response.financeDisclaimer =
			"Recorded collections are an application ledger, not a live bank balance.";
	}

	if (flags.edit) {
		const coupons = await query<Record<string, unknown>>(
			`SELECT * FROM coupons WHERE event_id = ? ORDER BY created_at`,
			[eventId],
		);
		response.coupons = coupons.rows.map((row) => ({
			id: str(row.id),
			code: str(row.code),
			discountPercent: num(row.discount_percent),
			maxUses: num(row.max_uses),
			usedCount: num(row.used_count),
			expiresAt: str(row.expires_at),
			isActive: num(row.is_active) === 1,
		}));
	}

	if (flags.reports) {
		const rows = await query<Record<string, unknown>>(
			`SELECT * FROM admin_audit_log WHERE event_id = ? ORDER BY created_at DESC LIMIT 25`,
			[eventId],
		);
		response.audit = rows.rows.map((row) => ({
			id: str(row.id),
			action: str(row.action),
			note: str(row.note),
			actor: str(row.actor_id),
			registration: str(row.registration_id),
			created: str(row.created_at),
		}));
	}

	if (flags.attendance) {
		const hasSessions = await eventHasSessions(eventId);
		const count = await query<{ n: number }>(
			`SELECT COUNT(*) AS n FROM event_sessions WHERE event_id = ?`,
			[eventId],
		);
		response.attendance = {
			mode: hasSessions ? "sessions" : "legacy",
			sessionCount: num(count.rows[0]?.n),
		};
	}

	return response;
}

function cancellationRequestSnapshot(row: Record<string, unknown>) {
	return {
		id: str(row.id),
		kind: str(row.kind),
		status: str(row.status),
		reason: str(row.reason),
		requestedAt: str(row.requested_at),
		decisionAt: str(row.decision_at),
		resolutionNote: str(row.resolution_note),
		resolvedAt: str(row.resolved_at),
	};
}

// ---------------------------------------------------------------------------
// manual registration
// ---------------------------------------------------------------------------

export interface ManualRegistrationInput {
	name?: unknown;
	email?: unknown;
	phone?: unknown;
	userId?: unknown;
	couponCode?: unknown;
	paymentMode?: unknown;
	paymentMethod?: unknown;
	paymentReference?: unknown;
	amountOverride?: unknown;
	capacityOverride?: unknown;
	note?: unknown;
	formResponses?: unknown;
}

export async function createManualRegistration(
	actor: Actor,
	eventId: string,
	input: ManualRegistrationInput,
) {
	const event = await loadEvent(eventId);
	const assignments = await loadAssignments(actor.id);
	const context = { id: event.id, societyId: event.society_id };

	if (!hasEventCapability(actor, "registrations.manual", context, assignments)) {
		fail(404, "EVENT_NOT_FOUND", "Event not found");
	}
	if (num(event.is_deleted) === 1 || str(event.status) === "cancelled") {
		fail(409, "EVENT_FINAL", "Cancelled or archived events cannot receive new registrations");
	}

	const name = str(input.name).trim();
	const email = str(input.email).trim().toLowerCase();
	const phone = str(input.phone).trim();
	const phoneKey = phone.replace(/\D/g, "");
	const userId = str(input.userId).trim();
	const couponCode = str(input.couponCode).trim().toUpperCase();
	const paymentMode = str(input.paymentMode) || "pending";
	const paymentMethod = str(input.paymentMethod || (paymentMode === "paid" ? "other" : ""))
		.trim()
		.toLowerCase();
	const note = str(input.note).trim();
	const capacityOverride = input.capacityOverride === true;

	const financeSensitive =
		paymentMode === "paid" || paymentMode === "waived" || input.amountOverride !== undefined;
	if (financeSensitive && !hasEventCapability(actor, "finance.manage", context, assignments)) {
		fail(
			403,
			"FINANCE_FORBIDDEN",
			"Finance permission is required for paid, waived, or overridden manual registrations",
		);
	}
	if (capacityOverride && !hasEventCapability(actor, "events.edit", context, assignments)) {
		fail(403, "CAPACITY_FORBIDDEN", "Event management permission is required to override capacity");
	}

	let formResponses = input.formResponses ?? {};
	if (typeof formResponses === "string") {
		try {
			formResponses = JSON.parse(formResponses);
		} catch {
			formResponses = {};
		}
	}
	if (!formResponses || typeof formResponses !== "object") formResponses = {};
	const responses = formResponses as Record<string, unknown>;
	if (responses.name === undefined) responses.name = name;
	if (responses.email === undefined) responses.email = email;
	if (responses.phone === undefined) responses.phone = phone;

	if (!name || (!email && !phoneKey)) {
		fail(400, "INVALID_ATTENDEE", "Name and at least an email or phone number are required");
	}
	if (email && email.indexOf("@") <= 0) fail(400, "INVALID_ATTENDEE", "Email address is invalid");
	if (phone && phoneKey.length < 7) fail(400, "INVALID_ATTENDEE", "Phone number is too short");
	if (!["paid", "pending", "waived"].includes(paymentMode)) {
		fail(400, "INVALID_PAYMENT_MODE", "Payment mode must be paid, pending, or waived");
	}
	if (paymentMode === "paid" && !["cash", "upi", "bank", "other"].includes(paymentMethod)) {
		fail(400, "INVALID_PAYMENT_METHOD", "Choose cash, UPI, bank, or other for an offline payment");
	}
	if (capacityOverride && !note) {
		fail(400, "NOTE_REQUIRED", "A note is required when overriding capacity");
	}

	const registrationId = await withTransaction(async () => {
		const current = await query<EventRow>(`SELECT * FROM events WHERE id = ?`, [eventId]);
		const currentEvent = current.rows[0];
		if (!currentEvent) fail(404, "EVENT_NOT_FOUND", "Event not found");
		if (num(currentEvent.is_deleted) === 1 || str(currentEvent.status) === "cancelled") {
			fail(409, "EVENT_FINAL", "Cancelled or archived events cannot receive new registrations");
		}

		// Required fields from the event's own form template.
		const template = parseJson(`{"t":${currentEvent.form_template ?? "[]"}}`).t;
		if (Array.isArray(template)) {
			for (const field of template as Array<Record<string, unknown>>) {
				if (!field.required) continue;
				const key = str(field.name || field.id);
				let value = responses[key];
				if (value === undefined && field.id) value = responses[str(field.id)];
				if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
					fail(400, "REQUIRED_FIELD_MISSING", `Required field '${str(field.label || key)}' is missing`);
				}
			}
		}

		// Capacity, measured against active registrations plus reserved offers.
		const nowMs = Date.now();
		const now = new Date(nowMs).toISOString();
		await reconcileEventWaitlist(eventId, now);
		const active = await activeRegistrations(eventId);
		const reserved = await activeOffers(eventId, nowMs);
		const offered = userId ? await validOfferForUser(eventId, userId, nowMs) : null;
		const maxCapacity = num(currentEvent.max_capacity);
		if (maxCapacity > 0 && !capacityOverride) {
			const occupied = active.length + reserved.length;
			if ((offered && active.length >= maxCapacity) || (!offered && occupied >= maxCapacity)) {
				fail(409, "EVENT_FULL", "Event is at full capacity");
			}
		}

		if (userId) {
			const user = await query(`SELECT id FROM users WHERE id = ?`, [userId]);
			if (!user.rows[0]) fail(400, "USER_NOT_FOUND", "Selected user was not found");
		}

		// Duplicate: by user id when linked, else by email, else by phone.
		const duplicate = userId
			? await query(
					`SELECT id FROM registrations WHERE user_id = ? AND event_id = ? AND registration_status != 'cancelled' LIMIT 1`,
					[userId, eventId],
				)
			: email
				? await query(
						`SELECT id FROM registrations WHERE user_id IS NULL AND user_email = ? AND event_id = ? AND registration_status != 'cancelled' LIMIT 1`,
						[email, eventId],
					)
				: await query(
						`SELECT id FROM registrations WHERE user_id IS NULL AND user_phone = ? AND event_id = ? AND registration_status != 'cancelled' LIMIT 1`,
						[phone, eventId],
					);
		if (duplicate.rows[0]) {
			fail(409, "ALREADY_REGISTERED", "An active registration already exists for this attendee");
		}

		const pricing = await calculate(
			{
				id: currentEvent.id,
				base_fee_paise: currentEvent.base_fee_paise,
				price: currentEvent.price,
				ieee_member_discount_percent: currentEvent.ieee_member_discount_percent,
			},
			{
				isIeeeMember: responses.isIeeeMember === true,
				ieeeMembershipId: str(responses.ieeeMembershipId),
				couponCode,
				validateProvider: false,
			},
			couponLookup,
		);
		if (!pricing.ok) fail(pricing.status ?? 400, pricing.code, pricing.error);

		let finalPaise = pricing.finalFeePaise;
		const basePaise = pricing.baseFeePaise;
		const discountPaiseValue = pricing.appliedDiscountPaise;
		const discountSource = pricing.discountSource;
		const appliedCoupon = pricing.appliedCouponCode ?? "";

		if (input.amountOverride !== undefined && input.amountOverride !== null && input.amountOverride !== "") {
			const overrideAmount = Number(input.amountOverride);
			const overridePaise = Math.round(overrideAmount * 100);
			if (
				!Number.isFinite(overrideAmount) ||
				overrideAmount < 0 ||
				Math.abs(overrideAmount * 100 - overridePaise) > 0.000001
			) {
				fail(400, "INVALID_AMOUNT", "Amount override must be non-negative with at most two decimal places");
			}
			if (!note) fail(400, "NOTE_REQUIRED", "A note is required when overriding the registration amount");
			finalPaise = overridePaise;
		}

		let paymentStatus = "pending";
		let registrationStatus = "pending";
		const paymentData: Record<string, unknown> = {
			provider: "manual",
			providerStatus: "manual_pending",
			paymentMethod: paymentMode === "paid" ? paymentMethod : "",
			createdAt: now,
			manualReview: false,
		};

		if (finalPaise <= 0 || paymentMode === "waived") {
			if (paymentMode === "waived" && finalPaise > 0) {
				paymentData.waiver = {
					originalAmount: finalPaise / 100,
					waivedAt: now,
					waivedBy: actor.id,
					note,
				};
				finalPaise = 0;
			}
			paymentStatus = "not_required";
			registrationStatus = "confirmed";
			paymentData.providerStatus = paymentMode === "waived" ? "waived" : "not_required";
		} else if (paymentMode === "paid") {
			paymentStatus = "paid";
			registrationStatus = "confirmed";
			paymentData.providerStatus = "manual_paid";
			paymentData.paidAt = now;
			paymentData.manualConfirmation = {
				confirmedAt: now,
				confirmedBy: actor.id,
				source: "admin_manual_registration",
				reference: str(input.paymentReference).trim(),
				note,
			};
		}

		const id = crypto.randomUUID();
		await query(
			`INSERT INTO registrations
			   (id, user_id, event_id, user_name, user_email, user_phone, form_responses,
			    programme_code, semester, ieee_member, ieee_member_id, discount_source,
			    coupon_code, amount, discount_amount, base_fee_paise, discount_paise,
			    final_fee_paise, payment_status, registration_status, registration_date,
			    ticket_id, payment_ticket_id, payment_data, checked_in, checked_in_at,
			    registration_source, internal_notes, created_by, created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'',?,?,?,?,?)`,
			[
				id, userId || null, eventId, name, email, phone, JSON.stringify(responses),
				str(responses.programmeCode) || null, str(responses.semester) || null,
				responses.isIeeeMember === true ? 1 : 0,
				str(responses.ieeeMembershipId).trim().slice(0, 80) || null,
				discountSource, appliedCoupon, finalPaise / 100, discountPaiseValue / 100,
				basePaise, discountPaiseValue, finalPaise, paymentStatus, registrationStatus, now,
				registrationStatus === "confirmed" ? generateTicketId() : null,
				registrationStatus === "pending" ? generatePaymentTicketId() : null,
				JSON.stringify(paymentData), "admin", note, actor.id, now, now,
			],
		);

		if (offered) {
			await query(
				`UPDATE event_waitlist SET status = 'accepted', active_key = '', accepted_registration = ?, updated_at = ? WHERE id = ?`,
				[id, now, offered.id],
			);
		}
		await reconcileEventWaitlist(eventId, now);

		if (paymentStatus === "paid") {
			await query(
				`INSERT INTO payments
				   (id, registration_id, event_id, provider, receipt, status, base_fee_paise,
				    discount_paise, final_fee_paise, collected_paise, refunded_paise, currency,
				    payment_method, confirmation_source, captured_at, last_synced_at, manual_review,
				    created_at, updated_at)
				 VALUES (?,?,?,'manual',?,'captured',?,?,?,?,0,'INR',?,'admin',?,?,0,?,?)`,
				[
					crypto.randomUUID(), id, eventId,
					`manual_${id}_${Date.now()}`.slice(0, 120),
					basePaise, discountPaiseValue, finalPaise, finalPaise,
					paymentMethod || "other", now, now, now, now,
				],
			);
		}

		const saved = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [id]);
		const snapshot = registrationSnapshot(saved.rows[0]);

		await audit({
			eventId,
			registrationId: id,
			actorId: actor.id,
			action: "registration.manual-create",
			note,
			before: null,
			after: snapshot,
			entityType: "registration",
			entityId: id,
			outcome: "success",
		});

		return id;
	});

	await recomputeEventCounters(eventId);
	const saved = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [registrationId]);
	const row = saved.rows[0];
	if (row && str(row.coupon_code)) await recomputeCouponUsedCount(str(row.coupon_code), eventId);
	if (row && str(row.registration_status) === "confirmed") {
		try {
			await enqueueForRegistration(registrationId);
		} catch (error) {
			console.error("[admin-ops] manual registration notification queue failed:", error);
		}
	}

	return { registration: registrationSnapshot(row) };
}

// ---------------------------------------------------------------------------
// registration commands
// ---------------------------------------------------------------------------

export type RegistrationAdminAction =
	| "check-in"
	| "cancel"
	| "confirm-payment"
	| "restore"
	| "mark-refunded"
	| "reopen-manual-payment";

const ACTION_CAPABILITY: Record<RegistrationAdminAction, Capability> = {
	"check-in": "checkin.manage",
	cancel: "registrations.manage",
	"confirm-payment": "finance.manage",
	restore: "registrations.manage",
	"mark-refunded": "finance.manage",
	"reopen-manual-payment": "finance.manage",
};

export interface RegistrationCommandInput {
	action?: unknown;
	note?: unknown;
	reference?: unknown;
	method?: unknown;
	capacityOverride?: unknown;
}

export async function runRegistrationCommand(
	actor: Actor,
	registrationId: string,
	input: RegistrationCommandInput,
) {
	const registration = await loadRegistration(registrationId);
	const event = await loadEvent(str(registration.event_id));
	const assignments = await loadAssignments(actor.id);
	const context = { id: event.id, societyId: event.society_id };

	const action = str(input.action).trim() as RegistrationAdminAction;
	const note = str(input.note).trim();
	const capacityOverride = input.capacityOverride === true;

	// Unknown action: reject before consulting capabilities, so a typo is a 400
	// rather than a misleading 403.
	if (!(action in ACTION_CAPABILITY)) fail(400, "INVALID_ACTION", "Unknown registration action");

	if (!hasEventCapability(actor, ACTION_CAPABILITY[action], context, assignments)) {
		fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
	}

	if (action === "check-in" && (await eventHasSessions(event.id))) {
		fail(409, "USE_ATTENDANCE_V2", "Use the Attendance console for session-enabled events");
	}
	if (action === "check-in") {
		if (num(event.is_deleted) === 1 || str(event.status) !== "published") {
			fail(409, "CHECKIN_NOT_ACTIVE", "Check-in is only available while the event is published");
		}
		if (num(event.check_in_enabled) !== 1) {
			fail(409, "CHECKIN_DISABLED", "Check-in is not enabled for this event");
		}
	}
	if (action === "restore" && (num(event.is_deleted) === 1 || str(event.status) === "cancelled")) {
		fail(409, "EVENT_FINAL", "Cancelled or archived events cannot restore registrations");
	}
	if (
		(action === "mark-refunded" || action === "restore" || action === "reopen-manual-payment") &&
		!note
	) {
		fail(400, "NOTE_REQUIRED", "A note is required for this financial correction");
	}
	if (action === "restore" && capacityOverride && !hasEventCapability(actor, "events.edit", context, assignments)) {
		fail(403, "CAPACITY_FORBIDDEN", "Event management permission is required to override capacity");
	}

	const before = registrationSnapshot(registration);

	await withTransaction(async () => {
		const current = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [registrationId]);
		const reg = current.rows[0];
		if (!reg) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");

		const regStatus = str(reg.registration_status);
		const payStatus = str(reg.payment_status);
		const data = parseJson(reg.payment_data);
		const now = new Date().toISOString();

		if (action === "check-in") {
			if (regStatus !== "confirmed") {
				fail(409, "NOT_CONFIRMED", "Only confirmed attendees can be checked in");
			}
			if (num(reg.checked_in) !== 1) {
				await query(`UPDATE registrations SET checked_in = 1, checked_in_at = ?, updated_at = ? WHERE id = ?`, [
					now, now, registrationId,
				]);
			}
		} else if (action === "cancel") {
			if (regStatus !== "cancelled") {
				try {
					await cancelUnpaidRegistration(reg as never, actor.id, note, now);
				} catch (error) {
					if (String((error as Error)?.message ?? error) === "PAID_REGISTRATION_REQUIRES_REQUEST") {
						fail(409, "PAID_REGISTRATION_REQUIRES_REQUEST", "Paid registrations must use the refund workflow");
					}
					throw error;
				}
				const refreshed = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [registrationId]);
				const nextData = parseJson(refreshed.rows[0]?.payment_data);
				nextData.adminCancellation = { cancelledAt: now, cancelledBy: actor.id, note };
				await query(`UPDATE registrations SET payment_data = ?, updated_at = ? WHERE id = ?`, [
					JSON.stringify(nextData), now, registrationId,
				]);
			}
		} else if (action === "confirm-payment") {
			if (regStatus === "cancelled") {
				fail(409, "CANCELLED_REGISTRATION", "Restore the registration before confirming payment");
			}
			const alreadyPaid = regStatus === "confirmed" && payStatus === "paid";
			if (!alreadyPaid) {
				if (regStatus !== "pending" || payStatus !== "pending" || num(reg.amount) <= 0) {
					fail(409, "PAYMENT_NOT_PENDING", "This registration is not awaiting payment");
				}
				const existing = await findLedgerForRegistration(registrationId);
				if (existing && existing.status !== "cancelled" && existing.final_fee_paise > 0) {
					// A provider-backed row must be reconciled, never overwritten by hand.
					const providerRow = await query<{ provider: string; provider_order_id: string | null }>(
						`SELECT provider, provider_order_id FROM payments WHERE registration_id = ? ORDER BY created_at DESC LIMIT 1`,
						[registrationId],
					);
					const provider = providerRow.rows[0];
					if (provider && provider.provider !== "manual" && provider.provider_order_id) {
						fail(
							409,
							"PROVIDER_PAYMENT_EXISTS",
							"A provider-backed payment already exists. Reconcile or resolve that online payment instead of manually confirming it.",
						);
					}
				}
				if (data.provider === "paygate" && data.paymentId) {
					fail(
						409,
						"PAYGATE_PAYMENT_EXISTS",
						"A PayGate payment session already exists. Reconcile or resolve that online payment instead of manually confirming it.",
					);
				}

				const finalPaise = num(reg.final_fee_paise) || num(reg.amount) * 100;
				const basePaise = num(reg.base_fee_paise) || finalPaise;
				const discountPaiseValue = num(reg.discount_paise);

				await query(
					`INSERT INTO payments
					   (id, registration_id, event_id, provider, receipt, status, base_fee_paise,
					    discount_paise, final_fee_paise, collected_paise, refunded_paise, currency,
					    payment_method, confirmation_source, captured_at, last_synced_at, manual_review,
					    created_at, updated_at)
					 VALUES (?,?,?,'manual',?,'captured',?,?,?,?,0,'INR',?,'admin',?,?,0,?,?)`,
					[
						crypto.randomUUID(), registrationId, event.id,
						`manual_${registrationId}_${Date.now()}`.slice(0, 120),
						basePaise, discountPaiseValue, finalPaise, finalPaise,
						str(input.method || "offline").trim().slice(0, 80), now, now, now, now,
					],
				);

				data.provider = "manual";
				data.providerStatus = "manual_paid";
				data.manualConfirmation = {
					confirmedAt: now,
					confirmedBy: actor.id,
					source: "admin",
					reference: str(input.reference).trim(),
					note,
				};
				if (!data.paidAt) data.paidAt = now;

				await query(
					`UPDATE registrations
					    SET registration_status = 'confirmed', payment_status = 'paid',
					        ticket_id = CASE WHEN ticket_id IS NULL OR ticket_id = '' THEN ? ELSE ticket_id END,
					        payment_data = ?, updated_at = ?
					  WHERE id = ?`,
					[generateTicketId(), JSON.stringify(data), now, registrationId],
				);
			}
		} else if (action === "restore") {
			const restoreEvent = await query<EventRow>(`SELECT * FROM events WHERE id = ?`, [event.id]);
			const row = restoreEvent.rows[0];
			if (!row || num(row.is_deleted) === 1 || str(row.status) === "cancelled") {
				fail(409, "EVENT_FINAL", "Cancelled or archived events cannot restore registrations");
			}
			if (regStatus !== "cancelled") {
				fail(409, "NOT_CANCELLED", "Only cancelled registrations can be restored");
			}

			const nowMs = Date.now();
			await reconcileEventWaitlist(event.id, new Date(nowMs).toISOString());
			const active = await activeRegistrations(event.id);
			const reserved = await activeOffers(event.id, nowMs);
			const restoreUserId = str(reg.user_id);
			const offered = restoreUserId ? await validOfferForUser(event.id, restoreUserId, nowMs) : null;
			const maxCapacity = num(row.max_capacity);
			if (maxCapacity > 0 && !capacityOverride) {
				const occupied = active.length + reserved.length;
				if ((offered && active.length >= maxCapacity) || (!offered && occupied >= maxCapacity)) {
					fail(409, "EVENT_FULL", "Event is full. Use an explicit capacity override to restore this attendee.");
				}
			}
			if (payStatus !== "paid" && payStatus !== "not_required") {
				fail(
					409,
					payStatus === "refunded" ? "REFUNDED_REGISTRATION" : "PAYMENT_REOPEN_REQUIRED",
					payStatus === "refunded"
						? "A refunded registration cannot be restored without a new payment"
						: "Reopen the payment before restoring this registration",
				);
			}

			data.manualReview = false;
			data.reviewResolution = {
				action: "restored",
				resolvedAt: now,
				resolvedBy: actor.id,
				note,
				capacityOverride,
			};
			await query(
				`UPDATE registrations
				    SET registration_status = 'confirmed',
				        ticket_id = CASE WHEN ticket_id IS NULL OR ticket_id = '' THEN ? ELSE ticket_id END,
				        payment_data = ?, updated_at = ?
				  WHERE id = ?`,
				[generateTicketId(), JSON.stringify(data), now, registrationId],
			);
			if (offered) {
				await query(
					`UPDATE event_waitlist SET status = 'accepted', active_key = '', accepted_registration = ?, updated_at = ? WHERE id = ?`,
					[registrationId, now, offered.id],
				);
			}
		} else if (action === "mark-refunded") {
			if (payStatus !== "paid") {
				fail(409, "PAYMENT_NOT_PAID", "Only a paid registration can be refunded");
			}
			data.manualReview = false;
			data.refund = {
				status: "recorded",
				recordedAt: now,
				recordedBy: actor.id,
				reference: str(input.reference).trim(),
				note,
			};
			data.reviewResolution = { action: "refunded", resolvedAt: now, resolvedBy: actor.id, note };
			await query(
				`UPDATE registrations
				    SET registration_status = 'cancelled', payment_status = 'refunded',
				        payment_data = ?, updated_at = ?
				  WHERE id = ?`,
				[JSON.stringify(data), now, registrationId],
			);
			await query(
				`UPDATE payments
				    SET status = 'refunded',
				        refunded_paise = CASE WHEN collected_paise > 0 THEN collected_paise ELSE final_fee_paise END,
				        manual_review = 0, review_reason = '', updated_at = ?
				  WHERE registration_id = ? AND status != 'cancelled'`,
				[now, registrationId],
			);
		} else if (action === "reopen-manual-payment") {
			if (regStatus !== "confirmed" || payStatus !== "paid" || !data.manualConfirmation) {
				fail(409, "NOT_MANUAL_PAYMENT", "Only a manually confirmed payment can be reopened");
			}
			if (num(reg.checked_in) === 1) {
				fail(409, "ALREADY_CHECKED_IN", "Checked-in registrations cannot be reopened");
			}
			const providerStatus = str(data.providerStatus);
			if (providerStatus === "paid" || providerStatus === "captured") {
				fail(409, "PROVIDER_ALREADY_PAID", "Provider reports this payment as paid; use refund/review actions instead");
			}
			const previous = data.manualConfirmation;
			data.manualConfirmationReversal = {
				reversedAt: now,
				reversedBy: actor.id,
				note,
				previous,
			};
			delete data.manualConfirmation;
			await query(
				`UPDATE payments SET status = 'cancelled', collected_paise = 0, manual_review = 0, updated_at = ?
				  WHERE registration_id = ? AND provider = 'manual' AND status != 'cancelled'`,
				[now, registrationId],
			);
			await query(
				`UPDATE registrations
				    SET registration_status = 'pending', payment_status = 'pending', ticket_id = NULL,
				        payment_ticket_id = CASE WHEN payment_ticket_id IS NULL OR payment_ticket_id = '' THEN ? ELSE payment_ticket_id END,
				        payment_data = ?, updated_at = ?
				  WHERE id = ?`,
				[generatePaymentTicketId(), JSON.stringify(data), now, registrationId],
			);
		}

		if (action === "cancel" || action === "restore" || action === "mark-refunded") {
			await reconcileEventWaitlist(event.id, now);
		}
		if (action === "mark-refunded") {
			await query(
				`UPDATE registration_cancellation_requests SET status = 'resolved', active_key = '', resolved_at = ?, updated_at = ?
				  WHERE registration_id = ? AND status IN ('open','accepted')`,
				[now, now, registrationId],
			);
		}

		const saved = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [registrationId]);
		const after = registrationSnapshot(saved.rows[0]);

		await audit({
			eventId: event.id,
			registrationId,
			actorId: actor.id,
			action: `registration.${action}`,
			note,
			before,
			after,
		});
	});

	await recomputeEventCounters(event.id);
	const saved = await query<RegistrationRow>(`SELECT * FROM registrations WHERE id = ?`, [registrationId]);
	const row = saved.rows[0];
	if (row && str(row.coupon_code)) await recomputeCouponUsedCount(str(row.coupon_code), event.id);
	if ((action === "confirm-payment" || action === "restore") && row && str(row.registration_status) === "confirmed") {
		try {
			await enqueueForRegistration(registrationId);
		} catch (error) {
			console.error("[admin-ops] admin operation notification queue failed:", error);
		}
	}

	return { registration: registrationSnapshot(row) };
}

// ---------------------------------------------------------------------------
// cancellation decisions
// ---------------------------------------------------------------------------

export async function decideCancellationRequest(
	actor: Actor,
	requestId: string,
	input: { action?: unknown; note?: unknown },
) {
	const action = str(input.action).trim();
	const note = str(input.note).trim();

	if (action !== "accept" && action !== "decline") {
		fail(400, "INVALID_DECISION", "Decision must be accept or decline");
	}
	if (!note) fail(400, "NOTE_REQUIRED", "A decision note is required");

	return withTransaction(async () => {
		const found = await query<Record<string, unknown>>(
			`SELECT * FROM registration_cancellation_requests WHERE id = ?`,
			[requestId],
		);
		const request = found.rows[0];
		// 404 for a missing request, and 404 for one the actor cannot reach.
		if (!request) fail(404, "REQUEST_NOT_FOUND", "Cancellation request not found");

		const event = await loadEvent(str(request.event_id));
		const assignments = await loadAssignments(actor.id);
		if (
			!hasEventCapability(actor, "finance.manage", { id: event.id, societyId: event.society_id }, assignments)
		) {
			fail(404, "REQUEST_NOT_FOUND", "Cancellation request not found");
		}

		const current = str(request.status);
		const target = action === "accept" ? "accepted" : "declined";
		if (current === target) return { request: cancellationRequestSnapshot(request) };
		if (current !== "open") {
			fail(409, "REQUEST_ALREADY_DECIDED", "This request has already been decided");
		}

		const now = new Date().toISOString();
		await query(
			`UPDATE registration_cancellation_requests
			    SET status = ?, active_key = ?, decision_at = ?, decision_by = ?,
			        resolution_note = ?, updated_at = ?
			  WHERE id = ?`,
			[target, target === "declined" ? "" : str(request.active_key), now, actor.id, note.slice(0, 2000), now, requestId],
		);

		await audit({
			eventId: event.id,
			registrationId: str(request.registration_id),
			actorId: actor.id,
			action: `registration.refund-request.${target}`,
			note,
			entityType: "registration_cancellation_request",
			entityId: requestId,
		});

		const updated = await query<Record<string, unknown>>(
			`SELECT * FROM registration_cancellation_requests WHERE id = ?`,
			[requestId],
		);
		const row = updated.rows[0];
		if (!row) fail(404, "REQUEST_NOT_FOUND", "Cancellation request not found");
		return { request: cancellationRequestSnapshot(row) };
	});
}
