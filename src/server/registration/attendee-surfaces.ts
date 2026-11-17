/**
 * Attendee-facing surfaces that the browser calls but the port had not grown:
 * the public ticket lookup, the join details behind a confirmed registration,
 * the admin private-access editor, the waitlist commands and coupon sync.
 *
 * Ports of:
 *   GET  /api/tickets/lookup                                    (registrations.pb.js)
 *   GET  /api/app/events/{id}/join-details                      (event-private-details.pb.js)
 *   GET  /api/app/events/{id}/private-details                   (event-private-details.pb.js)
 *   PUT  /api/app/events/{id}/private-details                   (event-private-details.pb.js)
 *   GET  /api/app/events/{id}/waitlist                          (attendee-lifecycle.pb.js)
 *   POST /api/app/events/{id}/waitlist/join                     (attendee-lifecycle.pb.js)
 *   POST /api/app/events/{id}/waitlist/leave                    (attendee-lifecycle.pb.js)
 *   PUT  /api/app/events/{id}/coupons                           (coupon-sync.pb.js)
 *
 * Every one of these is an authorization surface, so the rules are ported with
 * the same strictness as the hooks: a ticket lookup is public only for a real
 * `ticket_id`, the payment-recovery id is owner/admin only, join details need a
 * *confirmed* registration, and private access needs `events.edit`.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { getEventAttendanceMode } from "@/lib/event-presentation";
import { evaluateAudienceEligibility } from "@/lib/event-audience";
import { normalizeEventRequirements } from "@/lib/event-requirements";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { finalFeePaise, jsonObject } from "./helpers";
import {
	activeOffers,
	activeRegistrations,
	activeWaitlistEntry,
	reconcileEventWaitlist,
	registrationWindowOpen,
	type EventRow,
	type RegistrationRow,
} from "./waitlist";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function clip(value: unknown, max: number): string {
	return String(value ?? "").trim().slice(0, max);
}

/**
 * `EventRow` in `waitlist.ts` only carries the columns the waitlist rules read.
 * These surfaces also need the public presentation columns, so the query result
 * is typed with the extra fields rather than widening the shared interface.
 */
type EventWithPresentation = EventRow & {
	check_in_enabled: number | null;
	requirements: string | null;
	attendee_note: string | null;
	external_link: string | null;
	contact_email: string | null;
	contact_phone: string | null;
};

async function loadEvent(eventId: string): Promise<EventWithPresentation> {
	const found = await query<EventWithPresentation>("SELECT * FROM events WHERE id = ?", [eventId]);
	const event = found.rows[0];
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	return event;
}

// ---------------------------------------------------------------------------
// GET /api/tickets/lookup
// ---------------------------------------------------------------------------

export interface TicketLookup {
	found: boolean;
	ticket?: {
		id: string;
		paymentStatus: string;
		registrationStatus: string;
		createdAt: string;
	};
	event?: Record<string, unknown> | null;
	registrationId?: string;
	registration?: Record<string, unknown>;
	isOwner?: boolean;
}

/**
 * Resolve a ticket id for the ticket page.
 *
 * `ticket_id` is a public capability: whoever holds the printed/emailed id may
 * see the ticket and its event. The temporary `payment_ticket_id` used during
 * checkout is **not** public — it is only resolved for its owner or an admin,
 * because it is the handle the payment page uses before a ticket exists.
 */
export async function lookupTicketForClient(
	ticketId: string,
	actor: Actor | null,
): Promise<TicketLookup> {
	const id = clip(ticketId, 120);
	if (!id) fail(400, "TICKET_REQUIRED", "ticketId query parameter is required");

	const byTicket = await query<RegistrationRow>(
		"SELECT * FROM registrations WHERE ticket_id = ? LIMIT 1",
		[id],
	);
	let registration = byTicket.rows[0];

	if (!registration && actor) {
		const byPayment = await query<RegistrationRow>(
			"SELECT * FROM registrations WHERE payment_ticket_id = ? LIMIT 1",
			[id],
		);
		const candidate = byPayment.rows[0];
		if (candidate && (actor.role === "admin" || candidate.user_id === actor.id)) {
			registration = candidate;
		}
	}

	if (!registration) return { found: false };

	const event = registration.event_id
		? await query<EventWithPresentation>("SELECT * FROM events WHERE id = ?", [registration.event_id])
		: { rows: [] as EventWithPresentation[] };
	const row = event.rows[0];

	const payload: TicketLookup = {
		found: true,
		ticket: {
			id: registration.ticket_id || id,
			paymentStatus: registration.payment_status ?? "",
			registrationStatus: registration.registration_status ?? "",
			createdAt: registration.created_at ?? registration.registration_date ?? "",
		},
		event: row
			? {
					id: row.id,
					title: row.title ?? "",
					slug: row.slug ?? "",
					status: row.status ?? "",
					isArchived: row.is_deleted === 1,
					date: row.date ?? "",
					endDate: row.end_date ?? "",
					timeTbc: row.time_tbc === 1,
					checkInEnabled: row.check_in_enabled === 1,
					venue: row.venue ?? "",
					bannerUrl: row.banner ? `/files/events/${row.id}/${row.banner}` : "",
					requirements: normalizeEventRequirements(row.requirements),
					attendeeNote: String(row.attendee_note ?? "").trim(),
					externalLink: row.external_link ?? "",
				}
			: null,
		isOwner: Boolean(actor && registration.user_id === actor.id),
	};

	// Identity is projected only for the owner or an admin, exactly as the hook did.
	if (actor && (actor.role === "admin" || registration.user_id === actor.id)) {
		payload.registrationId = registration.id;
		payload.registration = {
			id: registration.id,
			userName: registration.user_name ?? "",
			userEmail: registration.user_email ?? "",
			userPhone: registration.user_phone ?? "",
			registrationStatus: registration.registration_status ?? "",
			paymentStatus: registration.payment_status ?? "",
			registrationDate: registration.registration_date ?? registration.created_at ?? "",
			amount: finalFeePaise(registration) / 100,
		};
	}

	return payload;
}

// ---------------------------------------------------------------------------
// Private access (join details)
// ---------------------------------------------------------------------------

interface PrivateDetailsRow {
	event_id: string;
	virtual_join_url: string | null;
	join_instructions: string | null;
	whatsapp_group_url: string | null;
}

async function findPrivateDetails(eventId: string): Promise<PrivateDetailsRow | undefined> {
	const result = await query<PrivateDetailsRow>(
		"SELECT * FROM event_private_details WHERE event_id = ? LIMIT 1",
		[eventId],
	);
	return result.rows[0];
}

function detailsPayload(row: PrivateDetailsRow | undefined) {
	return {
		whatsappGroupUrl: row?.whatsapp_group_url ?? "",
		virtualJoinUrl: row?.virtual_join_url ?? "",
		joinInstructions: row?.join_instructions ?? "",
	};
}

function privateSummary(row: PrivateDetailsRow | undefined) {
	return {
		hasWhatsappGroup: Boolean(row?.whatsapp_group_url),
		hasJoinUrl: Boolean(row?.virtual_join_url),
		hasJoinInstructions: Boolean(row?.join_instructions),
	};
}

/** `http(s)` only — a `javascript:` join link would be an XSS vector. */
function safeHttpUrl(value: unknown): string {
	const text = clip(value, 2000);
	if (!text) return "";
	if (!/^https?:\/\//i.test(text)) {
		fail(400, "INVALID_PRIVATE_URL", "Private attendee URLs must use http or https");
	}
	return text;
}

async function requireEventCapability(
	actor: Actor,
	capability: "events.edit",
	event: EventRow,
): Promise<void> {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, capability, { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot edit private attendee access for this event");
	}
}

export async function getPrivateDetails(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);
	return detailsPayload(await findPrivateDetails(eventId));
}

export async function savePrivateDetails(
	actor: Actor,
	eventId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);

	const whatsappGroupUrl = safeHttpUrl(input.whatsappGroupUrl);
	const virtualJoinUrl = safeHttpUrl(input.virtualJoinUrl);
	const joinInstructions = clip(input.joinInstructions, 4000);

	// An onsite event has no online access to hand out; storing one would leak a
	// link that the join-details route then hides, which is worse than refusing.
	if (getEventAttendanceMode(event) === "onsite" && (virtualJoinUrl || joinInstructions)) {
		fail(
			409,
			"ONSITE_EVENT",
			"Private online access can only be stored for online or hybrid events",
		);
	}

	await withTransaction(async () => {
		const existing = await findPrivateDetails(eventId);
		const before = privateSummary(existing);
		const now = new Date().toISOString();
		if (existing) {
			await query(
				`UPDATE event_private_details
				    SET whatsapp_group_url = ?, virtual_join_url = ?, join_instructions = ?, updated_at = ?
				  WHERE event_id = ?`,
				[whatsappGroupUrl, virtualJoinUrl, joinInstructions, now, eventId],
			);
		} else {
			await query(
				`INSERT INTO event_private_details
				   (id, event_id, whatsapp_group_url, virtual_join_url, join_instructions, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[crypto.randomUUID(), eventId, whatsappGroupUrl, virtualJoinUrl, joinInstructions, now, now],
			);
		}
		await audit({
			actorId: actor.id,
			action: "event.private-access.updated",
			eventId,
			entityType: "event_private_details",
			entityId: eventId,
			before,
			after: privateSummary(await findPrivateDetails(eventId)),
		});
	});

	return detailsPayload(await findPrivateDetails(eventId));
}

/**
 * Join details for a confirmed attendee.
 *
 * Requires a **confirmed** registration — a pending or cancelled one must not
 * receive the meeting link. Onsite events return the contact fields but no
 * online access, matching the hook.
 */
export async function getJoinDetails(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);

	const confirmed = await query<{ id: string }>(
		`SELECT id FROM registrations
		  WHERE user_id = ? AND event_id = ? AND registration_status = 'confirmed' LIMIT 1`,
		[actor.id, eventId],
	);
	if (!confirmed.rows[0]) {
		fail(403, "CONFIRMED_REGISTRATION_REQUIRED", "Confirmed registration is required");
	}

	const details = detailsPayload(await findPrivateDetails(eventId));
	const mode = getEventAttendanceMode(event);
	return {
		...details,
		virtualJoinUrl: mode === "onsite" ? "" : details.virtualJoinUrl,
		joinInstructions: mode === "onsite" ? "" : details.joinInstructions,
		contactEmail: event.contact_email ?? "",
		contactPhone: event.contact_phone ?? "",
	};
}

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

async function waitlistSnapshot(event: EventRow, userId: string, nowMs: number) {
	const entry = await activeWaitlistEntry(event.id, userId);
	if (!entry) return null;

	let status = entry.status;
	let position = 0;
	if (status === "waiting") {
		const waiting = await query<{ id: string }>(
			`SELECT id FROM event_waitlist WHERE event_id = ? AND status = 'waiting'
			  ORDER BY joined_at ASC, id ASC`,
			[event.id],
		);
		position = waiting.rows.findIndex((row) => row.id === entry.id) + 1;
	}
	if (status === "offered" && Date.parse(entry.offer_expires_at ?? "") <= nowMs) status = "expired";

	return {
		id: entry.id,
		status,
		position,
		joinedAt: entry.joined_at,
		offeredAt: entry.offered_at ?? "",
		offerExpiresAt: entry.offer_expires_at ?? "",
	};
}

export async function getWaitlistState(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	const nowMs = Date.now();
	const capacity = Number(event.max_capacity ?? 0);
	const active = await activeRegistrations(eventId);
	const reserved = await activeOffers(eventId, nowMs);
	return {
		enabled: event.waitlist_enabled === 1 && capacity > 0,
		registrationOpen: registrationWindowOpen(event, nowMs),
		full: capacity > 0 && active.length + reserved.length >= capacity,
		capacity,
		occupied: active.length + reserved.length,
		state: await waitlistSnapshot(event, actor.id, nowMs),
	};
}

export async function joinWaitlist(actor: Actor, eventId: string, input: Record<string, unknown>) {
	let failure: { status: number; code: string; error: string } | null = null;
	let response: { joined: boolean; reused: boolean; state: unknown } | null = null;

	await withTransaction(async () => {
		await loadEvent(eventId); // 404 before any state change
		const nowMs = Date.now();
		const nowIso = new Date(nowMs).toISOString();
		await reconcileEventWaitlist(eventId, nowIso);
		const live = await loadEvent(eventId);

		if (live.waitlist_enabled !== 1 || Number(live.max_capacity ?? 0) <= 0) {
			failure = { status: 409, code: "WAITLIST_DISABLED", error: "This event does not use a waitlist" };
			return;
		}
		if (!registrationWindowOpen(live, nowMs)) {
			failure = { status: 409, code: "REGISTRATION_CLOSED", error: "Registration is not currently open" };
			return;
		}

		const registered = await query<{ id: string }>(
			`SELECT id FROM registrations
			  WHERE event_id = ? AND user_id = ? AND registration_status != 'cancelled' LIMIT 1`,
			[eventId, actor.id],
		);
		if (registered.rows[0]) {
			failure = {
				status: 409,
				code: "ALREADY_REGISTERED",
				error: "You already have an active registration for this event",
			};
			return;
		}

		const existing = await activeWaitlistEntry(eventId, actor.id);
		if (existing) {
			response = { joined: false, reused: true, state: await waitlistSnapshot(live, actor.id, nowMs) };
			return;
		}

		const eligibility = evaluateAudienceEligibility(
			{
				eligibleSemesters: live.eligible_semesters ? jsonObject(live.eligible_semesters) : null,
				eligibleProgrammes: live.eligible_programmes ? jsonObject(live.eligible_programmes) : null,
			} as never,
			{
				semester: clip(input.semester, 8),
				programmeCode: clip(input.programmeCode, 40),
			},
		);
		if (!eligibility.eligible) {
			failure = { status: 400, code: "NOT_ELIGIBLE", error: "You are not eligible for this event" };
			return;
		}

		const active = await activeRegistrations(eventId);
		const reserved = await activeOffers(eventId, nowMs);
		if (active.length + reserved.length < Number(live.max_capacity ?? 0)) {
			failure = {
				status: 409,
				code: "REGISTRATION_AVAILABLE",
				error: "A registration place is available; register directly instead",
			};
			return;
		}

		const id = crypto.randomUUID();
		await query(
			`INSERT INTO event_waitlist
			   (id, event_id, user_id, status, active_key, joined_at, programme_code, semester, created_at, updated_at)
			 VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?)`,
			[
				id,
				eventId,
				actor.id,
				`${eventId}:${actor.id}`,
				nowIso,
				clip(input.programmeCode, 40) || null,
				clip(input.semester, 8) || null,
				nowIso,
				nowIso,
			],
		);
		await audit({
			actorId: actor.id,
			action: "waitlist.joined",
			eventId,
			entityType: "waitlist",
			entityId: id,
		});
		response = { joined: true, reused: false, state: await waitlistSnapshot(live, actor.id, nowMs) };
	});

	// TypeScript cannot see the assignment made inside the transaction closure.
	const refused = failure as { status: number; code: string; error: string } | null;
	if (refused) fail(refused.status, refused.code, refused.error);
	return response ?? { joined: false, reused: false, state: null };
}

export async function leaveWaitlist(actor: Actor, eventId: string) {
	await loadEvent(eventId); // 404 before anything else, as the hook did
	let left = false;

	await withTransaction(async () => {
		const nowIso = new Date().toISOString();
		await reconcileEventWaitlist(eventId, nowIso);
		const row = await activeWaitlistEntry(eventId, actor.id);
		if (!row) return;

		await query(
			`UPDATE event_waitlist SET status = 'cancelled', active_key = NULL, updated_at = ? WHERE id = ?`,
			[nowIso, row.id],
		);
		await reconcileEventWaitlist(eventId, nowIso);
		await audit({
			actorId: actor.id,
			action: "waitlist.left",
			eventId,
			entityType: "waitlist",
			entityId: row.id,
		});
		left = true;
	});

	return { left, alreadyLeft: !left };
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

interface IncomingCoupon {
	id?: unknown;
	code?: unknown;
	discountPercent?: unknown;
	maxUses?: unknown;
	expiresAt?: unknown;
	isActive?: unknown;
}

/**
 * Replace an event's coupon set.
 *
 * Port of `coupon-sync.pb.js`: the body is the whole desired set, matched by id
 * then by code, and a coupon with recorded uses is refused deletion (deactivate
 * it instead) so the redemption history stays coherent.
 */
export async function syncEventCoupons(
	actor: Actor,
	eventId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	await requireEventCapability(actor, "events.edit", event);
	if (!event.society_id) fail(400, "EVENT_WITHOUT_SOCIETY", "Event has no society");

	const incoming = Array.isArray(input.coupons) ? (input.coupons as IncomingCoupon[]) : [];

	// Validate before opening the transaction so a bad payload writes nothing.
	const normalized: Array<{
		id: string;
		code: string;
		discountPercent: number;
		maxUses: number;
		expiresAt: string;
		isActive: boolean;
	}> = [];
	const seen = new Set<string>();
	for (const raw of incoming) {
		const code = clip(raw?.code, 40).toUpperCase();
		if (!code) fail(400, "COUPON_CODE_REQUIRED", "Coupon code is required");
		if (seen.has(code)) fail(400, "DUPLICATE_COUPON", `Duplicate coupon code: ${code}`);
		seen.add(code);
		const discountPercent = Math.floor(Number(raw?.discountPercent) || 0);
		const maxUses = Math.floor(Number(raw?.maxUses) || 0);
		if (discountPercent < 0 || discountPercent > 100) {
			fail(400, "INVALID_DISCOUNT", "Coupon discount must be between 0 and 100");
		}
		if (maxUses < 0) fail(400, "INVALID_MAX_USES", "Coupon max uses cannot be negative");
		normalized.push({
			id: clip(raw?.id, 80),
			code,
			discountPercent,
			maxUses,
			expiresAt: clip(raw?.expiresAt, 40),
			isActive: raw?.isActive !== false,
		});
	}

	let created = 0;
	let updated = 0;
	let deleted = 0;

	await withTransaction(async () => {
		const existing = await query<{
			id: string;
			code: string;
			used_count: number;
		}>("SELECT id, code, used_count FROM coupons WHERE event_id = ?", [eventId]);
		const byId = new Map(existing.rows.map((row) => [row.id, row]));
		const byCode = new Map(existing.rows.map((row) => [row.code, row]));
		const retained = new Set<string>();
		const now = new Date().toISOString();

		for (const item of normalized) {
			const match = (item.id && byId.get(item.id)) || byCode.get(item.code);
			if (match) {
				retained.add(match.id);
				await query(
					`UPDATE coupons
					    SET code = ?, discount_percent = ?, max_uses = ?, expires_at = ?,
					        is_active = ?, society_id = ?, updated_at = ?
					  WHERE id = ?`,
					[
						item.code,
						item.discountPercent,
						item.maxUses,
						item.expiresAt || null,
						item.isActive ? 1 : 0,
						event.society_id,
						now,
						match.id,
					],
				);
				updated += 1;
			} else {
				await query(
					`INSERT INTO coupons
					   (id, event_id, society_id, code, discount_percent, max_uses, used_count,
					    expires_at, is_active, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
					[
						crypto.randomUUID(),
						eventId,
						event.society_id,
						item.code,
						item.discountPercent,
						item.maxUses,
						item.expiresAt || null,
						item.isActive ? 1 : 0,
						now,
						now,
					],
				);
				created += 1;
			}
		}

		for (const row of existing.rows) {
			if (retained.has(row.id)) continue;
			if (Number(row.used_count) > 0) {
				fail(
					409,
					"COUPON_IN_USE",
					`Used coupon '${row.code}' cannot be deleted; deactivate it instead`,
				);
			}
			await query("DELETE FROM coupons WHERE id = ?", [row.id]);
			deleted += 1;
		}

		await audit({
			actorId: actor.id,
			action: "event.coupons.synced",
			eventId,
			entityType: "event",
			entityId: eventId,
			after: { created, updated, deleted },
		});
	});

	return { success: true, created, updated, deleted };
}

// ---------------------------------------------------------------------------
// Admin notification panel
// ---------------------------------------------------------------------------

/**
 * May this actor see/resend a registration's notifications?
 *
 * Port of `notification-helpers.js#canManageRegistration`: branch admin, or the
 * `registrations.manage` capability for the event the registration belongs to.
 */
export async function canManageRegistration(actor: Actor, registrationId: string) {
	const found = await query<RegistrationRow>("SELECT * FROM registrations WHERE id = ?", [
		registrationId,
	]);
	const registration = found.rows[0];
	if (!registration) fail(404, "REGISTRATION_NOT_FOUND", "Registration not found");

	const event = await loadEvent(registration.event_id);
	const assignments = await loadAssignments(actor.id);
	const allowed =
		actor.role === "admin" ||
		hasEventCapability(
			actor,
			"registrations.manage",
			{ id: event.id, societyId: event.society_id },
			assignments,
		);
	if (!allowed) fail(403, "FORBIDDEN", "Forbidden");
	return { registration, event };
}
