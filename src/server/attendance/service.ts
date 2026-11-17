/**
 * Attendance V2.
 *
 * Ported from `attendance-v2.pb.js` (581 LOC) and `attendance-v2-helpers.js`
 * (204 LOC). Staging holds **zero** attendance rows, so every rule here comes
 * from the hook source, and the tests build their own fixtures rather than
 * leaning on production data.
 *
 * Two invariants carry the design:
 *
 *   1. **Append-only.** A correction is a new row (`manual_add` /
 *      `manual_remove`), never an edit. The hook enforced this with record
 *      request guards; here the service simply never issues an UPDATE or DELETE
 *      against `attendance_records`.
 *   2. **State is derived, never stored.** "Present" is the fold of the row
 *      history through `nextCreditState`, so a removal followed by a re-add is
 *      two rows and one present state — and the history stays auditable.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { recomputeEventCounters } from "@/server/registration/waitlist";

/** Row types that credit attendance. Anything else leaves state unchanged. */
export const CREDITING_TYPES = ["present", "entry", "manual_add"] as const;

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function clip(value: unknown, max: number): string {
	return String(value ?? "").trim().slice(0, max);
}

export interface SessionRow {
	id: string;
	event_id: string;
	title: string | null;
	starts_at: string | null;
	ends_at: string | null;
	venue: string | null;
	sort_order: number;
	attendance_enabled: number;
	check_in_enabled: number;
	required_for_certificate: number;
	attendance_weight: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface AttendanceRow {
	id: string;
	event_id: string;
	session_id: string;
	registration_id: string;
	type: string;
	occurred_at: string;
	operator_id: string | null;
	source: string | null;
	device_id: string | null;
	idempotency_key: string | null;
	note: string | null;
	created_at: string;
}

/**
 * The fold that defines "present".
 *
 * A crediting row sets it; `manual_remove` clears it; any other type leaves it
 * as it was. This is the whole of the attendance model.
 */
export function nextCreditState(current: boolean, type: string): boolean {
	if ((CREDITING_TYPES as readonly string[]).includes(type)) return true;
	if (type === "manual_remove") return false;
	return current;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function sessionsForEvent(eventId: string): Promise<SessionRow[]> {
	const result = await query<SessionRow>(
		`SELECT * FROM event_sessions WHERE event_id = ?
		  ORDER BY sort_order ASC, starts_at ASC, id ASC`,
		[eventId],
	);
	return result.rows;
}

export async function eventHasSessions(eventId: string): Promise<boolean> {
	const result = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM event_sessions WHERE event_id = ?`,
		[eventId],
	);
	return (result.rows[0]?.count ?? 0) > 0;
}

/** Attendance rows for a session, optionally narrowed to one registration. */
export async function attendanceRows(
	sessionId: string,
	registrationId?: string,
): Promise<AttendanceRow[]> {
	const where = ["session_id = ?"];
	const params: unknown[] = [sessionId];
	if (registrationId) {
		where.push("registration_id = ?");
		params.push(registrationId);
	}
	const result = await query<AttendanceRow>(
		`SELECT * FROM attendance_records WHERE ${where.join(" AND ")}
		  ORDER BY occurred_at ASC, created_at ASC, id ASC`,
		params,
	);
	return result.rows;
}

export interface SessionState {
	present: boolean;
	lastAt: string;
	lastType: string;
	recordCount: number;
}

export async function registrationSessionState(
	sessionId: string,
	registrationId: string,
): Promise<SessionState> {
	const rows = await attendanceRows(sessionId, registrationId);
	let present = false;
	let lastAt = "";
	let lastType = "";
	for (const row of rows) {
		present = nextCreditState(present, row.type);
		lastAt = row.occurred_at || lastAt;
		lastType = row.type || lastType;
	}
	return { present, lastAt, lastType, recordCount: rows.length };
}

/** Distinct confirmed registrations currently credited for a session. */
export async function presentCount(sessionId: string): Promise<number> {
	const rows = await attendanceRows(sessionId);
	const states = new Map<string, boolean>();
	for (const row of rows) {
		if (!row.registration_id) continue;
		states.set(row.registration_id, nextCreditState(states.get(row.registration_id) === true, row.type));
	}

	const present = [...states.entries()].filter(([, value]) => value).map(([id]) => id);
	if (!present.length) return 0;

	const confirmed = await query<{ id: string }>(
		`SELECT id FROM registrations
		  WHERE registration_status = 'confirmed'
		    AND id IN (${present.map(() => "?").join(", ")})`,
		present,
	);
	return confirmed.rows.length;
}

export async function sessionPayload(session: SessionRow): Promise<Record<string, unknown>> {
	return {
		id: session.id,
		eventId: session.event_id,
		title: session.title ?? "",
		startsAt: session.starts_at ?? "",
		endsAt: session.ends_at ?? "",
		venue: session.venue ?? "",
		sortOrder: session.sort_order,
		attendanceEnabled: session.attendance_enabled === 1,
		checkInEnabled: session.check_in_enabled === 1,
		requiredForCertificate: session.required_for_certificate === 1,
		attendanceWeight: session.attendance_weight,
		presentCount: await presentCount(session.id),
	};
}

export async function recentAttendance(sessionId: string, limit = 20) {
	const bounded = Math.max(1, Math.min(50, Number(limit) || 20));
	const rows = await query<AttendanceRow & { ticket_id: string | null; user_name: string | null }>(
		`SELECT a.*, r.ticket_id, r.user_name
		   FROM attendance_records a
		   LEFT JOIN registrations r ON r.id = a.registration_id
		  WHERE a.session_id = ?
		  ORDER BY a.occurred_at DESC, a.created_at DESC, a.id DESC
		  LIMIT ?`,
		[sessionId, bounded],
	);

	const stateCache = new Map<string, boolean>();
	const seen = new Set<string>();

	const out = [];
	for (const row of rows.rows) {
		if (!stateCache.has(row.registration_id)) {
			stateCache.set(row.registration_id, (await registrationSessionState(sessionId, row.registration_id)).present);
		}
		const isLatest = !seen.has(row.registration_id);
		seen.add(row.registration_id);
		out.push({
			id: row.id,
			registrationId: row.registration_id,
			ticketId: row.ticket_id ?? "",
			userName: row.user_name ?? "",
			type: row.type,
			occurredAt: row.occurred_at,
			source: row.source ?? "",
			present: stateCache.get(row.registration_id) === true,
			isLatestForRegistration: isLatest,
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

interface EventRow {
	id: string;
	title: string | null;
	society_id: string | null;
	status: string | null;
	check_in_enabled: number;
	attendance_qualification_locked: number;
}

async function loadEvent(eventId: string): Promise<EventRow> {
	const result = await query<EventRow>(`SELECT * FROM events WHERE id = ?`, [eventId]);
	const row = result.rows[0];
	if (!row) fail(404, "EVENT_NOT_FOUND", "Event not found");
	return row;
}

async function requireEventCapability(
	actor: Actor,
	capability: "events.view" | "events.edit" | "checkin.manage",
	event: EventRow,
): Promise<void> {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, capability, { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You are not assigned to this event");
	}
}

function assertUnlocked(event: EventRow, message: string): void {
	if (event.attendance_qualification_locked === 1) {
		fail(409, "ATTENDANCE_QUALIFICATION_LOCKED", message);
	}
}

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

export async function listSessions(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.view", event);

	const sessions = await sessionsForEvent(eventId);
	return {
		mode: sessions.length ? "sessions" : "legacy",
		sessions: await Promise.all(sessions.map(sessionPayload)),
		qualification: {
			locked: event.attendance_qualification_locked === 1,
		},
	};
}

export interface CreateSessionInput {
	title?: unknown;
	startsAt?: unknown;
	endsAt?: unknown;
	venue?: unknown;
	sortOrder?: unknown;
	attendanceEnabled?: unknown;
	checkInEnabled?: unknown;
	requiredForCertificate?: unknown;
	attendanceWeight?: unknown;
}

export async function createSession(actor: Actor, eventId: string, input: CreateSessionInput) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);
	assertUnlocked(event, "Reopen attendance qualification before changing session configuration");

	const title = clip(input.title, 180);
	const startsAt = clip(input.startsAt, 40);
	const endsAt = clip(input.endsAt, 40);

	if (!title) fail(400, "TITLE_REQUIRED", "Session title is required");
	if (!startsAt || !Number.isFinite(Date.parse(startsAt))) {
		fail(400, "START_REQUIRED", "A valid session start time is required");
	}
	if (endsAt && (!Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt))) {
		fail(400, "INVALID_END", "Session end must be after its start");
	}

	const weight = input.attendanceWeight === undefined ? 1 : Number(input.attendanceWeight);
	if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
		fail(400, "INVALID_WEIGHT", "Attendance weight must be between 0 and 100");
	}

	const existing = await sessionsForEvent(eventId);
	const sortOrder =
		input.sortOrder === undefined ? existing.length * 10 : Math.max(0, Number(input.sortOrder) || 0);

	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await withTransaction(async () => {
		// Re-check inside the transaction: a concurrent lock must win.
		const current = await query<{ attendance_qualification_locked: number }>(
			`SELECT attendance_qualification_locked FROM events WHERE id = ?`,
			[eventId],
		);
		if (current.rows[0]?.attendance_qualification_locked === 1) {
			fail(409, "ATTENDANCE_QUALIFICATION_LOCKED", "Reopen attendance qualification before changing session configuration");
		}

		await query(
			`INSERT INTO event_sessions
			   (id, event_id, title, starts_at, ends_at, venue, sort_order,
			    attendance_enabled, check_in_enabled, required_for_certificate,
			    attendance_weight, created_by, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				eventId,
				title,
				startsAt,
				endsAt || null,
				clip(input.venue, 250),
				sortOrder,
				input.attendanceEnabled !== false ? 1 : 0,
				input.checkInEnabled !== false ? 1 : 0,
				input.requiredForCertificate === true ? 1 : 0,
				weight,
				actor.id,
				now,
				now,
			],
		);

		await audit({
			actorId: actor.id,
			action: "attendance.session.created",
			eventId,
			entityType: "event_session",
			entityId: id,
			after: { title, startsAt, endsAt, weight },
		});
	});

	const created = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [id]);
	return { session: await sessionPayload(created.rows[0] as SessionRow) };
}

export async function updateSession(actor: Actor, sessionId: string, input: Record<string, unknown>) {
	const found = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [sessionId]);
	const session = found.rows[0];
	if (!session) fail(404, "SESSION_NOT_FOUND", "Attendance session not found");

	const event = await loadEvent(session.event_id);
	await requireEventCapability(actor, "events.edit", event);
	assertUnlocked(event, "Reopen attendance qualification before changing session configuration");

	const title = input.title === undefined ? (session.title ?? "") : clip(input.title, 180);
	const startsAt = input.startsAt === undefined ? (session.starts_at ?? "") : clip(input.startsAt, 40);
	const endsAt = input.endsAt === undefined ? (session.ends_at ?? "") : clip(input.endsAt, 40);

	if (!title) fail(400, "TITLE_REQUIRED", "Session title is required");
	if (!startsAt || !Number.isFinite(Date.parse(startsAt))) {
		fail(400, "START_REQUIRED", "A valid session start time is required");
	}
	if (endsAt && (!Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt))) {
		fail(400, "INVALID_END", "Session end must be after its start");
	}

	const weight =
		input.attendanceWeight === undefined ? session.attendance_weight : Number(input.attendanceWeight);
	if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
		fail(400, "INVALID_WEIGHT", "Attendance weight must be between 0 and 100");
	}

	await withTransaction(async () => {
		const current = await query<{ attendance_qualification_locked: number }>(
			`SELECT attendance_qualification_locked FROM events WHERE id = ?`,
			[session.event_id],
		);
		if (current.rows[0]?.attendance_qualification_locked === 1) {
			fail(409, "ATTENDANCE_QUALIFICATION_LOCKED", "Reopen attendance qualification before changing session configuration");
		}

		await query(
			`UPDATE event_sessions
			    SET title = ?, starts_at = ?, ends_at = ?,
			        venue = ?, sort_order = ?, attendance_enabled = ?,
			        check_in_enabled = ?, required_for_certificate = ?,
			        attendance_weight = ?, updated_at = ?
			  WHERE id = ?`,
			[
				title,
				startsAt,
				endsAt || null,
				input.venue === undefined ? (session.venue ?? "") : clip(input.venue, 250),
				input.sortOrder === undefined ? session.sort_order : Math.max(0, Number(input.sortOrder) || 0),
				input.attendanceEnabled === undefined
					? session.attendance_enabled
					: input.attendanceEnabled === true
						? 1
						: 0,
				input.checkInEnabled === undefined
					? session.check_in_enabled
					: input.checkInEnabled === true
						? 1
						: 0,
				input.requiredForCertificate === undefined
					? session.required_for_certificate
					: input.requiredForCertificate === true
						? 1
						: 0,
				weight,
				new Date().toISOString(),
				sessionId,
			],
		);

		await audit({
			actorId: actor.id,
			action: "attendance.session.updated",
			eventId: session.event_id,
			entityType: "event_session",
			entityId: sessionId,
			before: { title: session.title, startsAt: session.starts_at },
			after: { title, startsAt },
		});
	});

	const updated = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [sessionId]);
	return { session: await sessionPayload(updated.rows[0] as SessionRow) };
}

export async function deleteSession(actor: Actor, sessionId: string) {
	const found = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [sessionId]);
	const session = found.rows[0];
	if (!session) fail(404, "SESSION_NOT_FOUND", "Attendance session not found");

	const event = await loadEvent(session.event_id);
	await requireEventCapability(actor, "events.edit", event);
	assertUnlocked(event, "Reopen attendance qualification before changing session configuration");

	// Attendance history is append-only, so a session that has any rows cannot be
	// deleted — deleting it would orphan records that must remain auditable.
	const rows = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM attendance_records WHERE session_id = ?`,
		[sessionId],
	);
	if ((rows.rows[0]?.count ?? 0) > 0) {
		fail(409, "SESSION_HAS_ATTENDANCE", "This session has attendance records and cannot be deleted");
	}

	await withTransaction(async () => {
		await query(`DELETE FROM event_sessions WHERE id = ?`, [sessionId]);
		await audit({
			actorId: actor.id,
			action: "attendance.session.deleted",
			eventId: session.event_id,
			entityType: "event_session",
			entityId: sessionId,
			before: { title: session.title },
		});
	});

	return { deleted: true };
}

// ---------------------------------------------------------------------------
// Check-in (scanner)
// ---------------------------------------------------------------------------

export interface CheckInInput {
	ticketId?: unknown;
	eventId?: unknown;
	sessionId?: unknown;
	idempotencyKey?: unknown;
	deviceId?: unknown;
}

export async function attendanceCheckIn(actor: Actor, input: CheckInInput) {
	const ticketId = clip(input.ticketId, 120);
	const eventId = clip(input.eventId, 80);
	const sessionId = clip(input.sessionId, 80);
	const idempotencyKey = clip(input.idempotencyKey, 180);
	const deviceId = clip(input.deviceId, 180);

	if (!ticketId) fail(400, "TICKET_REQUIRED", "Ticket ID is required");
	if (!eventId) fail(400, "EVENT_REQUIRED", "Select an event before scanning");
	if (!idempotencyKey) fail(400, "IDEMPOTENCY_REQUIRED", "A scan request identifier is required");

	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "checkin.manage", event);

	const reg = await query<{ id: string; event_id: string; registration_status: string; ticket_id: string | null; user_name: string | null }>(
		`SELECT id, event_id, registration_status, ticket_id, user_name
		   FROM registrations WHERE ticket_id = ?`,
		[ticketId],
	);
	const registration = reg.rows[0];
	if (!registration) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
	if (registration.event_id !== eventId) fail(409, "WRONG_EVENT", "This ticket belongs to a different event");
	if (event.status !== "published") {
		fail(409, "CHECKIN_NOT_ACTIVE", "Check-in is only available while the event is published");
	}
	if (event.check_in_enabled !== 1) fail(409, "CHECKIN_DISABLED", "Check-in is not enabled for this event");
	if (registration.registration_status !== "confirmed") {
		fail(409, "NOT_CONFIRMED", "Registration is not confirmed");
	}
	if (!(await eventHasSessions(eventId))) {
		fail(409, "LEGACY_EVENT", "This event uses the legacy single check-in flow");
	}
	if (!sessionId) fail(400, "SESSION_REQUIRED", "Select an attendance session before scanning");

	const sessionFound = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [sessionId]);
	const session = sessionFound.rows[0];
	if (!session || session.event_id !== eventId) {
		fail(409, "WRONG_SESSION", "The selected session does not belong to this event");
	}
	if (session.attendance_enabled !== 1) {
		fail(409, "ATTENDANCE_DISABLED", "Attendance is disabled for this session");
	}
	if (session.check_in_enabled !== 1) {
		fail(409, "SESSION_CHECKIN_DISABLED", "Check-in is disabled for this session");
	}

	let replayed = false;
	let recordId = "";
	let occurredAt = "";

	await withTransaction(async () => {
		// Idempotency: the same scan key must never write twice. A key reused for a
		// different registration or session is a conflict, not a replay.
		const replay = await query<AttendanceRow>(
			`SELECT * FROM attendance_records WHERE idempotency_key = ?`,
			[idempotencyKey],
		);
		const existing = replay.rows[0];
		if (existing) {
			if (existing.registration_id !== registration.id || existing.session_id !== session.id) {
				fail(409, "IDEMPOTENCY_CONFLICT", "This scan request identifier was already used");
			}
			replayed = true;
			recordId = existing.id;
			occurredAt = existing.occurred_at;
			return;
		}

		// Re-read inside the transaction so a concurrent status change wins.
		const currentEvent = await query<{ status: string | null; check_in_enabled: number }>(
			`SELECT status, check_in_enabled FROM events WHERE id = ?`,
			[eventId],
		);
		if (currentEvent.rows[0]?.status !== "published") {
			fail(409, "CHECKIN_NOT_ACTIVE", "Check-in is only available while the event is published");
		}
		if (currentEvent.rows[0]?.check_in_enabled !== 1) {
			fail(409, "CHECKIN_DISABLED", "Check-in is not enabled for this event");
		}

		const state = await registrationSessionState(session.id, registration.id);
		if (state.present) {
			fail(409, "ALREADY_PRESENT", "Attendee is already present for this session");
		}

		occurredAt = new Date().toISOString();
		recordId = crypto.randomUUID();

		await query(
			`INSERT INTO attendance_records
			   (id, event_id, session_id, registration_id, type, occurred_at,
			    operator_id, source, device_id, idempotency_key, note, created_at)
			 VALUES (?, ?, ?, ?, 'present', ?, ?, 'scanner', ?, ?, NULL, ?)`,
			[recordId, eventId, session.id, registration.id, occurredAt, actor.id, deviceId, idempotencyKey, occurredAt],
		);

		// Legacy arrival projection: the first attendance credit also marks the
		// registration checked in, so the old single check-in view stays truthful.
		await query(
			`UPDATE registrations SET checked_in = 1, checked_in_at = ?, updated_at = ?
			  WHERE id = ? AND checked_in = 0`,
			[occurredAt, occurredAt, registration.id],
		);

		await audit({
			actorId: actor.id,
			action: "attendance.present",
			eventId,
			registrationId: registration.id,
			entityType: "attendance_record",
			entityId: recordId,
			before: { sessionId: session.id, present: false },
			after: { sessionId: session.id, present: true, occurredAt },
		});
	});

	await recomputeEventCounters(eventId);

	return {
		success: true,
		replayed,
		message: replayed ? "Scan already recorded" : "Attendance recorded",
		registration: {
			id: registration.id,
			ticketId: registration.ticket_id ?? "",
			userName: registration.user_name ?? "",
			eventId,
			eventTitle: event.title ?? "",
			sessionId: session.id,
			sessionTitle: session.title ?? "",
			occurredAt,
		},
		presentCount: await presentCount(session.id),
	};
}

// ---------------------------------------------------------------------------
// Correction (manual add/remove)
// ---------------------------------------------------------------------------

export interface CorrectInput {
	registrationId?: unknown;
	sessionId?: unknown;
	action?: unknown;
	note?: unknown;
	deviceId?: unknown;
}

export async function correctAttendance(actor: Actor, input: CorrectInput) {
	const registrationId = clip(input.registrationId, 80);
	const sessionId = clip(input.sessionId, 80);
	const action = clip(input.action, 40);
	const note = clip(input.note, 2000);

	if (action !== "manual_add" && action !== "manual_remove") {
		fail(400, "INVALID_ACTION", "Choose manual_add or manual_remove");
	}
	// A correction without a reason is not auditable, so it is refused.
	if (!note) fail(400, "NOTE_REQUIRED", "A correction reason is required");

	const sessionFound = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [sessionId]);
	const session = sessionFound.rows[0];
	if (!session) fail(404, "SESSION_NOT_FOUND", "Attendance session not found");

	const event = await loadEvent(session.event_id);
	await requireEventCapability(actor, "checkin.manage", event);
	assertUnlocked(event, "Reopen attendance qualification before recording corrections");

	const reg = await query<{ id: string; event_id: string; registration_status: string }>(
		`SELECT id, event_id, registration_status FROM registrations WHERE id = ?`,
		[registrationId],
	);
	const registration = reg.rows[0];
	if (!registration) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");
	if (registration.event_id !== event.id) {
		fail(409, "WRONG_EVENT", "Registration and session belong to different events");
	}
	if (registration.registration_status !== "confirmed") {
		fail(409, "NOT_CONFIRMED", "Only confirmed registrations can receive attendance credit");
	}

	let recordId = "";
	let occurredAt = "";

	await withTransaction(async () => {
		const currentEvent = await query<{ attendance_qualification_locked: number }>(
			`SELECT attendance_qualification_locked FROM events WHERE id = ?`,
			[event.id],
		);
		if (currentEvent.rows[0]?.attendance_qualification_locked === 1) {
			fail(409, "ATTENDANCE_QUALIFICATION_LOCKED", "Reopen attendance qualification before recording corrections");
		}

		const state = await registrationSessionState(session.id, registration.id);
		if (action === "manual_add" && state.present) {
			fail(409, "ALREADY_PRESENT", "Attendee is already present for this session");
		}
		if (action === "manual_remove" && !state.present) {
			fail(409, "NOT_PRESENT", "Attendee is not currently present for this session");
		}

		occurredAt = new Date().toISOString();
		recordId = crypto.randomUUID();

		await query(
			`INSERT INTO attendance_records
			   (id, event_id, session_id, registration_id, type, occurred_at,
			    operator_id, source, device_id, idempotency_key, note, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, NULL, ?, ?)`,
			[
				recordId,
				event.id,
				session.id,
				registration.id,
				action,
				occurredAt,
				actor.id,
				clip(input.deviceId, 180),
				note,
				occurredAt,
			],
		);

		if (action === "manual_add") {
			await query(
				`UPDATE registrations SET checked_in = 1, checked_in_at = ?, updated_at = ?
				  WHERE id = ? AND checked_in = 0`,
				[occurredAt, occurredAt, registration.id],
			);
		}

		await audit({
			actorId: actor.id,
			action: `attendance.${action}`,
			eventId: event.id,
			registrationId: registration.id,
			entityType: "attendance_record",
			entityId: recordId,
			note,
			before: { sessionId: session.id, present: state.present },
			after: { sessionId: session.id, present: action === "manual_add", occurredAt },
		});
	});

	await recomputeEventCounters(event.id);

	return {
		corrected: true,
		recordId,
		present: action === "manual_add",
		occurredAt,
		presentCount: await presentCount(session.id),
	};
}

// ---------------------------------------------------------------------------
// Qualification lock
// ---------------------------------------------------------------------------

export async function lockQualification(actor: Actor, eventId: string, note: string) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);
	if (event.attendance_qualification_locked === 1) {
		fail(409, "ALREADY_LOCKED", "Attendance qualification is already locked");
	}

	const now = new Date().toISOString();
	await withTransaction(async () => {
		await query(
			`UPDATE events
			    SET attendance_qualification_locked = 1,
			        attendance_qualification_locked_at = ?,
			        attendance_qualification_locked_by = ?,
			        updated_at = ?
			  WHERE id = ?`,
			[now, actor.id, now, eventId],
		);
		await audit({
			actorId: actor.id,
			action: "attendance.qualification.locked",
			eventId,
			entityType: "event",
			entityId: eventId,
			note,
			before: { locked: false },
			after: { locked: true, lockedAt: now },
		});
	});

	return { locked: true, lockedAt: now };
}

export async function reopenQualification(actor: Actor, eventId: string, note: string) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);
	if (event.attendance_qualification_locked !== 1) {
		fail(409, "NOT_LOCKED", "Attendance qualification is not locked");
	}

	await withTransaction(async () => {
		await query(
			`UPDATE events
			    SET attendance_qualification_locked = 0,
			        attendance_qualification_version = attendance_qualification_version + 1,
			        updated_at = ?
			  WHERE id = ?`,
			[new Date().toISOString(), eventId],
		);
		await audit({
			actorId: actor.id,
			action: "attendance.qualification.reopened",
			eventId,
			entityType: "event",
			entityId: eventId,
			note,
			before: { locked: true },
			after: { locked: false },
		});
	});

	return { locked: false };
}
