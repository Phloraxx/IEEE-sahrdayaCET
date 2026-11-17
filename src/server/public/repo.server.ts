/**
 * Public read queries against SQLite.
 *
 * Replaces the PocketBase `createPublicPB()` calls. Every query here encodes a
 * PocketBase *rule* as a WHERE clause — that is the point of the port: the rule
 * that used to live in the collection config now lives next to the query, and
 * there is no second path to the data.
 *
 * Rules translated here:
 *   events      `(status="published" || status="completed") && isDeleted != true`
 *   societies   `isHidden = false`
 *   blogs       `published = true`
 *   execom      public by default; contact fields are projected out per query
 *   tickets     a ticket is public only if its registration and event agree
 *
 * These functions return snake_case rows. The callers keep their existing
 * mappers and domain rules (lifecycle, pricing, eligibility) untouched.
 */

import { query } from "@/lib/db.server";
import { ttlMemo } from "./cache.server";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Columns the public event surfaces read. */
const EVENT_COLUMNS = `
	e.id, e.title, e.slug, e.description, e.date, e.end_date, e.time_tbc,
	e.venue, e.timezone, e.attendance_mode, e.location_address, e.price,
	e.banner, e.status, e.registration_open, e.registration_mode,
	e.registration_start, e.registration_deadline, e.max_capacity,
	e.registered_count, e.waitlist_enabled, e.waitlist_reserved_count,
	e.external_form_url, e.external_link, e.collect_ieee_member,
	e.ieee_member_discount_percent, e.eligible_semesters, e.eligible_programmes,
	e.requirements, e.attendee_note, e.tags, e.contact_email, e.contact_phone,
	e.is_deleted, e.check_in_enabled, e.form_template, e.created_at, e.updated_at,
	e.society_id
`;

const SOCIETY_COLUMNS = `
	s.id AS society_row_id, s.name AS society_name,
	s.slug AS society_slug, s.logo AS society_logo
`;

export interface EventRow {
	id: string;
	title: string;
	slug: string;
	description: string | null;
	date: string;
	end_date: string | null;
	time_tbc: number;
	venue: string | null;
	timezone: string | null;
	attendance_mode: string | null;
	location_address: string | null;
	price: number | null;
	banner: string | null;
	status: string | null;
	registration_open: number;
	registration_mode: string | null;
	registration_start: string | null;
	registration_deadline: string | null;
	max_capacity: number | null;
	registered_count: number;
	waitlist_enabled: number;
	waitlist_reserved_count: number;
	external_form_url: string | null;
	external_link: string | null;
	collect_ieee_member: number;
	ieee_member_discount_percent: number;
	eligible_semesters: string | null;
	eligible_programmes: string | null;
	requirements: string | null;
	attendee_note: string | null;
	tags: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	is_deleted: number;
	check_in_enabled: number;
	form_template: string | null;
	created_at: string;
	updated_at: string;
	society_id: string | null;
	society_row_id: string | null;
	society_name: string | null;
	society_slug: string | null;
	society_logo: string | null;
}

/**
 * Publicly visible events, oldest first (matches the PocketBase `sort: "date"`).
 *
 * Memoised for `PUBLIC_DATA_TTL_MS`: this is the whole events list and it is
 * re-read on every `/events` and home render.
 */
export const listPublicEvents = ttlMemo(async function listPublicEvents(): Promise<EventRow[]> {
	const result = await query<EventRow>(
		`SELECT ${EVENT_COLUMNS}, ${SOCIETY_COLUMNS}
		   FROM events e
		   LEFT JOIN societies s ON s.id = e.society_id
		  WHERE e.is_deleted = 0 AND e.status IN ('published', 'completed')
		  ORDER BY e.date ASC`,
	);
	return result.rows;
});

/** One public event by slug, or undefined. */
export async function getPublicEventBySlug(slug: string): Promise<EventRow | undefined> {
	const result = await query<EventRow>(
		`SELECT ${EVENT_COLUMNS}, ${SOCIETY_COLUMNS}
		   FROM events e
		   LEFT JOIN societies s ON s.id = e.society_id
		  WHERE e.slug = ? AND e.is_deleted = 0 AND e.status IN ('published', 'completed')
		  LIMIT 1`,
		[slug],
	);
	return result.rows[0];
}

/** One event by id, regardless of status — the caller applies the visibility rule. */
export async function getEventById(id: string): Promise<EventRow | undefined> {
	const result = await query<EventRow>(
		`SELECT ${EVENT_COLUMNS}, ${SOCIETY_COLUMNS}
		   FROM events e
		   LEFT JOIN societies s ON s.id = e.society_id
		  WHERE e.id = ?
		  LIMIT 1`,
		[id],
	);
	return result.rows[0];
}

/** Published events for one society, newest first. */
export async function listPublicEventsForSociety(societyId: string): Promise<EventRow[]> {
	const result = await query<EventRow>(
		`SELECT ${EVENT_COLUMNS}, ${SOCIETY_COLUMNS}
		   FROM events e
		   LEFT JOIN societies s ON s.id = e.society_id
		  WHERE e.society_id = ?
		    AND e.is_deleted = 0
		    AND e.status IN ('published', 'completed')
		  ORDER BY e.date DESC`,
		[societyId],
	);
	return result.rows;
}

/** Upcoming published events for the home page, soonest first. */
/** Upcoming published events, memoised. Keyed on `limit`, which is bounded. */
export const listUpcomingEvents = ttlMemo(async function listUpcomingEvents(
	limit: number,
): Promise<EventRow[]> {
	const result = await query<EventRow>(
		`SELECT ${EVENT_COLUMNS}, ${SOCIETY_COLUMNS}
		   FROM events e
		   LEFT JOIN societies s ON s.id = e.society_id
		  WHERE e.is_deleted = 0 AND e.status = 'published'
		  ORDER BY e.date ASC
		  LIMIT ?`,
		[limit],
	);
	return result.rows;
});

// ---------------------------------------------------------------------------
// Societies
// ---------------------------------------------------------------------------

export interface SocietyRow {
	id: string;
	name: string;
	slug: string;
	bio: string | null;
	logo: string | null;
	banner: string | null;
	default_whatsapp_link: string | null;
	created_at: string;
	updated_at: string;
}

/** Visible societies, memoised. No arguments, so a single cache entry. */
export const listPublicSocieties = ttlMemo(async function listPublicSocieties(): Promise<
	SocietyRow[]
> {
	const result = await query<SocietyRow>(
		`SELECT id, name, slug, bio, logo, banner, default_whatsapp_link, created_at, updated_at
		   FROM societies
		  WHERE is_hidden = 0
		  ORDER BY name ASC`,
	);
	return result.rows;
});

export async function getPublicSocietyBySlug(slug: string): Promise<SocietyRow | undefined> {
	const result = await query<SocietyRow>(
		`SELECT id, name, slug, bio, logo, banner, default_whatsapp_link, created_at, updated_at
		   FROM societies
		  WHERE lower(slug) = lower(?) AND is_hidden = 0
		  LIMIT 1`,
		[slug],
	);
	return result.rows[0];
}

/** Chair user ids for a society (the legacy `chair` ownership check). */
export async function listSocietyChairIds(societyId: string): Promise<string[]> {
	const result = await query<{ user_id: string }>(
		"SELECT user_id FROM society_chairs WHERE society_id = ? ORDER BY sort_order",
		[societyId],
	);
	return result.rows.map((row) => row.user_id);
}

// ---------------------------------------------------------------------------
// Execom
// ---------------------------------------------------------------------------

export interface ExecomRow {
	id: string;
	name: string;
	position: string;
	department: string | null;
	batch: string | null;
	section: string | null;
	section_id: string | null;
	photo: string | null;
	linkedin: string | null;
	instagram: string | null;
	portfolio: string | null;
	email: string | null;
	phone: string | null;
	sort_order: number | null;
}

/**
 * The public directory.
 *
 * Contact details are deliberately excluded: the PocketBase hook
 * (`execom.pb.js`) strips them from public responses, and doing it in the SELECT
 * is stronger than doing it in a hook.
 */
/** The whole execom list, memoised. Read by the home page and `/full-execom`. */
export const listExecom = ttlMemo(async function listExecom(): Promise<ExecomRow[]> {
	const result = await query<ExecomRow>(
		`SELECT id, name, position, department, batch, section, section_id,
		        photo, linkedin, instagram, portfolio, sort_order
		   FROM execom
		  ORDER BY sort_order ASC, name ASC`,
	);
	return result.rows;
});

/** Directory members for one society, including contact details (society page). */
export async function listExecomForSociety(societyId: string): Promise<ExecomRow[]> {
	const result = await query<ExecomRow>(
		`SELECT id, name, position, department, batch, section, section_id,
		        photo, linkedin, instagram, portfolio, email, phone, sort_order
		   FROM execom
		  WHERE society_id = ?
		  ORDER BY sort_order ASC, name ASC`,
		[societyId],
	);
	return result.rows;
}

/** Execom headcount, memoised. A `count(*)` per home render is pure waste. */
export const countExecom = ttlMemo(async function countExecom(): Promise<number> {
	const result = await query<{ n: number }>("SELECT count(*) AS n FROM execom");
	return result.rows[0]?.n ?? 0;
});

// ---------------------------------------------------------------------------
// Blogs
// ---------------------------------------------------------------------------

export interface BlogRow {
	id: string;
	title: string;
	slug: string;
	excerpt: string | null;
	content: string | null;
	cover_url: string | null;
	read_minutes: number | null;
	topic_label: string | null;
	published_at: string | null;
	published: number;
	category: string | null;
	society_id: string | null;
	event_id: string | null;
	created_at: string;
	updated_at: string;
	society_row_id: string | null;
	society_name: string | null;
	society_slug: string | null;
	society_logo: string | null;
	event_row_id: string | null;
	event_title: string | null;
	event_slug: string | null;
}

const BLOG_SELECT = `
	b.id, b.title, b.slug, b.excerpt, b.content, b.cover_url, b.read_minutes,
	b.topic_label, b.published_at, b.published, b.category, b.society_id,
	b.event_id, b.created_at, b.updated_at,
	s.id AS society_row_id, s.name AS society_name, s.slug AS society_slug, s.logo AS society_logo,
	e.id AS event_row_id, e.title AS event_title, e.slug AS event_slug
`;

/**
 * The author is deliberately NOT joined.
 *
 * PocketBase's `users` listRule is `id = @request.auth.id || role = "admin"`, so
 * an anonymous request cannot read a user record and `expand: "relation"`
 * returned nothing — which is why staging renders the "IEEE Sahrdaya" byline
 * fallback rather than a person's name. Joining `users` here would expose data
 * the public rules hide. If the byline should show the author, that is a product
 * decision (see open-questions), not something a port should change silently.
 */
const BLOG_FROM = `
	FROM blogs b
	LEFT JOIN societies s ON s.id = b.society_id
	LEFT JOIN events e ON e.id = b.event_id
`;

/** Published blogs, memoised. Keyed on `limit`, which is clamped to 1..6. */
export const listPublishedBlogs = ttlMemo(async function listPublishedBlogs(
	limit?: number,
): Promise<BlogRow[]> {
	const limitClause = typeof limit === "number" ? " LIMIT ?" : "";
	const result = await query<BlogRow>(
		`SELECT ${BLOG_SELECT} ${BLOG_FROM}
		  WHERE b.published = 1
		  ORDER BY b.published_at DESC, b.created_at DESC${limitClause}`,
		typeof limit === "number" ? [limit] : [],
	);
	return result.rows;
});

export async function listPublishedBlogsForSociety(
	societyId: string,
	limit?: number,
): Promise<BlogRow[]> {
	const limitClause = typeof limit === "number" ? " LIMIT ?" : "";
	const params: unknown[] = [societyId];
	if (typeof limit === "number") params.push(limit);
	const result = await query<BlogRow>(
		`SELECT ${BLOG_SELECT} ${BLOG_FROM}
		  WHERE b.published = 1 AND b.society_id = ?
		  ORDER BY b.published_at DESC, b.created_at DESC${limitClause}`,
		params,
	);
	return result.rows;
}

export async function getPublishedBlogBySlug(slug: string): Promise<BlogRow | undefined> {
	const result = await query<BlogRow>(
		`SELECT ${BLOG_SELECT} ${BLOG_FROM}
		  WHERE b.slug = ? AND b.published = 1
		  LIMIT 1`,
		[slug],
	);
	return result.rows[0];
}

// ---------------------------------------------------------------------------
// Tickets (public QR lookup)
// ---------------------------------------------------------------------------

export interface TicketLookupRow {
	registration_id: string;
	registration_status: string | null;
	event_id: string;
	event_status: string | null;
	event_date: string;
	event_end_date: string | null;
	event_time_tbc: number;
	event_check_in_enabled: number;
	event_is_deleted: number;
}

/**
 * Look up a ticket for the public QR endpoint.
 *
 * Mirrors `GET /api/tickets/lookup`: the ticket id is the registration's
 * `ticket_id`, and the caller applies `getTicketCheckInState` to decide whether
 * the QR may be rendered at all.
 */
export async function lookupTicket(ticketId: string): Promise<TicketLookupRow | undefined> {
	const result = await query<TicketLookupRow>(
		`SELECT r.id AS registration_id, r.registration_status,
		        e.id AS event_id, e.status AS event_status, e.date AS event_date,
		        e.end_date AS event_end_date, e.time_tbc AS event_time_tbc,
		        e.check_in_enabled AS event_check_in_enabled, e.is_deleted AS event_is_deleted
		   FROM registrations r
		   JOIN events e ON e.id = r.event_id
		  WHERE r.ticket_id = ?
		  LIMIT 1`,
		[ticketId],
	);
	return result.rows[0];
}
