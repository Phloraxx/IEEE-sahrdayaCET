/**
 * Administrative reads and commands.
 *
 * Ported from `admin-registrations.pb.js`, `admin-payments.pb.js`,
 * `admin-data-health.pb.js` and the event-lifecycle routes in
 * `admin-operations.pb.js`.
 *
 * The authorization shape is the same one the hooks used:
 *
 *   - a **branch** capability (`registrations.view`, `finance.view`, …) sees
 *     every event;
 *   - otherwise the actor sees only the events where they hold the capability
 *     through an assignment.
 *
 * That second case is the one that matters for IDOR: an admin capability is
 * never inferred from a user-scoped query, and a scoped actor's list is filtered
 * by event id in SQL rather than after the fact.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import {
	hasCapability,
	hasEventCapability,
	type Actor,
	type Capability,
} from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { recomputeEventCounters } from "@/server/registration/waitlist";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function num(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The events an actor may act on for a capability.
 *
 * `null` means "all events" (branch scope). An array means "only these".
 */
export async function accessibleEventIds(
	actor: Actor,
	capability: Capability,
): Promise<string[] | null> {
	const assignments = await loadAssignments(actor.id);
	if (hasCapability(actor, capability, {}, assignments)) return null;

	const scoped = assignments.filter((row) => row.active);
	const ids = new Set<string>();
	for (const assignment of scoped) {
		if (assignment.eventId) {
			const event = await query<{ id: string; society_id: string | null }>(
				`SELECT id, society_id FROM events WHERE id = ?`,
				[assignment.eventId],
			);
			const row = event.rows[0];
			if (row && hasEventCapability(actor, capability, { id: row.id, societyId: row.society_id }, assignments)) {
				ids.add(row.id);
			}
		}
		if (assignment.societyId && !assignment.eventId) {
			const events = await query<{ id: string; society_id: string | null }>(
				`SELECT id, society_id FROM events WHERE society_id = ?`,
				[assignment.societyId],
			);
			for (const row of events.rows) {
				if (hasEventCapability(actor, capability, { id: row.id, societyId: row.society_id }, assignments)) {
					ids.add(row.id);
				}
			}
		}
	}
	return [...ids];
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export interface RegistrationFilters {
	eventId?: string;
	status?: string;
	paymentStatus?: string;
	q?: string;
	page?: number;
	perPage?: number;
}

function registrationProjection(
	row: Record<string, unknown>,
	eventTitle: string,
	eventSocietyId: string,
	includeFinance: boolean,
): Record<string, unknown> {
	const base: Record<string, unknown> = {
		id: row.id,
		event: row.event_id,
		eventId: row.event_id,
		eventTitle,
		eventSocietyId,
		user: row.user_id,
		userName: row.user_name ?? "",
		userEmail: row.user_email ?? "",
		userPhone: row.user_phone ?? "",
		registrationStatus: row.registration_status ?? "",
		checkedIn: row.checked_in === 1,
		checkedInAt: row.checked_in_at ?? null,
		ticketId: row.ticket_id ?? "",
		registrationDate: row.registration_date ?? "",
		createdAt: row.created_at ?? "",
		registrationSource: row.registration_source ?? "",
		programmeCode: row.programme_code ?? "",
		programme: row.programme_code ?? "",
		semester: row.semester ?? "",
		studyYear: null,
		ieeeMember: row.ieee_member === 1,
		ieeeMemberId: row.ieee_member_id ?? "",
		formResponses: row.form_responses ? JSON.parse(String(row.form_responses)) : null,
	};

	if (!includeFinance) return base;

	const paymentData = row.payment_data ? JSON.parse(String(row.payment_data)) : null;
	return {
		...base,
		paymentStatus: row.payment_status ?? "",
		amount: num(row.amount),
		collectedAmount: num(row.final_fee_paise) / 100,
		refundedAmount: 0,
		paymentMethod: "",
		couponCode: row.coupon_code ?? "",
		discountSource: row.discount_source ?? "",
		discountAmount: num(row.discount_paise) / 100,
		paymentData,
		paymentTicketId: row.payment_ticket_id ?? "",
		provider: paymentData?.provider ?? "",
		providerStatus: paymentData?.providerStatus ?? "",
		manualReview: paymentData?.manualReview === true,
		reviewReason: paymentData?.reviewReason ?? "",
		manualConfirmation: paymentData?.manualConfirmation ?? null,
		internalNotes: row.internal_notes ?? "",
	};
}

export async function listRegistrations(actor: Actor, filters: RegistrationFilters) {
	const page = Math.max(1, filters.page ?? 1);
	const perPage = Math.min(100, Math.max(1, filters.perPage ?? 25));

	// A specific event must be one the actor can read; otherwise the whole list is
	// narrowed to the accessible set.
	const allowed = await accessibleEventIds(actor, "registrations.view");
	if (filters.eventId) {
		if (allowed !== null && !allowed.includes(filters.eventId)) {
			fail(403, "FORBIDDEN", "You cannot view registrations for this event");
		}
	} else if (allowed !== null && allowed.length === 0) {
		return { registrations: [], total: 0, page, perPage, hasMore: false, finance: false };
	}

	const where: string[] = [];
	const params: unknown[] = [];

	if (filters.eventId) {
		where.push("r.event_id = ?");
		params.push(filters.eventId);
	} else if (allowed !== null) {
		where.push(`r.event_id IN (${allowed.map(() => "?").join(", ")})`);
		params.push(...allowed);
	}
	if (filters.status) {
		where.push("r.registration_status = ?");
		params.push(filters.status);
	}
	if (filters.paymentStatus) {
		where.push("r.payment_status = ?");
		params.push(filters.paymentStatus);
	}
	if (filters.q) {
		where.push("(r.user_name LIKE ? OR r.user_email LIKE ? OR r.ticket_id LIKE ?)");
		const like = `%${filters.q}%`;
		params.push(like, like, like);
	}

	const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

	const total = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM registrations r${whereSql}`,
		params,
	);
	const rows = await query<Record<string, unknown>>(
		`SELECT r.*, e.title AS event_title, e.society_id AS event_society_id
		   FROM registrations r
		   LEFT JOIN events e ON e.id = r.event_id
		   ${whereSql}
		  ORDER BY r.created_at DESC
		  LIMIT ? OFFSET ?`,
		[...params, perPage, (page - 1) * perPage],
	);

	// Finance columns are projected only when the actor holds finance access for
	// every event in the result — the same rule the hook applied.
	let finance = true;
	for (const row of rows.rows) {
		const eventId = String(row.event_id ?? "");
		const event = await query<{ id: string; society_id: string | null }>(
			`SELECT id, society_id FROM events WHERE id = ?`,
			[eventId],
		);
		const scope = event.rows[0];
		const assignments = await loadAssignments(actor.id);
		const canSeeFinance =
			scope !== undefined &&
			(hasCapability(actor, "finance.view", {}, assignments) ||
				hasEventCapability(actor, "finance.view", { id: scope.id, societyId: scope.society_id }, assignments) ||
				hasEventCapability(actor, "finance.manage", { id: scope.id, societyId: scope.society_id }, assignments));
		if (!canSeeFinance) {
			finance = false;
			break;
		}
	}

	const registrations = rows.rows.map((row) =>
		registrationProjection(
			row,
			String(row.event_title ?? ""),
			String(row.event_society_id ?? ""),
			finance,
		),
	);
	const totalCount = total.rows[0]?.count ?? 0;

	return {
		registrations,
		total: totalCount,
		page,
		perPage,
		hasMore: (page - 1) * perPage + registrations.length < totalCount,
		finance,
	};
}

export async function getRegistration(actor: Actor, id: string) {
	const found = await query<Record<string, unknown>>(
		`SELECT r.*, e.title AS event_title, e.society_id AS event_society_id
		   FROM registrations r LEFT JOIN events e ON e.id = r.event_id
		  WHERE r.id = ?`,
		[id],
	);
	const row = found.rows[0];
	if (!row) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");

	const assignments = await loadAssignments(actor.id);
	const scope = { id: String(row.event_id ?? ""), societyId: (row.event_society_id as string | null) ?? null };
	const canView =
		hasCapability(actor, "registrations.view", {}, assignments) ||
		hasEventCapability(actor, "registrations.view", scope, assignments);
	const finance =
		hasCapability(actor, "finance.view", {}, assignments) ||
		hasEventCapability(actor, "finance.view", scope, assignments) ||
		hasEventCapability(actor, "finance.manage", scope, assignments);

	if (!canView && !finance) fail(403, "FORBIDDEN", "You cannot view this registration");

	return {
		registration: registrationProjection(
			row,
			String(row.event_title ?? ""),
			String(row.event_society_id ?? ""),
			finance,
		),
	};
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentLedgerFilters {
	/** Raw query values are accepted: validation, not coercion, happens below. */
	page?: number | string;
	perPage?: number | string;
	search?: string;
	attention?: boolean;
}

/**
 * Pagination guard, ported from `admin-payments-helpers.js`.
 *
 * PocketBase answered 400 for a non-integer page or perPage rather than
 * silently clamping, and the admin page relies on that: a mistyped page must
 * not look like a short page.
 */
function positiveInt(value: unknown, fallback: number, maximum: number): number | null {
	if (value === undefined || value === null || value === "") return fallback;
	if (!/^\d+$/.test(String(value))) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > maximum) return null;
	return parsed;
}

/**
 * The branch-wide payment ledger.
 *
 * Ported from `admin-payments.pb.js` and `admin-payments-helpers.js`. The ledger
 * is the `payments` table — not the registrations projection — joined to its
 * registration and event so attendee identity is projected server-side only
 * after `finance.view` passes. Amounts are integer paise in the database and
 * rupees in the response, which is what the admin page formats.
 */
export async function listPayments(actor: Actor, filters: PaymentLedgerFilters = {}) {
	const assignments = await loadAssignments(actor.id);
	if (!hasCapability(actor, "finance.view", {}, assignments)) {
		fail(403, "FORBIDDEN", "Branch finance access is required to view the payment desk");
	}

	const page = positiveInt(filters.page, 1, 1_000_000);
	const perPage = positiveInt(filters.perPage, 40, 100);
	if (page === null || perPage === null) {
		fail(400, "INVALID_QUERY", "Pagination must use positive integer page and perPage values");
	}

	const where: string[] = [];
	const params: unknown[] = [];

	const search = (filters.search ?? "").trim().toLowerCase();
	if (search) {
		// `instr` rather than `LIKE`: a search term containing `%` or `_` must not
		// become a wildcard.
		where.push(
			`(${[
				"p.provider_order_id",
				"p.captured_payment_id",
				"r.user_name",
				"r.user_email",
				"r.user_phone",
				"r.ticket_id",
				"e.title",
			]
				.map((column) => `instr(lower(COALESCE(${column}, '')), ?) > 0`)
				.join(" OR ")})`,
		);
		for (let i = 0; i < 7; i += 1) params.push(search);
	}
	if (filters.attention) {
		where.push("(p.manual_review = 1 OR p.status = 'partially_refunded')");
	}

	const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
	const from = `FROM payments p
		LEFT JOIN registrations r ON r.id = p.registration_id
		LEFT JOIN events e ON e.id = p.event_id`;

	const total = await query<{ total: number }>(
		`SELECT COUNT(*) AS total ${from}${whereSql}`,
		params,
	);
	const rows = await query<Record<string, unknown>>(
		`SELECT p.id, p.registration_id, p.event_id,
		        COALESCE(r.user_name, '') AS attendee_name,
		        COALESCE(r.user_email, '') AS attendee_email,
		        COALESCE(e.title, '') AS event_title,
		        COALESCE(p.provider, '') AS provider,
		        COALESCE(p.status, '') AS status,
		        COALESCE(r.registration_status, '') AS registration_status,
		        COALESCE(r.payment_status, '') AS payment_status,
		        COALESCE(p.final_fee_paise, 0) AS final_fee_paise,
		        COALESCE(p.collected_paise, 0) AS collected_paise,
		        COALESCE(p.refunded_paise, 0) AS refunded_paise,
		        COALESCE(p.payment_method, '') AS payment_method,
		        COALESCE(p.provider_order_id, '') AS provider_order_id,
		        COALESCE(p.captured_payment_id, '') AS captured_payment_id,
		        COALESCE(p.manual_review, 0) AS manual_review,
		        COALESCE(p.review_reason, '') AS review_reason,
		        COALESCE(p.created_at, '') AS created_at,
		        COALESCE(p.captured_at, '') AS captured_at
		   ${from}${whereSql}
		  ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
		[...params, perPage, (page - 1) * perPage],
	);

	const payments = rows.rows.map((row) => ({
		id: String(row.id ?? ""),
		registrationId: String(row.registration_id ?? ""),
		eventId: String(row.event_id ?? ""),
		attendeeName: String(row.attendee_name ?? ""),
		attendeeEmail: String(row.attendee_email ?? ""),
		eventTitle: String(row.event_title ?? ""),
		provider: String(row.provider ?? "unknown"),
		status: String(row.status ?? "unknown"),
		registrationStatus: String(row.registration_status ?? ""),
		paymentStatus: String(row.payment_status ?? ""),
		feeAmount: num(row.final_fee_paise) / 100,
		collectedAmount: num(row.collected_paise) / 100,
		refundedAmount: num(row.refunded_paise) / 100,
		paymentMethod: String(row.payment_method ?? ""),
		providerOrderId: String(row.provider_order_id ?? ""),
		capturedPaymentId: String(row.captured_payment_id ?? ""),
		manualReview: num(row.manual_review) === 1,
		reviewReason: String(row.review_reason ?? ""),
		createdAt: String(row.created_at ?? ""),
		capturedAt: String(row.captured_at ?? ""),
	}));

	const totalCount = num(total.rows[0]?.total);
	return {
		payments,
		total: totalCount,
		page,
		perPage,
		hasMore: (page - 1) * perPage + payments.length < totalCount,
	};
}

/**
 * Payment desk totals.
 *
 * Ported from the `/api/admin/payments/summary` route in
 * `admin-operations.pb.js`. Every figure is an application-ledger value, not a
 * bank settlement balance — the disclaimer says so on the page, and it is the
 * reason the numbers are allowed to differ from the provider's own dashboard.
 */
export async function paymentsSummary(actor: Actor) {
	const assignments = await loadAssignments(actor.id);
	if (!hasCapability(actor, "finance.view", {}, assignments)) {
		fail(403, "FORBIDDEN", "Branch finance access is required to view the payment desk");
	}

	const aggregate = await query<{
		payment_count: number;
		gross_collected_paise: number;
		refunded_paise: number;
		paygate_count: number;
		paygate_collected_paise: number;
		manual_count: number;
		manual_collected_paise: number;
		historical_count: number;
		historical_collected_paise: number;
		attention_count: number;
	}>(
		`SELECT COUNT(*) AS payment_count,
		        COALESCE(SUM(CASE WHEN collected_paise > 0 THEN collected_paise ELSE 0 END), 0) AS gross_collected_paise,
		        COALESCE(SUM(CASE WHEN refunded_paise > 0 THEN refunded_paise ELSE 0 END), 0) AS refunded_paise,
		        COALESCE(SUM(CASE WHEN provider = 'paygate' THEN 1 ELSE 0 END), 0) AS paygate_count,
		        COALESCE(SUM(CASE WHEN provider = 'paygate' AND collected_paise > 0 THEN collected_paise ELSE 0 END), 0) AS paygate_collected_paise,
		        COALESCE(SUM(CASE WHEN provider = 'manual' THEN 1 ELSE 0 END), 0) AS manual_count,
		        COALESCE(SUM(CASE WHEN provider = 'manual' AND collected_paise > 0 THEN collected_paise ELSE 0 END), 0) AS manual_collected_paise,
		        COALESCE(SUM(CASE WHEN provider NOT IN ('paygate', 'manual') THEN 1 ELSE 0 END), 0) AS historical_count,
		        COALESCE(SUM(CASE WHEN provider NOT IN ('paygate', 'manual') AND collected_paise > 0 THEN collected_paise ELSE 0 END), 0) AS historical_collected_paise,
		        COALESCE(SUM(CASE WHEN manual_review = 1 OR status = 'partially_refunded' THEN 1 ELSE 0 END), 0) AS attention_count
		   FROM payments`,
	);

	const row = aggregate.rows[0];
	const rupees = (paise: unknown) => Math.max(0, num(paise)) / 100;
	const gross = rupees(row?.gross_collected_paise);
	const refunded = rupees(row?.refunded_paise);

	return {
		summary: {
			paymentCount: num(row?.payment_count),
			grossCollectedAmount: gross,
			refundedAmount: refunded,
			netCollectedAmount: Math.max(0, gross - refunded),
			paygateCount: num(row?.paygate_count),
			paygateCollectedAmount: rupees(row?.paygate_collected_paise),
			manualCount: num(row?.manual_count),
			manualCollectedAmount: rupees(row?.manual_collected_paise),
			historicalCount: num(row?.historical_count),
			historicalCollectedAmount: rupees(row?.historical_collected_paise),
			attentionCount: num(row?.attention_count),
		},
		financeDisclaimer:
			"Gross collection, refunds and net collection are application ledger values from PayGate, manual confirmations and preserved historical provider evidence; they are not a live bank settlement balance.",
	};
}

// ---------------------------------------------------------------------------
// Data health
// ---------------------------------------------------------------------------

export async function dataHealth(actor: Actor) {
	const assignments = await loadAssignments(actor.id);
	if (!hasCapability(actor, "reports.view", {}, assignments)) {
		fail(403, "FORBIDDEN", "You cannot view data health");
	}

	const counts = await query<{ table_name: string; count: number }>(
		`SELECT 'users' AS table_name, COUNT(*) AS count FROM users
		 UNION ALL SELECT 'events', COUNT(*) FROM events
		 UNION ALL SELECT 'registrations', COUNT(*) FROM registrations
		 UNION ALL SELECT 'societies', COUNT(*) FROM societies
		 UNION ALL SELECT 'organization_assignments', COUNT(*) FROM organization_assignments
		 UNION ALL SELECT 'payment_attempts', COUNT(*) FROM payment_attempts
		 UNION ALL SELECT 'admin_audit_log', COUNT(*) FROM admin_audit_log`,
	);

	const integrity = await query<{ integrity_check: string }>("PRAGMA integrity_check");
	const fk = await query<{ table: string; rowid: number; parent: string }>("PRAGMA foreign_key_check");

	const orphanTickets = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM registrations
		  WHERE payment_status = 'paid' AND (ticket_id IS NULL OR ticket_id = '')`,
	);

	return {
		counts: Object.fromEntries(counts.rows.map((row) => [row.table_name, row.count])),
		integrity: integrity.rows[0]?.integrity_check ?? "unknown",
		foreignKeyViolations: fk.rows.length,
		paidWithoutTicket: orphanTickets.rows[0]?.count ?? 0,
	};
}

// ---------------------------------------------------------------------------
// Role change
// ---------------------------------------------------------------------------

const ASSIGNABLE_ROLES = ["admin", "chair", "user", "content"];

export async function changeUserRole(actor: Actor, userId: string, role: string) {
	if (actor.role !== "admin") {
		fail(403, "FORBIDDEN", "Only a branch administrator can change a user role");
	}
	if (!ASSIGNABLE_ROLES.includes(role)) {
		fail(400, "INVALID_ROLE", "Unknown role");
	}

	const target = await query<{ id: string; role: string | null }>(
		`SELECT id, role FROM users WHERE id = ?`,
		[userId],
	);
	const row = target.rows[0];
	if (!row) fail(404, "USER_NOT_FOUND", "User not found");

	// A branch administrator cannot demote themselves out of the last admin seat.
	if (row.role === "admin" && role !== "admin") {
		const admins = await query<{ count: number }>(
			`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`,
		);
		if ((admins.rows[0]?.count ?? 0) <= 1) {
			fail(409, "LAST_ADMIN", "Cannot remove the last branch administrator");
		}
	}

	await withTransaction(async () => {
		await query(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, [
			role,
			new Date().toISOString(),
			userId,
		]);
		await audit({
			actorId: actor.id,
			action: "access.role-change",
			entityType: "user",
			entityId: userId,
			before: { role: row.role },
			after: { role },
		});
	});

	return { user: { id: userId, role } };
}

// ---------------------------------------------------------------------------
// Event lifecycle commands
// ---------------------------------------------------------------------------

export async function archiveEvent(actor: Actor, eventId: string, note: string) {
	const event = await query<{ id: string; society_id: string | null; is_deleted: number }>(
		`SELECT id, society_id, is_deleted FROM events WHERE id = ?`,
		[eventId],
	);
	const row = event.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");

	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "events.archive", { id: row.id, societyId: row.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot archive this event");
	}
	if (row.is_deleted === 1) fail(409, "ALREADY_ARCHIVED", "This event is already archived");

	await withTransaction(async () => {
		await query(`UPDATE events SET is_deleted = 1, updated_at = ? WHERE id = ?`, [
			new Date().toISOString(),
			eventId,
		]);
		await audit({
			actorId: actor.id,
			action: "event.archive",
			eventId,
			entityType: "event",
			entityId: eventId,
			note,
			before: { isDeleted: false },
			after: { isDeleted: true },
		});
	});

	return { event: { id: eventId, isDeleted: true } };
}

export async function cancelEvent(actor: Actor, eventId: string, note: string) {
	const event = await query<{ id: string; society_id: string | null; status: string | null }>(
		`SELECT id, society_id, status FROM events WHERE id = ?`,
		[eventId],
	);
	const row = event.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");

	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "events.cancel", { id: row.id, societyId: row.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot cancel this event");
	}
	if (row.status === "cancelled") fail(409, "ALREADY_CANCELLED", "This event is already cancelled");
	if (row.status === "completed") fail(409, "EVENT_COMPLETED", "A completed event cannot be cancelled");

	await withTransaction(async () => {
		await query(
			`UPDATE events SET status = 'cancelled', registration_open = 0, updated_at = ? WHERE id = ?`,
			[new Date().toISOString(), eventId],
		);
		await audit({
			actorId: actor.id,
			action: "event.cancel",
			eventId,
			entityType: "event",
			entityId: eventId,
			note,
			before: { status: row.status },
			after: { status: "cancelled" },
		});
	});

	return { event: { id: eventId, status: "cancelled" } };
}

export async function recomputeEvent(actor: Actor, eventId: string) {
	const event = await query<{ id: string; society_id: string | null }>(
		`SELECT id, society_id FROM events WHERE id = ?`,
		[eventId],
	);
	const row = event.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");

	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "events.edit", { id: row.id, societyId: row.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot recompute this event");
	}

	await recomputeEventCounters(eventId);

	const counters = await query<{ registered_count: number; checked_in_count: number }>(
		`SELECT registered_count, checked_in_count FROM events WHERE id = ?`,
		[eventId],
	);
	return {
		event: {
			id: eventId,
			registeredCount: counters.rows[0]?.registered_count ?? 0,
			checkedInCount: counters.rows[0]?.checked_in_count ?? 0,
		},
	};
}
