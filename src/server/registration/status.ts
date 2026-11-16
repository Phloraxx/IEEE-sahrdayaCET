/**
 * Registration status reads — ports of:
 *   GET /api/app/events/{id}/my-registration   (registration-status.pb.js)
 *   GET /api/app/registration-memory           (registration-status.pb.js)
 *   GET /api/app/my-events                     (my-events.pb.js + helpers)
 *
 * Every query is scoped by `user_id = ?` in SQL. A registration id is never a
 * capability, and the user id always comes from the session — never from the
 * request — so these endpoints are IDOR-proof by construction.
 */

import { query } from "@/lib/db.server";
import { getEventEndTimestamp } from "@/lib/event-lifecycle";
import { amountRupees, finalFeePaise, jsonObject } from "./helpers";
import {
	activeWaitlistEntry,
	cancellationPolicy,
	lifecycleOf,
	type EventRow,
	type RegistrationRow,
} from "./waitlist";

// ---------------------------------------------------------------------------
// my-registration
// ---------------------------------------------------------------------------

export interface MyRegistrationResponse {
	found: boolean;
	eventEnded: boolean;
	registrationId?: string;
	registrationStatus?: string;
	paymentStatus?: string;
	amount?: number;
	paymentRequired?: boolean;
	ticketId?: string;
	manualReview?: boolean;
	reviewReason?: string;
	receiptAvailable?: boolean;
	ticketEmailStatus?: string;
	receiptEmailStatus?: string;
}

/** The user's registration for one event, newest first, with replay semantics. */
export async function getMyRegistration(
	eventId: string,
	userId: string,
): Promise<MyRegistrationResponse | null> {
	const eventFound = await query<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
	const event = eventFound.rows[0];
	if (!event) return null;

	const result = await query<RegistrationRow>(
		`SELECT * FROM registrations WHERE user_id = ? AND event_id = ?
		  ORDER BY coalesce(registration_date, created_at) DESC`,
		[userId, eventId],
	);

	// Pick the first non-cancelled row; failing that, a cancelled row whose
	// payment is under review (money is real even though the seat was released).
	let selected: RegistrationRow | undefined;
	let manualReview = false;
	for (const row of result.rows) {
		if (row.registration_status !== "cancelled") {
			selected = row;
			break;
		}
		if (jsonObject(row.payment_data).manualReview === true) {
			selected = row;
			manualReview = true;
			break;
		}
	}

	const end = getEventEndTimestamp(lifecycleOf(event));
	const eventEnded = end !== null && end <= Date.now();

	if (!selected) return { found: false, eventEnded };

	const paymentData = jsonObject(selected.payment_data);
	manualReview = manualReview || paymentData.manualReview === true;
	const amount = amountRupees(selected);
	const status = selected.registration_status ?? "";
	const paymentStatus = selected.payment_status ?? "";

	return {
		found: true,
		eventEnded,
		registrationId: selected.id,
		registrationStatus: status,
		paymentStatus,
		amount,
		paymentRequired: status === "pending" && paymentStatus === "pending" && amount > 0,
		ticketId: selected.ticket_id ?? "",
		manualReview,
		reviewReason: String(paymentData.reviewReason ?? ""),
		receiptAvailable:
			(paymentStatus === "paid" || paymentStatus === "refunded") &&
			amount > 0 &&
			!!selected.ticket_id,
		ticketEmailStatus: "",
		receiptEmailStatus: "",
	};
}

// ---------------------------------------------------------------------------
// registration-memory
// ---------------------------------------------------------------------------

export interface RegistrationMemory {
	found: boolean;
	profile: {
		name: string;
		phone: string;
		college: string;
		branch: string;
		semester: string;
		isIeeeMember: boolean;
		ieeeMembershipId: string;
	};
}

/**
 * Reuse the attendee details from the user's most recent registration.
 *
 * Event-specific custom answers are deliberately not returned — only the
 * reusable profile fields.
 */
export async function getRegistrationMemory(userId: string): Promise<RegistrationMemory> {
	const result = await query<RegistrationRow>(
		`SELECT * FROM registrations WHERE user_id = ?
		  ORDER BY coalesce(registration_date, created_at) DESC LIMIT 1`,
		[userId],
	);
	const latest = result.rows[0];
	if (!latest) {
		return {
			found: false,
			profile: {
				name: "",
				phone: "",
				college: "",
				branch: "",
				semester: "",
				isIeeeMember: false,
				ieeeMembershipId: "",
			},
		};
	}

	const responses = jsonObject(latest.form_responses);
	return {
		found: true,
		profile: {
			name: String(responses.name ?? latest.user_name ?? ""),
			phone: String(responses.phone ?? latest.user_phone ?? ""),
			college: String(responses.college ?? ""),
			branch: String(responses.branch ?? ""),
			semester: String(responses.semester ?? ""),
			isIeeeMember: responses.isIeeeMember === true,
			ieeeMembershipId: String(responses.ieeeMembershipId ?? ""),
		},
	};
}

// ---------------------------------------------------------------------------
// my-events
// ---------------------------------------------------------------------------

interface SocietyRow {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
}

export interface MyEventItem {
	event: {
		id: string;
		title: string;
		slug: string;
		date: string;
		endDate: string;
		timeTbc: boolean;
		venue: string;
		timezone: string;
		attendanceMode: string;
		locationAddress: string;
		bannerUrl: string;
		status: string;
		isArchived: boolean;
		society: { id: string; name: string; slug: string; logoUrl: string } | null;
	};
	registration: {
		id: string;
		status: string;
		paymentStatus: string;
		amount: number;
		paymentRequired: boolean;
		manualReview: boolean;
		reviewReason: string;
		ticketId: string;
		receiptAvailable: boolean;
		registeredAt: string;
	};
	ended: boolean;
	cancellation: { allowed: boolean; mode: string; deadline: string };
}

export interface MyEventsResponse {
	items: MyEventItem[];
	waitlist: Array<{
		event: {
			id: string;
			title: string;
			slug: string;
			date: string;
			venue: string;
			status: string;
			isArchived: boolean;
		};
		entry: { id: string; status: string; position: number; joinedAt: string; offerExpiresAt: string };
	}>;
	summary: {
		total: number;
		actionNeeded: number;
		upcoming: number;
		past: number;
		waitlisted: number;
		offered: number;
	};
}

function bannerUrl(eventId: string, banner: string | null): string {
	return banner ? `/files/events/${eventId}/${banner}` : "";
}

function societyLogoUrl(societyId: string, logo: string | null): string {
	return logo ? `/files/societies/${societyId}/${logo}` : "";
}

/** Every registration the user holds, with its event, plus their waitlist. */
export async function listMyEvents(userId: string): Promise<MyEventsResponse> {
	const rows = await query<RegistrationRow & { event_row: string }>(
		`SELECT r.*, r.event_id AS event_row
		   FROM registrations r
		  WHERE r.user_id = ?
		  ORDER BY coalesce(r.registration_date, r.created_at) DESC`,
		[userId],
	);

	const eventIds = [...new Set(rows.rows.map((row) => row.event_id))];
	const events = new Map<string, EventRow>();
	const societies = new Map<string, SocietyRow>();

	if (eventIds.length) {
		const placeholders = eventIds.map(() => "?").join(",");
		const eventRows = await query<EventRow & { society_id: string | null }>(
			`SELECT * FROM events WHERE id IN (${placeholders})`,
			eventIds,
		);
		for (const row of eventRows.rows) events.set(row.id, row);

		const societyIds = [
			...new Set(
				eventRows.rows
					.map((row) => row.society_id)
					.filter((id): id is string => typeof id === "string" && id.length > 0),
			),
		];
		if (societyIds.length) {
			const societyPlaceholders = societyIds.map(() => "?").join(",");
			const societyRows = await query<SocietyRow>(
				`SELECT id, name, slug, logo FROM societies WHERE id IN (${societyPlaceholders})`,
				societyIds,
			);
			for (const row of societyRows.rows) societies.set(row.id, row);
		}
	}

	const nowMs = Date.now();
	const items: MyEventItem[] = [];

	for (const registration of rows.rows) {
		const event = events.get(registration.event_id);
		if (!event) continue;

		const lifecycle = lifecycleOf(event);
		const end = getEventEndTimestamp(lifecycle);
		const ended = end !== null && end <= nowMs;
		const status = registration.registration_status ?? "";
		const paymentStatus = registration.payment_status ?? "";
		const amount = amountRupees(registration);
		const paymentData = jsonObject(registration.payment_data);
		const ticketId = registration.ticket_id ?? "";
		const society = event.society_id ? societies.get(event.society_id) : undefined;
		const policy = await cancellationPolicy(event, registration, nowMs);

		items.push({
			event: {
				id: event.id,
				title: event.title || "Event",
				slug: event.slug || "",
				date: event.date || "",
				endDate: event.end_date || "",
				timeTbc: event.time_tbc === 1,
				venue: event.venue || "",
				timezone: event.timezone || "Asia/Kolkata",
				attendanceMode: event.attendance_mode || "onsite",
				locationAddress: event.location_address || "",
				bannerUrl: bannerUrl(event.id, event.banner),
				status: event.status || "draft",
				isArchived: event.is_deleted === 1,
				society: society
					? {
							id: society.id,
							name: society.name,
							slug: society.slug,
							logoUrl: societyLogoUrl(society.id, society.logo),
						}
					: null,
			},
			registration: {
				id: registration.id,
				status,
				paymentStatus,
				amount,
				paymentRequired: status === "pending" && paymentStatus === "pending" && amount > 0,
				manualReview: paymentData.manualReview === true,
				reviewReason: String(paymentData.reviewReason ?? ""),
				ticketId,
				receiptAvailable:
					(paymentStatus === "paid" || paymentStatus === "refunded") && amount > 0 && !!ticketId,
				registeredAt: registration.registration_date ?? registration.created_at ?? "",
			},
			ended,
			cancellation: {
				allowed: policy.allowed,
				mode: policy.mode,
				deadline: policy.deadline,
			},
		});
	}

	// Waitlist entries, scoped to this user.
	const waitRows = await query<{
		id: string;
		event_id: string;
		status: string;
		joined_at: string;
		offer_expires_at: string | null;
	}>(`SELECT id, event_id, status, joined_at, offer_expires_at
	      FROM event_waitlist
	     WHERE user_id = ? AND status IN ('waiting', 'offered')
	     ORDER BY joined_at DESC LIMIT 100`, [userId]);

	const waitlist: MyEventsResponse["waitlist"] = [];
	for (const row of waitRows.rows) {
		const event = events.get(row.event_id) ?? (await query<EventRow>("SELECT * FROM events WHERE id = ?", [row.event_id])).rows[0];
		if (!event) continue;
		const entry = await activeWaitlistEntry(row.event_id, userId);
		if (!entry) continue;
		let position = 0;
		if (entry.status === "waiting") {
			const waiting = await query<{ id: string }>(
				`SELECT id FROM event_waitlist WHERE event_id = ? AND status = 'waiting'
				  ORDER BY joined_at ASC, id ASC`,
				[row.event_id],
			);
			position = waiting.rows.findIndex((item) => item.id === entry.id) + 1;
		}
		waitlist.push({
			event: {
				id: event.id,
				title: event.title || "Event",
				slug: event.slug || "",
				date: event.date || "",
				venue: event.venue || "",
				status: event.status || "draft",
				isArchived: event.is_deleted === 1,
			},
			entry: {
				id: entry.id,
				status: entry.status,
				position,
				joinedAt: entry.joined_at,
				offerExpiresAt: entry.offer_expires_at ?? "",
			},
		});
	}

	let actionNeeded = 0;
	let upcoming = 0;
	let past = 0;
	for (const item of items) {
		const financialException =
			item.registration.status === "cancelled" && item.registration.paymentStatus === "paid";
		const needsAction =
			item.registration.paymentRequired || item.registration.manualReview || financialException;
		if (needsAction) actionNeeded += 1;
		else if (
			item.ended ||
			item.event.isArchived ||
			item.event.status === "completed" ||
			item.event.status === "cancelled" ||
			item.registration.status === "cancelled"
		) {
			past += 1;
		} else {
			upcoming += 1;
		}
	}

	return {
		items,
		waitlist,
		summary: {
			total: items.length,
			actionNeeded,
			upcoming,
			past,
			waitlisted: waitlist.length,
			offered: waitlist.filter((row) => row.entry.status === "offered").length,
		},
	};
}

export { finalFeePaise };
