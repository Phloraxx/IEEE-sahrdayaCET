/**
 * Collection access policy and filter translation.
 *
 * The browser client keeps a PocketBase-shaped surface (`collection("events")
 * .getList({ filter, sort, expand })`), so this module turns that surface into
 * parameterised SQL. Two rules keep it safe:
 *
 *   1. **Allow-list.** A collection that is not listed cannot be read or written
 *      through this endpoint at all.
 *   2. **Fail closed.** The filter translator understands a small grammar and
 *      rejects anything else with a 400. It never passes text through to SQL.
 *
 * Column names are validated against the real table schema, so even a crafted
 * field name cannot reach the query.
 */

import { query } from "@/lib/db.server";
import {
	activeAssignments,
	authRole,
	capabilitiesForRole,
	hasCapability,
	hasEventCapability,
	type Actor,
	type Assignment,
	type Capability,
} from "@/server/authz/capabilities";

export type Access = "public" | "self" | "capability";

export interface CollectionPolicy {
	table: string;
	/** Who may read. */
	read: Access;
	/** Who may write (create/update/delete). */
	write: Access;
	/** Capability required when `read`/`write` is "capability". */
	readCapability?: Capability;
	writeCapability?: Capability;
	/** Extra SQL predicate applied to every read (visibility rules). */
	readPredicate?: string;
	/**
	 * Rows a non-staff caller may see, on top of `readPredicate`.
	 *
	 * Publication state is not an authorization decision the browser can make:
	 * without this, `filter=status='draft'` listed every unpublished event, and
	 * a query without it returned unpublished drafts with their content.
	 *
	 * `capability` is the staff bypass. An actor who holds it only at a narrower
	 * scope sees the public rows plus the rows in that scope, so a society chair
	 * keeps their drafts without seeing another society's.
	 */
	publicRead?: {
		sql: string;
		capability: Capability;
		scope?: { societyColumn?: string; eventColumn?: string };
	};
	/**
	 * Capability that may see everything in `publicOmit`. Without it, those
	 * columns are stripped from the response (for anonymous *and* signed-in
	 * callers, not just anonymous ones).
	 */
	publicOmitBypass?: Capability;
	/**
	 * The columns a reader without the full-visibility capability may see.
	 *
	 * This is the allow-list half of the projection. `publicOmit` lists columns
	 * a reader must not see, which is safe only while the schema does not grow:
	 * a column added later is returned by `SELECT *` until someone remembers to
	 * add it to the omit list. `publicFields` inverts that — a new column is
	 * invisible until it is named here on purpose.
	 *
	 * A collection that omits both is served with no columns at all rather than
	 * its whole row; see `resolveProjection`. The policy invariant test requires
	 * every collection to declare one, so that state is a bug, not a mode.
	 */
	publicFields?: readonly string[];
	/** Columns a client may never write. */
	readonlyColumns?: readonly string[];
	/**
	 * Extra columns only a full-visibility reader may write.
	 *
	 * `readonlyColumns` covers fields that are never client-writable (counters,
	 * the approval trail, decision metadata). This covers fields that the admin
	 * UI legitimately saves but that are a privilege decision rather than data —
	 * for example another actor's attribution on a row. A scoped actor can still
	 * edit everything else. No collection needs one today, so nothing is listed;
	 * it exists so the next one can say so without loosening `readonlyColumns`.
	 */
	capabilityOnlyColumns?: readonly string[];
	/**
	 * Whether this collection can be created, edited or deleted through the
	 * generic endpoint at all.
	 *
	 * `false` means "read-only here": the record is written by the command that
	 * owns it (the waitlist join/leave commands, the outbox delivery service,
	 * the audit writer). Without this, `reports.view` could DELETE the audit
	 * log — the surface accepted generic deletes on every collection it could
	 * read, and nothing exercised them.
	 */
	genericWrite?: boolean;
	/**
	 * The columns a client may write through this endpoint, per operation.
	 *
	 * This is the positive half of the write policy. The endpoint used to accept
	 * "every physical column minus `readonlyColumns`", so a column added to the
	 * schema later was client-writable the moment it existed — the same failure
	 * mode the read allow-list removes. With this map, a create or edit can only
	 * set what is named; a column added to the schema is inert until it is listed.
	 *
	 * `create` and `update` are separate because the two differ: a client may
	 * choose an event's `society_id` when creating it (the UI does) but the
	 * society transfer is a workflow decision on an existing event.
	 */
	writableFields?: {
		create?: readonly string[];
		update?: readonly string[];
	};
	/**
	 * Columns whose JSON value must be an array (relation lists, JSON arrays).
	 *
	 * Validated by `validateWriteBody` before the row is written.
	 */
	jsonArrayColumns?: readonly string[];
	/** Columns whose JSON value must be an object. */
	jsonObjectColumns?: readonly string[];
	/**
	 * Bound for a text column, in bytes of UTF-8.
	 *
	 * Only for unbounded TEXT columns a client writes (the schema's CHECK
	 * constraints bound the structured ones). A value over the bound is a 400,
	 * not a silent truncation: the client should fix its input.
	 */
	maxTextBytes?: Readonly<Record<string, number>>;
	/**
	 * Values applied to columns a create body left out.
	 *
	 * A default never overrides a value the body sent through
	 * `writableFields.create`. A column that must not be chosen at all (`events`'
	 * `status`) is kept *out* of the create allow-list instead, so the default is
	 * the only way it can be set.
	 */
	createDefaults?: Readonly<Record<string, unknown>>;
	/**
	 * Columns stripped from responses to anonymous callers.
	 *
	 * The public site reads `events` through this endpoint, and `SELECT *` handed
	 * back the whole row: approval trail, finance sign-off, the attendance
	 * qualification snapshot, and the legacy `coupons` column. They are null on a
	 * clean dataset, but any of them would leak the moment an event carried one.
	 * Staff surfaces use the dedicated `/api/admin/*` routes, so nothing that
	 * needs these fields reads them from here.
	 */
	publicOmit?: readonly string[];
	/**
	 * PocketBase field names this collection answers to, mapped to the real
	 * column. The schema renamed `created`/`updated` to `created_at`/`updated_at`
	 * and `execom.order` to `sort_order`; the client data modules still sort and
	 * filter by the PocketBase names, so the translation happens here instead of
	 * in every call site.
	 */
	aliases?: Readonly<Record<string, string>>;
	/**
	 * Column that ties a row to its owner, for `read: "self"` / `write: "self"`.
	 *
	 * This is what keeps an admin capability from widening a user-scoped query:
	 * a "self" policy is *always* filtered by this column, whatever the actor's
	 * capabilities are.
	 */
	ownerColumn?: string;
	/**
	 * Read access for an actor who holds `capability` only through a scoped
	 * assignment.
	 *
	 * PocketBase's rules for the reporting collections allowed a society- or
	 * event-scoped read; the branch-only check denied it. The predicate is built
	 * from the actor's *own* assignments, never from the request, so a client
	 * filter can only narrow it further.
	 */
	scopedRead?: {
		capability: Capability;
		predicate: (scope: ScopedReadScope) => { sql: string; params: unknown[] };
	};
}

export interface ScopedReadScope {
	societyIds: string[];
	eventIds: string[];
}

/** `IN (?, ?, …)`, or a predicate that matches nothing. */
function inList(column: string, values: string[]): { sql: string; params: unknown[] } | null {
	if (!values.length) return null;
	return { sql: `${column} IN (${values.map(() => "?").join(", ")})`, params: [...values] };
}

/** Combine predicates with OR; an empty set matches nothing. */
function anyOf(parts: Array<{ sql: string; params: unknown[] } | null>): {
	sql: string;
	params: unknown[];
} {
	const present = parts.filter((part): part is { sql: string; params: unknown[] } => part !== null);
	if (!present.length) return { sql: "0 = 1", params: [] };
	return {
		sql: `(${present.map((part) => part.sql).join(" OR ")})`,
		params: present.flatMap((part) => part.params),
	};
}

/** The collections the browser may touch, and under what terms. */
export const COLLECTION_POLICIES: Record<string, CollectionPolicy> = {
	events: {
		table: "events",
		read: "public",
		write: "capability",
		writeCapability: "events.edit",
		// PocketBase exposed the relation as `society`; the column is `society_id`.
		aliases: { society: "society_id" },
		readPredicate: "is_deleted = 0",
		publicRead: {
			sql: "status IN ('published', 'completed')",
			capability: "events.edit",
			scope: { societyColumn: "society_id", eventColumn: "id" },
		},
		publicOmitBypass: "events.edit",
		/**
		 * The public shape of an event. A new column is invisible until it is
		 * added here; the approval trail, finance sign-off and attendance
		 * snapshot are deliberately absent. `banner`, `contact_email` and
		 * `contact_phone` are public by design — the ticket page shows the
		 * organiser contact and the event form writes them.
		 */
		publicFields: [
			"id",
			"title",
			"slug",
			"description",
			"date",
			"end_date",
			"time_tbc",
			"timezone",
			"venue",
			"location_address",
			"price",
			"society_id",
			"banner",
			"status",
			"max_capacity",
			"registration_open",
			"registration_start",
			"registration_deadline",
			"registration_mode",
			"check_in_enabled",
			"contact_email",
			"contact_phone",
			"tags",
			"form_template",
			"registered_count",
			"checked_in_count",
			"collect_ieee_member",
			"external_form_url",
			"external_link",
			"whatsapp_link",
			"attendance_mode",
			"allow_self_cancellation",
			"self_cancellation_until",
			"refund_request_until",
			"refund_policy",
			"waitlist_enabled",
			"waitlist_offer_minutes",
			"waitlist_reserved_count",
			"eligible_semesters",
			"eligible_programmes",
			"ieee_member_discount_percent",
			"requirements",
			"attendee_note",
			"created_at",
			"updated_at",
		],
		// Never client-writable through this surface, on any operation. Counters
		// are derived from registrations; visibility is the archive command; the
		// approval/finance/attendance trail is a workflow decision.
		readonlyColumns: [
			"id",
			"registered_count",
			"checked_in_count",
			"waitlist_reserved_count",
			"is_deleted",
			"approval_status",
			"approval_note",
			"approval_revision",
			"submitted_by",
			"submitted_at",
			"approved_by",
			"approved_at",
			"finance_approval_status",
			"finance_approval_note",
			"finance_approved_by",
			"finance_approved_at",
			"attendance_qualification_locked",
			"attendance_qualification_version",
			"attendance_qualification_locked_at",
			"attendance_qualification_locked_by",
			"attendance_qualification_snapshot",
		],
		// The columns the event setup form saves (`buildPayload` plus the banner
		// upload). A column added to `events` later stays inert until it is added
		// here. The society is chosen at creation; moving an existing event to
		// another society is a workflow decision, and `status` is published from
		// the workspace, not saved by the setup form.
		writableFields: {
			update: [
				"title",
				"slug",
				"description",
				"date",
				"end_date",
				"time_tbc",
				"timezone",
				"venue",
				"location_address",
				"price",
				"base_fee_paise",
				"banner",
				"max_capacity",
				"registration_open",
				"registration_start",
				"registration_deadline",
				"registration_mode",
				"check_in_enabled",
				"contact_email",
				"contact_phone",
				"tags",
				"form_template",
				"collect_ieee_member",
				"external_form_url",
				"external_link",
				"whatsapp_link",
				"attendance_mode",
				"allow_self_cancellation",
				"self_cancellation_until",
				"refund_request_until",
				"refund_policy",
				"waitlist_enabled",
				"waitlist_offer_minutes",
				"eligible_semesters",
				"eligible_programmes",
				"ieee_member_discount_percent",
				"requirements",
				"attendee_note",
			],
			create: [
				"title",
				"slug",
				"description",
				"date",
				"end_date",
				"time_tbc",
				"timezone",
				"venue",
				"location_address",
				"price",
				"base_fee_paise",
				"banner",
				"max_capacity",
				"registration_open",
				"registration_start",
				"registration_deadline",
				"registration_mode",
				"check_in_enabled",
				"contact_email",
				"contact_phone",
				"tags",
				"form_template",
				"collect_ieee_member",
				"external_form_url",
				"external_link",
				"whatsapp_link",
				"attendance_mode",
				"allow_self_cancellation",
				"self_cancellation_until",
				"refund_request_until",
				"refund_policy",
				"waitlist_enabled",
				"waitlist_offer_minutes",
				"eligible_semesters",
				"eligible_programmes",
				"ieee_member_discount_percent",
				"requirements",
				"attendee_note",
				"society_id",
			],
		},
		// A new event is a draft. Publishing is the workflow command's job, so
		// `status` is not in `writableFields.create`: it can only arrive here.
		// An event without a host society is valid (nine legacy rows have none),
		// so an omitted `society_id` is inserted as NULL (see the create action).
		createDefaults: { status: "draft" },
		jsonArrayColumns: ["form_template", "eligible_semesters", "eligible_programmes", "requirements"],
		jsonObjectColumns: [],
		maxTextBytes: { title: 200, slug: 160, description: 20_000, venue: 240, refund_policy: 8_000, attendee_note: 4_000, tags: 1_000 },
	},
	societies: {
		table: "societies",
		read: "public",
		write: "capability",
		writeCapability: "societies.edit",
		publicRead: {
			sql: "is_hidden = 0",
			capability: "societies.edit",
			scope: { societyColumn: "id" },
		},
		// The directory row the public site renders. `is_hidden` travels with
		// it because `publicRead` already restricts which rows it describes.
		publicFields: [
			"id",
			"name",
			"slug",
			"bio",
			"logo",
			"banner",
			"is_hidden",
			"default_whatsapp_link",
			"created_at",
			"updated_at",
		],
		// What the society form saves, plus the two image columns the upload
		// route writes (it writes them itself; they are listed so a form that
		// clears an image with `""` is accepted). `is_hidden` is the archive
		// action the admin list performs; `capabilityOnlyColumns` limits it to a
		// full-visibility actor even though it is named here.
		writableFields: {
			update: ["name", "slug", "bio", "logo", "banner", "is_hidden", "default_whatsapp_link"],
			// A member who can edit a society still cannot publish a new one:
			// hiding is `societies.edit`-only and a create is hidden by default.
			create: ["name", "slug", "bio", "logo", "banner", "default_whatsapp_link"],
		},
		// Hiding is the archive action the admin list performs; a scoped actor
		// edits the profile but does not take the society off the directory.
		capabilityOnlyColumns: ["is_hidden"],
		createDefaults: { is_hidden: 1 },
		maxTextBytes: { name: 120, slug: 80, bio: 8_000, default_whatsapp_link: 500 },
	},
	execom: {
		table: "execom",
		read: "public",
		write: "capability",
		writeCapability: "execom.manage",
		// Contact details are for the branch, not for an anonymous scrape of the
		// directory. The public page renders names and roles only.
		publicOmit: ["email", "phone"],
		publicOmitBypass: "execom.manage",
		publicFields: [
			"id",
			"name",
			"position",
			"society_id",
			"photo",
			"section_id",
			"sort_order",
			"batch",
			"department",
			"instagram",
			"section",
			"portfolio",
			"term",
			"role_code",
			"active_from",
			"active_until",
			"created_at",
			"updated_at",
		],
		// The member form (`execom-form.tsx`) saves exactly these. `user_id`,
		// `assignment_id` and `role_code` link the member to an account and an
		// assignment, which is a privilege decision the form itself does not
		// present.
		writableFields: {
			update: [
				"name",
				"position",
				"society_id",
				"photo",
				"section_id",
				"sort_order",
				"batch",
				"department",
				"linkedin",
				"instagram",
				"section",
				"email",
				"phone",
				"portfolio",
				"term",
				"active_from",
				"active_until",
			],
			create: [
				"name",
				"position",
				"society_id",
				"photo",
				"section_id",
				"sort_order",
				"batch",
				"department",
				"linkedin",
				"instagram",
				"section",
				"email",
				"phone",
				"portfolio",
				"term",
				"active_from",
				"active_until",
			],
		},
		maxTextBytes: { name: 120, position: 120, department: 120, section: 80, term: 80 },
		// PocketBase's `order` field is `sort_order` in the schema.
		aliases: { order: "sort_order" },
	},
	users: {
		table: "users",
		read: "self",
		write: "self",
		ownerColumn: "id",
		// A profile edit, not a credential edit. `email` is the sign-in identity
		// and `google_sub` the OAuth link; both belong to the auth flow. The
		// member may read their own address (the UI greets them by it) but may
		// not change it here: there is no verified email-change flow, and a
		// self-service write would let a caller claim an address they do not
		// control, which the directory and the notification outbox both trust.
		publicFields: ["id", "email", "name", "display_name", "avatar", "created_at", "updated_at"],
		readonlyColumns: ["email", "role", "google_sub", "email_verified", "last_login_at"],
		writableFields: {
			update: ["name", "display_name", "avatar"],
			create: [],
		},
		maxTextBytes: { name: 120, display_name: 120 },
	},
	// `registrations` is deliberately absent.
	//
	// It used to be listed as `read: "self"` with no `ownerColumn`, which made the
	// self-scope a no-op: every signed-in user could list and read every
	// registration, including name, email, phone, form answers and ticket ids.
	// Nothing in the client ever called `collection("registrations")` — the
	// attendee surfaces go through `/api/my-events` and
	// `/api/events/:id/my-registration`, which scope by `user_id = ?` in SQL — so
	// the entry was pure attack surface. Re-adding it needs a capability plus a
	// server-side scope predicate, not an `ownerColumn` (walk-in registrations have
	// `user_id IS NULL` and would become unreadable by their own creators).
	organization_assignments: {
		table: "organization_assignments",
		read: "self",
		write: "capability",
		writeCapability: "assignments.manage",
		ownerColumn: "user_id",
		// The member sees their own appointment, which is what the workspace page
		// needs to know who they are. `created_by`/`notes` and the executable
		// `role_code` belong to the assignment command's review.
		publicFields: [
			"id",
			"user_id",
			"role_code",
			"title",
			"scope_type",
			"society_id",
			"event_id",
			"term",
			"starts_at",
			"ends_at",
			"active",
			"source",
			"created_at",
			"updated_at",
		],
		readonlyColumns: ["user_id", "created_by", "source_execom"],
		// Who holds which capability is administered by the workspace assignment
		// command (`/api/workspace/assignments`), which re-checks that the actor
		// may grant that role at that scope. The generic surface used to accept
		// `role_code`/`scope_type` here on an `assignments.manage` check alone.
		writableFields: { update: ["title", "term", "starts_at", "ends_at", "notes"], create: [] },
		maxTextBytes: { title: 120, term: 40 },
	},
	/**
	 * A member's own waitlist entry, read-only.
	 *
	 * Joining and leaving go through `/api/events/:id/waitlist/join|leave`,
	 * which reconcile offers, capacity and the registration a seat converts
	 * into. The generic write used to let a member set `status: 'accepted'` and
	 * `accepted_registration` on their own row, which is a seat without a
	 * registration and without capacity.
	 */
	event_waitlist: {
		table: "event_waitlist",
		read: "self",
		write: "self",
		ownerColumn: "user_id",
		genericWrite: false,
		publicFields: [
			"id",
			"event_id",
			"user_id",
			"status",
			"joined_at",
			"offered_at",
			"offer_expires_at",
			"programme_code",
			"semester",
		],
		aliases: { event: "event_id" },
	},
	community_profiles: {
		table: "community_profiles",
		read: "self",
		write: "self",
		ownerColumn: "user_id",
		// A member may describe themselves; verification is an officer decision.
		publicFields: [
			"id",
			"user_id",
			"account_type",
			"sr_number",
			"department",
			"semester",
			"graduation_year",
			"ieee_member",
			"ieee_member_id",
			"institutional_verified",
			"verified_at",
			"created_at",
			"updated_at",
		],
		// What the community profile form saves. Verification is an officer
		// decision recorded by the workspace, never a self-service write.
		writableFields: {
			update: [
				"account_type",
				"sr_number",
				"department",
				"semester",
				"graduation_year",
				"ieee_member",
				"ieee_member_id",
			],
			create: [
				"account_type",
				"sr_number",
				"department",
				"semester",
				"graduation_year",
				"ieee_member",
				"ieee_member_id",
			],
		},
		readonlyColumns: [
			"user_id",
			"institutional_verified",
			"verified_at",
			"verified_by",
			"created_at",
			"updated_at",
		],
		maxTextBytes: { sr_number: 40, department: 120, graduation_year: 8, ieee_member_id: 40 },
	},
	coupons: {
		table: "coupons",
		read: "capability",
		readCapability: "events.edit",
		write: "capability",
		writeCapability: "events.edit",
		// The event setup screen asks for `event = …` / `society = …`.
		aliases: { event: "event_id", society: "society_id" },
		publicFields: [
			"id",
			"event_id",
			"society_id",
			"code",
			"discount_percent",
			"max_uses",
			"used_count",
			"expires_at",
			"is_active",
			"description",
			"created_at",
			"updated_at",
		],
		// `used_count` is consumed by the registration transaction; a client that
		// could set it could reset or exhaust a coupon's budget.
		readonlyColumns: ["used_count"],
		// The event setup screen saves coupons through `reconcileCoupons`. The
		// event and society they belong to are fixed at creation.
		writableFields: {
			update: ["code", "discount_percent", "max_uses", "expires_at", "is_active", "description"],
			create: ["event_id", "society_id", "code", "discount_percent", "max_uses", "expires_at", "is_active", "description"],
		},
		maxTextBytes: { code: 40, description: 500 },
		scopedRead: {
			capability: "events.edit",
			predicate: (scope) =>
				anyOf([
					inList("event_id", scope.eventIds),
					inList("society_id", scope.societyIds),
				]),
		},
	},
	/**
	 * The admin activity feed, read-only.
	 *
	 * The audit log is written by `audit()` inside the transaction it describes.
	 * Accepting generic creates let a caller append entries that look like real
	 * workflow decisions, and accepting updates/deletes let `reports.view`
	 * erase the trail (and DELETEs were not even audited). It is an append-only
	 * evidence store; the endpoint serves it for display only.
	 */
	admin_audit_log: {
		table: "admin_audit_log",
		read: "capability",
		readCapability: "reports.view",
		write: "capability",
		writeCapability: "reports.view",
		genericWrite: false,
		aliases: { event: "event_id", registration: "registration_id", actor: "actor_id" },
		// `before`/`after` can carry a person's details from the row the action
		// touched; the feed renders the action, note and who did it.
		publicFields: [
			"id",
			"event_id",
			"registration_id",
			"actor_id",
			"action",
			"note",
			"entity_type",
			"entity_id",
			"outcome",
			"request_id",
			"created_at",
		],
		scopedRead: {
			capability: "reports.view",
			predicate: (scope) =>
				anyOf([
					inList("event_id", scope.eventIds),
					{
						sql: "event_id IN (SELECT id FROM events WHERE society_id IN (SELECT value FROM json_each(?)))",
						params: [JSON.stringify(scope.societyIds)],
					},
				]),
		},
	},
	/**
	 * The notification outbox, as read by the admin dashboard's "failed
	 * notifications" counter.
	 *
	 * Every column is read-only: the outbox is written by the delivery service,
	 * and a browser that could POST to it could forge a delivery record.
	 * `reports.view` is the capability the dashboard already requires to render
	 * that counter, and the one `admin_audit_log` uses — both are branch
	 * reporting surfaces, and both expose recipient identity.
	 */
	notification_outbox: {
		table: "notification_outbox",
		read: "capability",
		readCapability: "reports.view",
		// The counter filters on `status` and `attempts`, and never displays a
		// row, so the recipient address does not need to leave the server.
		publicFields: [
			"id",
			"registration_id",
			"kind",
			"status",
			"attempts",
			"next_attempt_at",
			"last_attempt_at",
			"sent_at",
			"certificate_batch_id",
			"created_at",
			"updated_at",
		],
		scopedRead: {
			capability: "reports.view",
			predicate: (scope) =>
				anyOf([
					{
						sql: "registration_id IN (SELECT r.id FROM registrations r WHERE r.event_id IN (SELECT value FROM json_each(?)))",
						params: [JSON.stringify(scope.eventIds)],
					},
					{
						sql: "registration_id IN (SELECT r.id FROM registrations r JOIN events e ON e.id = r.event_id WHERE e.society_id IN (SELECT value FROM json_each(?)))",
						params: [JSON.stringify(scope.societyIds)],
					},
				]),
		},
		write: "capability",
		writeCapability: "reports.view",
		// Nothing about the outbox is client-writable: the delivery worker owns
		// every transition. `reports.view` was the write capability before, which
		// let a reporting reader forge a `sent` row.
		genericWrite: false,
	},
};

/**
 * PocketBase field names that mean a column with a different name.
 *
 * Applied to every collection: the schema uses the `_at` suffix throughout, and
 * the client modules still ask for `created` / `updated` because that is what
 * PocketBase exposed. A collection can add its own aliases on top.
 */
const FIELD_ALIASES: Readonly<Record<string, string>> = {
	created: "created_at",
	updated: "updated_at",
};

// ---------------------------------------------------------------------------
// Filter translation
// ---------------------------------------------------------------------------

const OPERATORS: Record<string, string> = {
	"=": "=",
	"!=": "<>",
	">": ">",
	">=": ">=",
	"<": "<",
	"<=": "<=",
};

interface Token {
	kind: "field" | "op" | "value" | "and" | "or" | "lparen" | "rparen";
	text: string;
}

function tokenize(filter: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;

	while (index < filter.length) {
		const char = filter[index] as string;

		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === "(") {
			tokens.push({ kind: "lparen", text: "(" });
			index += 1;
			continue;
		}
		if (char === ")") {
			tokens.push({ kind: "rparen", text: ")" });
			index += 1;
			continue;
		}
		if (filter.startsWith("&&", index) || filter.startsWith("||", index)) {
			tokens.push({ kind: filter.startsWith("&&", index) ? "and" : "or", text: filter.slice(index, index + 2) });
			index += 2;
			continue;
		}
		if (char === "'") {
			// Quoted string; '' is an escaped quote.
			let value = "";
			index += 1;
			while (index < filter.length) {
				if (filter[index] === "'") {
					if (filter[index + 1] === "'") {
						value += "'";
						index += 2;
						continue;
					}
					index += 1;
					break;
				}
				value += filter[index];
				index += 1;
			}
			tokens.push({ kind: "value", text: value });
			continue;
		}
		// Operator or bare word/number. `~` / `!~` are PocketBase's contains and
		// not-contains operators; the admin event and society searches still use
		// them, so the grammar has to accept what the client modules emit.
		const operatorMatch = /^(>=|<=|!=|!~|=|>|<|~)/.exec(filter.slice(index));
		if (operatorMatch) {
			tokens.push({ kind: "op", text: operatorMatch[1] as string });
			index += operatorMatch[1]!.length;
			continue;
		}
		const wordMatch = /^[A-Za-z0-9_.-]+/.exec(filter.slice(index));
		if (wordMatch) {
			const text = wordMatch[0];
			// A word followed by an operator is a field; otherwise it is a value.
			const rest = filter.slice(index + text.length).trimStart();
			const isField = /^(=|!=|!~|>=|<=|>|<|~)/.test(rest);
			tokens.push({ kind: isField ? "field" : "value", text });
			index += text.length;
			continue;
		}
		throw new Error(`Unsupported filter token near "${filter.slice(index, index + 12)}"`);
	}
	return tokens;
}

export interface TranslatedFilter {
	sql: string;
	params: unknown[];
}

/**
 * Resolve a PocketBase field name to the column it means, or null.
 *
 * Validation stays here: an alias only ever yields a column that the live table
 * schema actually has, so a crafted alias cannot reach the query.
 */
export function resolveColumn(
	field: string,
	allowedColumns: ReadonlySet<string>,
	aliases: Readonly<Record<string, string>>,
): string | null {
	const column = field.replace(/([A-Z])/g, "_$1").toLowerCase();
	if (allowedColumns.has(column)) return column;
	const aliased = aliases[field] ?? aliases[column] ?? FIELD_ALIASES[field] ?? FIELD_ALIASES[column];
	if (aliased && allowedColumns.has(aliased)) return aliased;
	return null;
}

/**
 * Translate a PocketBase-style filter into SQL.
 *
 * Supports `field <op> value` joined by `&&` / `||` and parentheses, with the
 * comparison operators `= != > >= < <=` and PocketBase's `~` / `!~` contains
 * operators. Field names are validated against `allowedColumns`; values are
 * always bound.
 */
export function translateFilter(
	filter: string,
	allowedColumns: ReadonlySet<string>,
	aliases: Readonly<Record<string, string>> = {},
): TranslatedFilter {
	const tokens = tokenize(filter);
	const params: unknown[] = [];
	let position = 0;

	function parseExpression(): string {
		let left = parseTerm();
		while (tokens[position]?.kind === "or") {
			position += 1;
			const right = parseTerm();
			left = `(${left} OR ${right})`;
		}
		return left;
	}

	function parseTerm(): string {
		let left = parseFactor();
		while (tokens[position]?.kind === "and") {
			position += 1;
			const right = parseFactor();
			left = `(${left} AND ${right})`;
		}
		return left;
	}

	function parseFactor(): string {
		const token = tokens[position];
		if (token?.kind === "lparen") {
			position += 1;
			const inner = parseExpression();
			if (tokens[position]?.kind !== "rparen") throw new Error("Unbalanced filter parentheses");
			position += 1;
			return inner;
		}

		const field = tokens[position];
		const op = tokens[position + 1];
		const value = tokens[position + 2];
		if (field?.kind !== "field" || op?.kind !== "op" || value?.kind !== "value") {
			throw new Error("Unsupported filter expression");
		}
		position += 3;

		const column = resolveColumn(field.text, allowedColumns, aliases);
		if (!column) {
			throw new Error(`Unknown filter field: ${field.text}`);
		}

		// Contains / not-contains. `instr` is deliberate: a search term with `%`
		// or `_` stays a literal, which `LIKE` would turn into a wildcard.
		if (op.text === "~" || op.text === "!~") {
			params.push(value.text);
			return `instr(lower(COALESCE("${column}", '')), lower(?)) ${op.text === "~" ? ">" : "="} 0`;
		}

		const sqlOp = OPERATORS[op.text];
		if (!sqlOp) throw new Error(`Unsupported operator: ${op.text}`);

		let bound: unknown = value.text;
		if (bound === "true") bound = 1;
		else if (bound === "false") bound = 0;
		else if (/^-?\d+$/.test(String(bound))) bound = Number(bound);

		params.push(bound);
		return `"${column}" ${sqlOp} ?`;
	}

	const sql = parseExpression();
	if (position !== tokens.length) throw new Error("Trailing tokens in filter");
	return { sql, params };
}

/** Sort: `-field` is descending; validated against the column set. */
export function translateSort(
	sort: string,
	allowedColumns: ReadonlySet<string>,
	aliases: Readonly<Record<string, string>> = {},
): string {
	const parts = sort
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const descending = part.startsWith("-");
			const raw = descending ? part.slice(1) : part;
			const column = resolveColumn(raw, allowedColumns, aliases);
			if (!column) throw new Error(`Unknown sort field: ${raw}`);
			return `"${column}" ${descending ? "DESC" : "ASC"}`;
		});
	if (!parts.length) return "";
	return ` ORDER BY ${parts.join(", ")}`;
}

/** The columns that actually exist on a table. */
export async function tableColumns(table: string): Promise<Set<string>> {
	const result = await query<{ name: string }>(
		"SELECT name FROM pragma_table_info(?)",
		[table],
	);
	return new Set(result.rows.map((row) => row.name));
}

/**
 * Columns that must carry a value on insert: `NOT NULL` with no default and not
 * the primary key (the route supplies the id).
 *
 * The create route checked only "no writable fields", so a body that named
 * nothing required (`{}`, or one that set only optional columns) reached the
 * `INSERT` and surfaced `NOT NULL constraint failed: events.title` as a 500.
 * A missing required field is the caller's error, so it is a 400 that names it.
 */
export async function requiredColumns(table: string): Promise<string[]> {
	const result = await query<{ name: string; notnull: number; dflt_value: string | null; pk: number }>(
		"SELECT * FROM pragma_table_info(?)",
		[table],
	);
	return result.rows
		.filter((row) => row.notnull === 1 && row.dflt_value === null && row.pk === 0)
		.map((row) => row.name);
}

/** Resolve the actor's assignments for capability checks. */
export async function actorAssignments(userId: string): Promise<Assignment[]> {
	const result = await query<{
		id: string;
		user_id: string;
		role_code: string;
		scope_type: string;
		society_id: string | null;
		event_id: string | null;
		active: number;
		starts_at: string | null;
		ends_at: string | null;
		source: string | null;
	}>(
		`SELECT id, user_id, role_code, scope_type, society_id, event_id, active, starts_at, ends_at, source
		   FROM organization_assignments WHERE user_id = ? AND active = 1`,
		[userId],
	);
	return result.rows.map((row) => ({
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
	}));
}

/**
 * The scopes an actor holds `capability` in, when they hold it only via
 * assignments.
 *
 * Returns null when the actor holds it branch-wide (the caller has already
 * allowed that case) or not at all.
 */
export async function actorReadScope(
	actor: Actor | null,
	capability: Capability,
): Promise<ScopedReadScope | null> {
	if (!actor?.id) return null;
	const assignments = await actorAssignments(actor.id);
	const societyIds = new Set<string>();
	const eventIds = new Set<string>();
	let matched = false;

	for (const row of activeAssignments(assignments)) {
		if (!capabilitiesForRole(row.roleCode).includes(capability)) continue;
		if (row.scopeType === "branch") return null;
		matched = true;
		if (row.scopeType === "society" && row.societyId) societyIds.add(row.societyId);
		if (row.scopeType === "event" && row.eventId) eventIds.add(row.eventId);
	}

	if (!matched) return null;
	return { societyIds: [...societyIds], eventIds: [...eventIds] };
}

/** Society ids a legacy `chair` owns, which have no assignment rows. */
async function legacyChairSocietyIds(actor: Actor): Promise<string[]> {
	if (authRole(actor) !== "chair") return [];
	const found = await query<{ society_id: string }>(
		"SELECT society_id FROM society_chairs WHERE user_id = ?",
		[actor.id],
	);
	return found.rows.map((row) => row.society_id);
}

/** Build the "rows in my scope" half of a public visibility predicate. */
export function scopePredicate(
	scope: ScopedReadScope,
	spec: { societyColumn?: string; eventColumn?: string },
): { sql: string; params: unknown[] } | null {
	const parts: Array<{ sql: string; params: unknown[] } | null> = [];
	if (spec.societyColumn) parts.push(inList(spec.societyColumn, scope.societyIds));
	if (spec.eventColumn) parts.push(inList(spec.eventColumn, scope.eventIds));
	const present = parts.filter((part): part is { sql: string; params: unknown[] } => part !== null);
	if (!present.length) return null;
	return {
		sql: `(${present.map((part) => part.sql).join(" OR ")})`,
		params: present.flatMap((part) => part.params),
	};
}

/**
 * The predicate that keeps unpublished rows out of a non-staff read.
 *
 * `null` means "no extra restriction": either the collection has no publication
 * state or the actor holds the bypass capability branch-wide.
 */
export async function resolvePublicRead(
	policy: CollectionPolicy,
	actor: Actor | null,
): Promise<{ sql: string; params: unknown[] } | null> {
	const config = policy.publicRead;
	if (!config) return null;

	if (actor && (await actorAllows("capability", config.capability, actor))) return null;

	let scope: ScopedReadScope | null = null;
	if (actor) {
		scope = await actorReadScope(actor, config.capability);
		if (actor.role === "chair") {
			const chairs = await legacyChairSocietyIds(actor);
			if (chairs.length) {
				scope = {
					societyIds: [...new Set([...(scope?.societyIds ?? []), ...chairs])],
					eventIds: scope?.eventIds ?? [],
				};
			}
		}
	}

	const scoped = scope && config.scope ? scopePredicate(scope, config.scope) : null;
	if (scoped) return { sql: `(${config.sql} OR ${scoped.sql})`, params: scoped.params };
	return { sql: `(${config.sql})`, params: [] };
}

/**
 * Whether `publicOmit` applies to this reader.
 *
 * Applied to signed-in callers without the bypass capability too: a normal user
 * is not staff just because they have a session.
 */
export async function omitsPublicColumns(
	policy: CollectionPolicy,
	actor: Actor | null,
): Promise<boolean> {
	if (!policy.publicOmit?.length) return false;
	const capability = policy.publicOmitBypass ?? policy.publicRead?.capability;
	if (!capability) return !actor;
	if (!actor) return true;
	return !(await actorAllows("capability", capability, actor));
}

/** Does the actor satisfy this access level? */
export async function actorAllows(
	access: Access,
	capability: Capability | undefined,
	actor: Actor | null,
): Promise<boolean> {
	if (access === "public") return true;
	if (!actor) return false;
	if (access === "self") return true;
	if (!capability) return false;
	const assignments = await actorAssignments(actor.id);
	return hasCapability(actor, capability, {}, assignments);
}

// ---------------------------------------------------------------------------
// Response projection
// ---------------------------------------------------------------------------

export interface Projection {
	/** Columns returned to the caller, or `null` for every column. */
	columns: ReadonlySet<string> | null;
}

/**
 * What this reader may see of one row.
 *
 * Fail closed in two directions. A policy that names neither `publicFields` nor
 * `publicOmit` answers with no columns rather than the whole row (the policy
 * invariant test fails first, so this is the safety net, not the mechanism). A
 * reader without the full-visibility capability never gets `columns: null`
 * unless the policy itself asks for it with `publicOmit`.
 */
export function resolveProjection(policy: CollectionPolicy, staff: boolean): Projection {
	if (staff) return { columns: null };
	if (policy.publicFields?.length) return { columns: new Set(policy.publicFields) };
	if (policy.publicOmit?.length) return { columns: null };
	return { columns: new Set() };
}

/** One projected row. `expand` is rebuilt from the related, allow-listed rows. */
export function projectRow(
	row: Record<string, unknown>,
	projection: Projection,
	expanded: Record<string, Record<string, unknown>> | null = null,
): Record<string, unknown> {
	const projected: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (key === "expand") continue;
		if (projection.columns && !projection.columns.has(key)) continue;
		projected[key] = value;
	}
	if (expanded && Object.keys(expanded).length) projected.expand = expanded;
	return projected;
}

/**
 * The row before an edit, reduced to what the actor could read plus the fields
 * being changed.
 *
 * The audit row is written for a human to read later, and the same reader can
 * query `admin_audit_log`. Copying an `approval_note` or a `finance_approval_*`
 * value the projection had just removed would undo the projection, so a hidden
 * column is stored as `[redacted]`.
 */
export function auditPreimage(
	row: Record<string, unknown>,
	policy: CollectionPolicy,
	staff: boolean,
	changed: readonly string[],
): Record<string, unknown> {
	const projection = resolveProjection(policy, staff);
	const keep = new Set(changed);
	const preimage: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (projection.columns && !projection.columns.has(key)) {
			if (keep.has(key)) preimage[key] = "[redacted]";
			continue;
		}
		preimage[key] = value;
	}
	return preimage;
}

/**
 * A summary of a related row, as a relation expansion may return it.
 *
 * `visibility` is the target collection's own scoped predicate, compiled from
 * the reader's assignments. It is required: an expansion of a table without
 * one (a row policy the target collection declares) is never served, so an
 * expand cannot become a side door into a collection that has no scoped read.
 * `fields` is a positive allow-list of display columns; an empty list omits the
 * relation entirely rather than falling back to the source reader's deny-list.
 */
export interface ExpandSpec {
	/** Column on the source row that holds the related id. */
	column: string;
	/** The related table. */
	table: string;
	/**
	 * The related collection's policy, or — when the table is not served on its
	 * own — a spec that names its visibility predicate and its summary fields.
	 */
	policy?: CollectionPolicy;
	visibility?: { sql: string; capability: Capability };
	fields?: readonly string[];
	/** Columns on the related row that must satisfy the capability, if any. */
	redact?: readonly string[];
}

/**
 * A related row reduced to the expansion summary, or `null` when the relation
 * has no positive projection and must be omitted.
 *
 * `readerIsStaff` only widens the *redacted* columns of a spec that names them —
 * it never widens which columns the summary contains.
 */
export function projectRelated(
	row: Record<string, unknown>,
	spec: ExpandSpec,
	readerIsStaff: boolean,
): Record<string, unknown> | null {
	if (!spec.visibility) return null;
	const fields = spec.fields ?? spec.policy?.publicFields;
	if (!fields?.length) return null;
	const redacted = new Set(readerIsStaff ? [] : (spec.redact ?? []));
	const projected: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (key === "expand" || !fields.includes(key) || redacted.has(key)) continue;
		projected[key] = value;
	}
	return Object.keys(projected).length ? projected : null;
}

// ---------------------------------------------------------------------------
// Generic write policy
// ---------------------------------------------------------------------------

/** The 4xx a refused write becomes, or `null` when the write is allowed. */
export interface WriteRefusal {
	status: 400 | 401 | 403 | 413;
	code: string;
	error: string;
}

/** Bound applied to a scalar JSON value a client may send (bytes of UTF-8). */
export const MAX_JSON_VALUE_BYTES = 16 * 1024;
/** Bound applied to a column the policy did not size explicitly. */
export const MAX_TEXT_BYTES = 32 * 1024;

function utf8Bytes(value: string): number {
	return new TextEncoder().encode(value).length;
}

/**
 * Validate the parsed body of a collection write.
 *
 * The endpoint used to hand whatever the client sent to `INSERT`/`UPDATE`:
 * `form_template` could be a 5 MB string that `json_valid()` then rejected as
 * a 500, a registration-shaped object could carry workflow fields, and nothing
 * bounded the size of a generic TEXT column. This rejects the shape up front,
 * with a 400 that names the field.
 */
export function validateWriteBody(
	policy: CollectionPolicy,
	body: Record<string, unknown>,
	columns: ReadonlySet<string>,
): WriteRefusal | null {
	const arrays = new Set(policy.jsonArrayColumns ?? []);
	const objects = new Set(policy.jsonObjectColumns ?? []);
	const sizes = policy.maxTextBytes ?? {};

	for (const [key, value] of Object.entries(body)) {
		if (!columns.has(key) || value === undefined) continue;

		if (typeof value === "string") {
			if (utf8Bytes(value) > MAX_JSON_VALUE_BYTES) {
				return {
					status: 413,
					code: "FIELD_TOO_LARGE",
					error: `${key} is larger than ${MAX_JSON_VALUE_BYTES} bytes`,
				};
			}
			const bound = sizes[key];
			if (bound !== undefined && utf8Bytes(value) > bound && !arrays.has(key) && !objects.has(key)) {
				return { status: 400, code: "FIELD_TOO_LONG", error: `${key} is longer than ${bound} characters` };
			}
			// Structured columns are JSON text on this schema. A string that does
			// not parse is refused here rather than by the CHECK constraint, which
			// would surface as a 500.
			if ((arrays.has(key) || objects.has(key)) && value.trim() !== "" && !isJson(value)) {
				return { status: 400, code: "INVALID_FIELD", error: `${key} must be valid JSON` };
			}
			continue;
		}

		if (arrays.has(key)) {
			if (!Array.isArray(value)) {
				return { status: 400, code: "INVALID_FIELD", error: `${key} must be an array` };
			}
			if (value.length > 200) {
				return { status: 400, code: "FIELD_TOO_LONG", error: `${key} has more than 200 entries` };
			}
			continue;
		}
		if (objects.has(key)) {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				return { status: 400, code: "INVALID_FIELD", error: `${key} must be an object` };
			}
			continue;
		}
		if (sizes[key] !== undefined && value !== null && typeof value === "object") {
			return { status: 400, code: "INVALID_FIELD", error: `${key} must be a plain value` };
		}
	}
	return null;
}

/**
 * Store a structured column the way the schema and its readers expect.
 *
 * `form_template`, `eligible_semesters`, `eligible_programmes` and
 * `requirements` are JSON *text* columns (`CHECK json_valid(...)`), and the
 * admin form posts them as arrays. Passing the array straight to better-sqlite3
 * threw `Unsupported SQLite bind value of type object`, so every event save that
 * carried one failed with a 500. Both shapes are accepted; an array (or object)
 * is serialised to its JSON text here, which is what the readers parse.
 */
export function normaliseStructuredValue(policy: CollectionPolicy, key: string, value: unknown): unknown {
	const arrays = new Set(policy.jsonArrayColumns ?? []);
	if (!arrays.has(key) && !(policy.jsonObjectColumns ?? []).includes(key)) return value;
	if (typeof value === "string" || value === undefined || value === null) return value;
	return JSON.stringify(value);
}

/** Apply `normaliseStructuredValue` to every field of a write body, in place. */
export function normaliseWriteBody(policy: CollectionPolicy, body: Record<string, unknown>): void {
	for (const key of Object.keys(body)) {
		body[key] = normaliseStructuredValue(policy, key, body[key]);
	}
}

function isJson(value: string): boolean {
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Map a client write body onto the collection's canonical field names.
 *
 * The browser client keeps PocketBase's field names (`society`, `created`,
 * `order`). Filters and sorts already translate them; writes did not, so a
 * create that posted `society` silently lost the society and landed an event
 * with no host. This is the write half of the same translation, and it validates
 * rather than guesses:
 *
 *   - a key that is not a column and not a declared alias is not a value this
 *     collection knows; it is dropped (the client sends more than any one
 *     collection needs — `coupons` travels inside the event payload);
 *   - an alias and its column both present with different values is a 400: one
 *     of them is a bug, and picking arbitrarily would write the wrong row;
 *   - an alias and its column both present with the same value is one field.
 */
export function canonicalWriteBody(
	policy: CollectionPolicy,
	body: Record<string, unknown>,
	columns: ReadonlySet<string>,
): { body: Record<string, unknown>; refused: WriteRefusal | null } {
	const aliases = { ...FIELD_ALIASES, ...(policy.aliases ?? {}) };
	const resolved: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(body)) {
		if (value === undefined) continue;
		const column = resolveColumn(key, columns, aliases);
		if (!column) continue;
		// An empty select is "not chosen", not a foreign key of "". The create
		// action turns the absent entry into NULL for a nullable relation.
		if (value === "" && key !== column) continue;
		if (Object.hasOwn(resolved, column) && !sameFieldValue(resolved[column], value)) {
			return {
				body: {},
				refused: {
					status: 400,
					code: "CONFLICTING_FIELDS",
					error: `${key} and ${column} both name ${column} with different values`,
				},
			};
		}
		resolved[column] = value;
	}
	return { body: resolved, refused: null };
}

/**
 * Refuse an event create that files the draft under a society the actor does not
 * organise, or under one that does not exist.
 *
 * The event form chooses a host society. `events.edit` scoped to society A must
 * not be able to create a draft in society B by posting its id, and a typo must
 * not create an event whose `society_id` fails the foreign key with a 500.
 * A branch-wide capability holder may file under any existing society.
 */
export async function checkEventSocietyScope(
	policy: CollectionPolicy,
	entries: Array<[string, unknown]>,
	actor: Actor | null,
): Promise<WriteRefusal | null> {
	if (policy.table !== "events") return null;
	const societyId = entries.find(([key]) => key === "society_id")?.[1];
	if (typeof societyId !== "string" || !societyId) return null;

	const known = await query<{ id: string }>("SELECT id FROM societies WHERE id = ?", [societyId]);
	if (!known.rows[0]) {
		return { status: 400, code: "INVALID_FIELD", error: "The host society does not exist" };
	}
	if (!actor) return { status: 401, code: "UNAUTHORIZED", error: "Not authorized" };

	const capability = policy.writeCapability;
	if (!capability) return { status: 403, code: "FORBIDDEN", error: "Not authorized" };
	const assignments = await actorAssignments(actor.id);
	if (!hasEventCapability(actor, capability, { societyId }, assignments)) {
		return { status: 403, code: "FORBIDDEN", error: "You cannot create an event for this society" };
	}
	return null;
}

/** SQLite stores booleans as 0/1 and the client posts `true`/`false`. */
export function sameFieldValue(before: unknown, after: unknown): boolean {
	const normalise = (value: unknown): unknown => (value === true ? 1 : value === false ? 0 : value);
	return normalise(before) === normalise(after);
}

/**
 * The columns a *create* may write.
 *
 * Only the policy's `writableFields.create` that also exist on the live table.
 * A column added to the schema is not client-writable until it is listed, and
 * `createDefaults` columns the collection's command owns are applied by the
 * policy, never by the body. Returns the entries the caller should insert;
 * `undefined` means the collection does not accept creates through this surface.
 */
export function createEntries(
	policy: CollectionPolicy,
	body: Record<string, unknown>,
	columns: ReadonlySet<string>,
): Array<[string, unknown]> | undefined {
	const allowed = policy.writableFields?.create;
	if (!allowed?.length) return undefined;

	// A default fills a column the body left out; it never overrides one the body
	// sent through the allow-list. A column whose value must not be chosen at all
	// (`events.status`) is simply kept out of the allow-list, so it can only
	// ever arrive as its default.
	const defaults = policy.createDefaults ?? {};
	const entries: Array<[string, unknown]> = Object.entries(body).filter(
		([key, value]) => columns.has(key) && allowed.includes(key) && value !== undefined,
	);
	for (const [key, value] of Object.entries(defaults)) {
		if (!columns.has(key) || entries.some(([name]) => name === key)) continue;
		entries.push([key, value]);
	}
	return entries;
}

/**
 * The columns an *update* may write.
 *
 * `id` is always excluded, and so is anything the policy does not list in
 * `writableFields.update`. `capabilityOnlyColumns` needs the full-visibility
 * capability: a scoped actor can edit a society's profile but not take it off
 * the directory.
 */
export function updateEntries(
	policy: CollectionPolicy,
	body: Record<string, unknown>,
	columns: ReadonlySet<string>,
	staff: boolean,
): Array<[string, unknown]> | undefined {
	const allowed = policy.writableFields?.update;
	if (!allowed?.length) return undefined;
	const staffOnly = new Set(staff ? [] : (policy.capabilityOnlyColumns ?? []));
	return Object.entries(body).filter(
		([key, value]) =>
			columns.has(key) && allowed.includes(key) && !staffOnly.has(key) && key !== "id" && value !== undefined,
	);
}

/**
 * Does the actor hold the bypass capability (the full-visibility decision)?
 *
 * This answers "may this reader see every column", which is what
 * `resolveProjection` and `updateEntries` need. It is *not* the negation of
 * `omitsPublicColumns`: that function asks whether the `publicOmit` deny-list
 * applies, and for a `publicFields`-only policy (events) it is `false` for
 * everyone. Using it here made every anonymous reader of such a policy "staff",
 * so the allow-list was skipped and `SELECT *` answered with the approval trail
 * and finance sign-off.
 */
export async function hasFullVisibility(policy: CollectionPolicy, actor: Actor | null): Promise<boolean> {
	const capability = policy.publicOmitBypass ?? policy.publicRead?.capability;
	if (!capability) return false;
	return actorAllows("capability", capability, actor);
}
