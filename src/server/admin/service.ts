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

export async function listPayments(
	actor: Actor,
	filters: { q?: string; status?: string; page?: number; perPage?: number },
) {
	const assignments = await loadAssignments(actor.id);
	if (!hasCapability(actor, "finance.view", {}, assignments)) {
		fail(403, "FORBIDDEN", "Branch finance access is required to view the payment desk");
	}

	const page = Math.max(1, filters.page ?? 1);
	const perPage = Math.min(100, Math.max(1, filters.perPage ?? 25));

	const where: string[] = [];
	const params: unknown[] = [];
	if (filters.status) {
		where.push("r.payment_status = ?");
		params.push(filters.status);
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
		`SELECT r.id, r.user_name, r.user_email, r.ticket_id, r.payment_status,
		        r.final_fee_paise, r.amount, r.payment_data, r.created_at,
		        e.title AS event_title
		   FROM registrations r LEFT JOIN events e ON e.id = r.event_id
		   ${whereSql}
		  ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
		[...params, perPage, (page - 1) * perPage],
	);

	const payments = rows.rows.map((row) => {
		const paymentData = row.payment_data ? JSON.parse(String(row.payment_data)) : null;
		return {
			id: row.id,
			userName: row.user_name ?? "",
			userEmail: row.user_email ?? "",
			ticketId: row.ticket_id ?? "",
			eventTitle: row.event_title ?? "",
			paymentStatus: row.payment_status ?? "",
			amount: num(row.amount),
			collectedPaise: num(row.final_fee_paise),
			provider: paymentData?.provider ?? "",
			providerStatus: paymentData?.providerStatus ?? "",
			manualReview: paymentData?.manualReview === true,
			createdAt: row.created_at ?? "",
		};
	});

	const totalCount = total.rows[0]?.count ?? 0;
	return {
		payments,
		total: totalCount,
		page,
		perPage,
		hasMore: (page - 1) * perPage + payments.length < totalCount,
	};
}

export async function paymentsSummary(actor: Actor) {
	const assignments = await loadAssignments(actor.id);
	if (!hasCapability(actor, "finance.view", {}, assignments)) {
		fail(403, "FORBIDDEN", "Branch finance access is required to view the payment desk");
	}

	const rows = await query<{ payment_status: string; count: number; collected: number }>(
		`SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(final_fee_paise), 0) AS collected
		   FROM registrations GROUP BY payment_status`,
	);

	const byStatus: Record<string, { count: number; collectedPaise: number }> = {};
	let totalCollectedPaise = 0;
	for (const row of rows.rows) {
		byStatus[row.payment_status ?? "unknown"] = {
			count: row.count,
			collectedPaise: row.collected,
		};
		if (row.payment_status === "paid") totalCollectedPaise += row.collected;
	}

	return { byStatus, totalCollectedPaise };
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
