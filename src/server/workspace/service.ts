/**
 * Workspace operations.
 *
 * Ported from `workspace.pb.js` (306 LOC). The authorization calls are the same
 * ones the hook made — `mayManageAssignments`, `mayGrantRole`,
 * `hasEventCapability` — so the rules did not drift during the port.
 *
 * Every handler takes an explicit `Actor` and re-derives assignments from the
 * database. Nothing trusts a client-supplied scope.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import {
	ALL_CAPABILITIES,
	activeAssignments,
	authRole,
	canonicalRoleCode,
	effectiveCapabilities,
	hasEventCapability,
	mayGrantRole,
	mayManageAssignments,
	roleScopeType,
	storageRoleCode,
	validRoleCode,
	type Actor,
	type Assignment,
	type Capability,
} from "@/server/authz/capabilities";
import { getEventEndTimestamp } from "@/lib/event-lifecycle";
import { recomputeEventCounters, reconcileEventWaitlist } from "@/server/registration/waitlist";

export class WorkspaceError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "WorkspaceError";
	}
}

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function clip(value: unknown, max: number): string {
	return String(value ?? "").trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Assignment loading
// ---------------------------------------------------------------------------

interface AssignmentRow {
	id: string;
	user_id: string;
	role_code: string;
	title: string | null;
	scope_type: string;
	society_id: string | null;
	event_id: string | null;
	term: string | null;
	starts_at: string | null;
	ends_at: string | null;
	active: number;
	source: string | null;
	created_by: string | null;
	notes: string | null;
}

function toAssignment(row: AssignmentRow): Assignment {
	return {
		id: row.id,
		userId: row.user_id,
		roleCode: row.role_code,
		scopeType: row.scope_type,
		societyId: row.society_id,
		eventId: row.event_id,
		active: row.active === 1,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		source: row.source,
	};
}

export async function loadAssignments(userId: string): Promise<Assignment[]> {
	const result = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments WHERE user_id = ? AND active = 1`,
		[userId],
	);
	return result.rows.map(toAssignment);
}

/** Attach the display names the admin UI needs. */
async function enrichAssignment(row: AssignmentRow): Promise<Record<string, unknown>> {
	let userName = "";
	let userEmail = "";
	let societyName = "";
	let eventTitle = "";

	if (row.user_id) {
		const user = await query<{ name: string | null; email: string | null; display_name: string | null }>(
			`SELECT name, email, display_name FROM users WHERE id = ?`,
			[row.user_id],
		);
		userName = user.rows[0]?.name ?? user.rows[0]?.display_name ?? "";
		userEmail = user.rows[0]?.email ?? "";
	}
	if (row.society_id) {
		const society = await query<{ name: string | null }>(`SELECT name FROM societies WHERE id = ?`, [
			row.society_id,
		]);
		societyName = society.rows[0]?.name ?? "";
	}
	if (row.event_id) {
		const event = await query<{ title: string | null }>(`SELECT title FROM events WHERE id = ?`, [
			row.event_id,
		]);
		eventTitle = event.rows[0]?.title ?? "";
	}

	return {
		id: row.id,
		userId: row.user_id,
		roleCode: row.role_code,
		canonicalRoleCode: canonicalRoleCode(row.role_code),
		title: row.title ?? "",
		scopeType: row.scope_type,
		societyId: row.society_id ?? "",
		eventId: row.event_id ?? "",
		societyName,
		eventTitle,
		term: row.term ?? "",
		startsAt: row.starts_at ?? "",
		endsAt: row.ends_at ?? "",
		active: row.active === 1,
		source: row.source ?? "",
		createdBy: row.created_by ?? "",
		notes: row.notes ?? "",
		userName,
		userEmail,
	};
}

// ---------------------------------------------------------------------------
// GET /api/workspace/me
// ---------------------------------------------------------------------------

export async function getWorkspaceMe(actor: Actor) {
	const assignments = await loadAssignments(actor.id);
	const capabilities = effectiveCapabilities(actor, assignments);

	// `branchCapabilities` answers "which capabilities do I hold anywhere in the
	// branch", independent of any one scope.
	const branchCapabilities: Capability[] = [];
	for (const capability of ALL_CAPABILITIES) {
		if (effectiveCapabilities(actor, assignments).includes(capability)) {
			branchCapabilities.push(capability);
		}
	}

	const rows = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments WHERE user_id = ? AND active = 1`,
		[actor.id],
	);

	return {
		hasWorkspace: capabilities.length > 0,
		legacyRole: authRole(actor),
		capabilities,
		branchCapabilities,
		assignments: await Promise.all(rows.rows.map(enrichAssignment)),
	};
}

// ---------------------------------------------------------------------------
// GET /api/workspace/assignments
// ---------------------------------------------------------------------------

export async function listAssignments(
	actor: Actor,
	scopeType: string,
	scopeId: string,
) {
	const assignments = await loadAssignments(actor.id);
	const societyId = scopeType === "society" ? scopeId : "";
	const eventId = scopeType === "event" ? scopeId : "";

	if (!mayManageAssignments(actor, assignments, scopeType, societyId, eventId ? { id: eventId } : null)) {
		fail(403, "FORBIDDEN", "You cannot manage assignments in this scope");
	}

	const where = ["scope_type = ?"];
	const params: unknown[] = [scopeType];
	if (scopeType === "society") {
		where.push("society_id = ?");
		params.push(scopeId);
	}
	if (scopeType === "event") {
		where.push("event_id = ?");
		params.push(scopeId);
	}

	const rows = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments
		  WHERE ${where.join(" AND ")}
		  ORDER BY active DESC, role_code ASC, created_at ASC`,
		params,
	);
	return { assignments: await Promise.all(rows.rows.map(enrichAssignment)) };
}

// ---------------------------------------------------------------------------
// POST /api/workspace/assignments
// ---------------------------------------------------------------------------

export interface CreateAssignmentInput {
	userId?: unknown;
	roleCode?: unknown;
	scopeType?: unknown;
	societyId?: unknown;
	eventId?: unknown;
	title?: unknown;
	term?: unknown;
	startsAt?: unknown;
	endsAt?: unknown;
	notes?: unknown;
}

export async function createAssignment(actor: Actor, input: CreateAssignmentInput) {
	const userId = clip(input.userId, 80);
	const roleCode = clip(input.roleCode, 80);
	const scopeType = clip(input.scopeType, 20);
	let societyId = clip(input.societyId, 80);
	let eventId = clip(input.eventId, 80);

	if (!userId || !roleCode || !scopeType) {
		fail(400, "INVALID_ASSIGNMENT", "User, role and scope are required");
	}

	const storedRoleCode = storageRoleCode(roleCode, scopeType);
	if (!storedRoleCode || !validRoleCode(roleCode, scopeType) || roleScopeType(roleCode, scopeType) !== scopeType) {
		fail(400, "ROLE_SCOPE_MISMATCH", "This role does not belong to the selected scope");
	}

	if (scopeType === "branch") {
		societyId = "";
		eventId = "";
	}
	if (scopeType === "society" && !societyId) {
		fail(400, "SOCIETY_REQUIRED", "Select a society");
	}
	if (scopeType === "event" && !eventId) {
		fail(400, "EVENT_REQUIRED", "Select an event");
	}

	const assignments = await loadAssignments(actor.id);
	if (!mayGrantRole(actor, assignments, roleCode, scopeType, societyId, eventId ? { id: eventId } : null)) {
		fail(403, "FORBIDDEN", "You cannot grant this role");
	}

	const user = await query<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [userId]);
	if (!user.rows[0]) fail(404, "USER_NOT_FOUND", "User not found");
	if (societyId) {
		const society = await query<{ id: string }>(`SELECT id FROM societies WHERE id = ?`, [societyId]);
		if (!society.rows[0]) fail(404, "SOCIETY_NOT_FOUND", "Society not found");
	}
	if (eventId) {
		const event = await query<{ id: string }>(`SELECT id FROM events WHERE id = ?`, [eventId]);
		if (!event.rows[0]) fail(404, "EVENT_NOT_FOUND", "Event not found");
	}

	// Duplicate check: same user, role, scope and (where relevant) target.
	const duplicateWhere = [
		"user_id = ?",
		"role_code = ?",
		"scope_type = ?",
		"active = 1",
	];
	const duplicateParams: unknown[] = [userId, storedRoleCode, scopeType];
	if (scopeType === "society") {
		duplicateWhere.push("society_id = ?");
		duplicateParams.push(societyId);
	}
	if (scopeType === "event") {
		duplicateWhere.push("event_id = ?");
		duplicateParams.push(eventId);
	}
	const duplicate = await query<{ id: string }>(
		`SELECT id FROM organization_assignments WHERE ${duplicateWhere.join(" AND ")}`,
		duplicateParams,
	);
	if (duplicate.rows[0]) {
		fail(409, "ASSIGNMENT_EXISTS", "This active assignment already exists");
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await withTransaction(async () => {
		await query(
			`INSERT INTO organization_assignments
			   (id, user_id, role_code, title, scope_type, society_id, event_id, term,
			    starts_at, ends_at, active, source, created_by, notes, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'manual', ?, ?, ?, ?)`,
			[
				id,
				userId,
				storedRoleCode,
				clip(input.title, 180),
				scopeType,
				societyId || null,
				eventId || null,
				clip(input.term, 80),
				clip(input.startsAt, 40),
				clip(input.endsAt, 40),
				actor.id,
				clip(input.notes, 2000),
				now,
				now,
			],
		);
		await audit({
			actorId: actor.id,
			action: "access.assignment-create",
			eventId: eventId || null,
			entityType: "organization_assignment",
			entityId: id,
			note: `${canonicalRoleCode(roleCode)} → ${userId}`,
			after: { userId, roleCode: storedRoleCode, scopeType, societyId, eventId },
		});
	});

	const created = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments WHERE id = ?`,
		[id],
	);
	return { assignment: await enrichAssignment(created.rows[0] as AssignmentRow) };
}

// ---------------------------------------------------------------------------
// DELETE /api/workspace/assignments/:id
// ---------------------------------------------------------------------------

export async function deactivateAssignment(actor: Actor, id: string) {
	const found = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments WHERE id = ?`,
		[id],
	);
	const row = found.rows[0];
	if (!row) fail(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found");

	const assignments = await loadAssignments(actor.id);
	if (
		!mayGrantRole(
			actor,
			assignments,
			row.role_code,
			row.scope_type,
			row.society_id ?? "",
			row.event_id ? { id: row.event_id } : null,
		)
	) {
		fail(403, "FORBIDDEN", "You cannot remove this assignment");
	}

	await withTransaction(async () => {
		await query(
			`UPDATE organization_assignments SET active = 0, updated_at = ? WHERE id = ?`,
			[new Date().toISOString(), id],
		);
		await audit({
			actorId: actor.id,
			action: "access.assignment-deactivate",
			eventId: row.event_id,
			entityType: "organization_assignment",
			entityId: id,
			note: `${row.role_code} → ${row.user_id}`,
			before: { active: true },
			after: { active: false },
		});
	});

	const updated = await query<AssignmentRow>(
		`SELECT id, user_id, role_code, title, scope_type, society_id, event_id, term,
		        starts_at, ends_at, active, source, created_by, notes
		   FROM organization_assignments WHERE id = ?`,
		[id],
	);
	return { assignment: await enrichAssignment(updated.rows[0] as AssignmentRow) };
}

// ---------------------------------------------------------------------------
// GET /api/workspace/users/search
// ---------------------------------------------------------------------------

export async function searchUsers(
	actor: Actor,
	q: string,
	scopeType: string,
	scopeId: string,
) {
	const societyId = scopeType === "society" ? scopeId : "";
	const eventId = scopeType === "event" ? scopeId : "";
	const assignments = await loadAssignments(actor.id);

	if (!mayManageAssignments(actor, assignments, scopeType, societyId, eventId ? { id: eventId } : null)) {
		fail(403, "FORBIDDEN", "You cannot search users for this scope");
	}
	if (q.length < 2) return { users: [] };

	const rows = await query<{ id: string; name: string | null; email: string | null; display_name: string | null }>(
		`SELECT id, name, email, display_name FROM users
		  WHERE name LIKE ? OR email LIKE ? OR display_name LIKE ?
		  ORDER BY name LIMIT 20`,
		[`%${q}%`, `%${q}%`, `%${q}%`],
	);

	return {
		users: rows.rows.map((user) => ({
			id: user.id,
			name: user.name || user.display_name || "",
			email: user.email || "",
		})),
	};
}

// ---------------------------------------------------------------------------
// GET|POST /api/workspace/profile
// ---------------------------------------------------------------------------

export async function getProfile(userId: string) {
	const result = await query<{
		id: string;
		account_type: string | null;
		sr_number: string | null;
		department: string | null;
		semester: string | null;
		graduation_year: string | null;
		ieee_member_id: string | null;
		ieee_member: number;
		institutional_verified: number;
		verified_at: string | null;
	}>(`SELECT * FROM community_profiles WHERE user_id = ?`, [userId]);

	const row = result.rows[0];
	if (!row) return { profile: null };

	return {
		profile: {
			id: row.id,
			accountType: row.account_type ?? "",
			srNumber: row.sr_number ?? "",
			department: row.department ?? "",
			semester: row.semester ?? "",
			graduationYear: row.graduation_year ?? "",
			ieeeMemberId: row.ieee_member_id ?? "",
			ieeeMember: row.ieee_member === 1,
			institutionalVerified: row.institutional_verified === 1,
			verifiedAt: row.verified_at ?? "",
		},
	};
}

const ACCOUNT_TYPES = ["", "student", "faculty", "alumni", "external"];

export async function saveProfile(userId: string, input: Record<string, unknown>) {
	const accountType = clip(input.accountType, 40);
	if (!ACCOUNT_TYPES.includes(accountType)) {
		fail(400, "INVALID_ACCOUNT_TYPE", "Invalid community account type");
	}

	const existing = await query<{ id: string }>(
		`SELECT id FROM community_profiles WHERE user_id = ?`,
		[userId],
	);
	const id = existing.rows[0]?.id ?? crypto.randomUUID();
	const now = new Date().toISOString();

	// institutionalVerified / verifiedBy / verifiedAt are never accepted from
	// self-service input — they are set by staff verification only.
	const values = [
		accountType,
		clip(input.srNumber, 80),
		clip(input.department, 120),
		clip(input.semester, 40),
		clip(input.graduationYear, 20),
		clip(input.ieeeMemberId, 80),
		input.ieeeMember === true ? 1 : 0,
		now,
	];

	if (existing.rows[0]) {
		await query(
			`UPDATE community_profiles
			    SET account_type = ?, sr_number = ?, department = ?, semester = ?,
			        graduation_year = ?, ieee_member_id = ?, ieee_member = ?, updated_at = ?
			  WHERE id = ?`,
			[...values, id],
		);
	} else {
		await query(
			`INSERT INTO community_profiles
			   (id, user_id, account_type, sr_number, department, semester,
			    graduation_year, ieee_member_id, ieee_member, institutional_verified,
			    created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			[id, userId, ...values.slice(0, 7), now, now],
		);
	}

	return { success: true, profileId: id };
}

// ---------------------------------------------------------------------------
// POST /api/workspace/events/:id/workflow
// ---------------------------------------------------------------------------

const WORKFLOW_CAPABILITIES: Record<string, Capability> = {
	publish: "events.publish",
	unpublish: "events.publish",
	complete: "events.complete",
};

/** Ported from `event-lifecycle-helpers.js#publishError`. */
function publishError(event: {
	title: string | null;
	date: string | null;
	societyId: string | null;
	attendanceMode: string | null;
	venue: string | null;
	registrationStart: string | null;
	registrationDeadline: string | null;
	registrationMode: string | null;
	externalFormUrl: string | null;
}): { code: string; message: string } | null {
	if (!event.title || !event.date || !event.societyId) {
		return { code: "EVENT_INCOMPLETE", message: "Title, date and host society are required before publishing" };
	}
	if (event.attendanceMode !== "online" && !event.venue) {
		return {
			code: "EVENT_INCOMPLETE",
			message: "A venue is required before publishing an onsite or hybrid event",
		};
	}
	const start = Date.parse(event.registrationStart ?? "");
	const deadline = Date.parse(event.registrationDeadline ?? "");
	if (Number.isFinite(start) && Number.isFinite(deadline) && start >= deadline) {
		return { code: "INVALID_REGISTRATION_WINDOW", message: "Registration start must be before the deadline" };
	}
	if (event.registrationMode === "external" && !event.externalFormUrl) {
		return { code: "EXTERNAL_FORM_REQUIRED", message: "External registration requires a form URL" };
	}
	return null;
}

interface EventRow {
	id: string;
	title: string | null;
	date: string | null;
	end_date: string | null;
	society_id: string | null;
	status: string | null;
	is_deleted: number;
	registration_open: number;
	attendance_mode: string | null;
	venue: string | null;
	registration_start: string | null;
	registration_deadline: string | null;
	registration_mode: string | null;
	external_form_url: string | null;
}

async function loadEvent(id: string): Promise<EventRow> {
	const result = await query<EventRow>(`SELECT * FROM events WHERE id = ?`, [id]);
	const row = result.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");
	return row;
}

export async function runEventWorkflow(
	actor: Actor,
	eventId: string,
	action: string,
	note: string,
) {
	const event = await loadEvent(eventId);
	const required = WORKFLOW_CAPABILITIES[action];
	if (!required) fail(400, "INVALID_ACTION", "Unknown event lifecycle action");

	const assignments = await loadAssignments(actor.id);
	const scope = { id: event.id, societyId: event.society_id };
	if (!hasEventCapability(actor, required, scope, assignments)) {
		fail(403, "FORBIDDEN", "You cannot perform this event lifecycle action");
	}

	const before = { status: event.status, registrationOpen: event.registration_open === 1 };
	let nextStatus = event.status;
	let nextRegistrationOpen = event.registration_open === 1;
	let closeWaitlist = false;

	if (action === "publish") {
		if (event.is_deleted === 1 || ["cancelled", "completed"].includes(event.status ?? "")) {
			fail(409, "EVENT_FINAL", "This event can no longer be published");
		}
		if (event.status === "published") {
			fail(409, "ALREADY_PUBLISHED", "This event is already published");
		}
		const error = publishError({
			title: event.title,
			date: event.date,
			societyId: event.society_id,
			attendanceMode: event.attendance_mode,
			venue: event.venue,
			registrationStart: event.registration_start,
			registrationDeadline: event.registration_deadline,
			registrationMode: event.registration_mode,
			externalFormUrl: event.external_form_url,
		});
		if (error) fail(400, error.code, error.message);
		// Publishing does not reopen registration; that is a separate switch.
		nextStatus = "published";
	} else if (action === "unpublish") {
		if (event.status !== "published") {
			fail(409, "NOT_PUBLISHED", "Only a published event can be returned to draft");
		}
		nextStatus = "draft";
		nextRegistrationOpen = false;
	} else if (action === "complete") {
		if (event.status !== "published") {
			fail(409, "NOT_PUBLISHED", "Only a published event can be completed");
		}
		const endMs = getEventEndTimestamp({
			date: event.date,
			endDate: event.end_date,
		} as never);
		if (endMs !== null && endMs > Date.now()) {
			fail(409, "EVENT_NOT_ENDED", "The event cannot be completed before its scheduled end");
		}
		nextStatus = "completed";
		nextRegistrationOpen = false;
		closeWaitlist = true;
	}

	await withTransaction(async () => {
		await query(
			`UPDATE events SET status = ?, registration_open = ?, updated_at = ? WHERE id = ?`,
			[nextStatus, nextRegistrationOpen ? 1 : 0, new Date().toISOString(), event.id],
		);
		await audit({
			actorId: actor.id,
			action: `event.lifecycle.${action}`,
			eventId: event.id,
			entityType: "event",
			entityId: event.id,
			note,
			before,
			after: { status: nextStatus, registrationOpen: nextRegistrationOpen },
		});
	});

	if (closeWaitlist) {
		// Closing out is best-effort: a failure here must not undo the completion.
		try {
			await reconcileEventWaitlist(event.id, new Date().toISOString());
		} catch (error) {
			console.error("[workspace] waitlist closeout failed:", error);
		}
	}

	return {
		event: { id: event.id, status: nextStatus, registrationOpen: nextRegistrationOpen },
	};
}

// ---------------------------------------------------------------------------
// POST /api/workspace/check-in
// ---------------------------------------------------------------------------

export async function checkIn(actor: Actor, ticketId: string, expectedEventId: string) {
	if (!ticketId) fail(400, "TICKET_REQUIRED", "Ticket ID is required");

	const assignments = await loadAssignments(actor.id);
	let expectedEvent: EventRow | null = null;

	if (expectedEventId) {
		expectedEvent = await loadEvent(expectedEventId);
		if (!hasEventCapability(actor, "checkin.manage", { id: expectedEvent.id, societyId: expectedEvent.society_id }, assignments)) {
			fail(403, "FORBIDDEN", "You are not assigned to check in this event");
		}
	}

	const reg = await query<{
		id: string;
		event_id: string;
		user_name: string | null;
		registration_status: string;
		checked_in: number;
	}>(
		`SELECT id, event_id, user_name, registration_status, checked_in
		   FROM registrations WHERE ticket_id = ?`,
		[ticketId],
	);
	const registration = reg.rows[0];
	if (!registration) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");

	const event = await loadEvent(registration.event_id);
	if (expectedEventId && event.id !== expectedEventId) {
		fail(409, "WRONG_EVENT", "This ticket belongs to a different event");
	}
	if (!expectedEvent) {
		if (!hasEventCapability(actor, "checkin.manage", { id: event.id, societyId: event.society_id }, assignments)) {
			fail(403, "FORBIDDEN", "You are not assigned to check in this event");
		}
	}
	if (event.status !== "published") {
		fail(409, "CHECKIN_NOT_ACTIVE", "Check-in is only available while the event is published");
	}

	const checkInEnabled = await query<{ check_in_enabled: number }>(
		`SELECT check_in_enabled FROM events WHERE id = ?`,
		[event.id],
	);
	if (checkInEnabled.rows[0]?.check_in_enabled !== 1) {
		fail(409, "CHECKIN_DISABLED", "Check-in is not enabled for this event");
	}
	if (registration.registration_status !== "confirmed") {
		fail(409, "NOT_CONFIRMED", "Registration is not confirmed");
	}

	// An event that uses attendance sessions must be checked in per session.
	const sessions = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM event_sessions WHERE event_id = ?`,
		[event.id],
	);
	if ((sessions.rows[0]?.count ?? 0) > 0) {
		fail(409, "SESSION_REQUIRED", "This event uses attendance sessions. Select a session in the Attendance console.");
	}
	if (registration.checked_in === 1) {
		fail(409, "ALREADY_CHECKED_IN", "Already checked in");
	}

	const now = new Date().toISOString();
	await withTransaction(async () => {
		await query(
			`UPDATE registrations SET checked_in = 1, checked_in_at = ?, updated_at = ? WHERE id = ?`,
			[now, now, registration.id],
		);
		await audit({
			actorId: actor.id,
			action: "registration.check-in",
			eventId: event.id,
			registrationId: registration.id,
			before: { checkedIn: false },
			after: { checkedIn: true, checkedInAt: now },
		});
	});

	await recomputeEventCounters(event.id);

	return {
		success: true,
		message: "Checked in successfully",
		registration: {
			id: registration.id,
			eventTitle: event.title ?? "",
			ticketId,
			userName: registration.user_name ?? "",
			checkedIn: true,
			checkedInAt: now,
		},
	};
}

export { activeAssignments };
