import { describe, expect, it } from "vitest";

import {
	COLLECTION_POLICIES,
	canonicalWriteBody,
	createEntries,
	sameFieldValue,
	updateEntries,
	type CollectionPolicy,
} from "@/server/collections/policy";

/**
 * The submit paths of the admin editors against the collection write policy.
 *
 * These are synthetic bodies shaped exactly like the client's
 * (`src/features/admin/events/event-form.tsx#buildPayload` and
 * `src/features/admin/societies/society-form.tsx#handleSubmit`), so a policy
 * change that strands a legitimate save fails here instead of in the browser.
 *
 * Nothing below touches SQLite: column sets are spelled out.
 */

/** A column set spelled out, so nothing here has to open the database. */
const columnSet = (...names: string[]): Set<string> => new Set(names);

const EVENT_COLUMNS = columnSet(
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
	"base_fee_paise",
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
	"is_deleted",
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
	"approval_status",
	"updated_at",
);

const SOCIETY_COLUMNS = columnSet(
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
);

/** `buildPayload()` from the event form, verbatim in shape. */
function eventFormPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		title: "Hardware Security",
		description: "",
		venue: "AI Lab",
		timezone: "Asia/Kolkata",
		attendanceMode: "onsite",
		locationAddress: "",
		price: 0,
		baseFeePaise: 0,
		ieeeMemberDiscountPercent: 0,
		status: "draft",
		society: "soc-1",
		registrationMode: "internal",
		registrationOpen: true,
		checkInEnabled: true,
		collectIeeeMember: false,
		eligibleSemesters: [],
		eligibleProgrammes: [],
		requirements: [],
		attendeeNote: "",
		timeTbc: false,
		date: "2026-12-01T09:00",
		endDate: "",
		registrationStart: "",
		registrationDeadline: "",
		allowSelfCancellation: false,
		selfCancellationUntil: "",
		refundRequestUntil: "",
		refundPolicy: "",
		waitlistEnabled: false,
		waitlistOfferMinutes: 360,
		contactEmail: "",
		contactPhone: "",
		externalLink: "",
		tags: "",
		externalFormUrl: "",
		formTemplate: [],
		maxCapacity: 0,
		coupons: [],
		...overrides,
	};
}

const eventPolicy = COLLECTION_POLICIES.events as CollectionPolicy;
const societyPolicy = COLLECTION_POLICIES.societies as CollectionPolicy;

describe("event create: the form's `society` reaches `society_id`", () => {
	it("maps the alias onto the canonical column", () => {
		const body = canonicalWriteBody(eventPolicy, { society: "soc-1", title: "T" }, EVENT_COLUMNS);
		expect(body.refused).toBeNull();
		expect(body.body).toEqual({ society_id: "soc-1", title: "T" });
	});

	it("accepts the canonical column alone", () => {
		const body = canonicalWriteBody(eventPolicy, { society_id: "soc-1" }, EVENT_COLUMNS);
		expect(body.body).toEqual({ society_id: "soc-1" });
	});

	it("refuses an alias and its column that disagree", () => {
		const body = canonicalWriteBody(
			eventPolicy,
			{ society: "soc-1", society_id: "soc-2" },
			EVENT_COLUMNS,
		);
		expect(body.refused).toMatchObject({ status: 400, code: "CONFLICTING_FIELDS" });
	});

	it("treats an alias and its column with the same value as one field", () => {
		const body = canonicalWriteBody(
			eventPolicy,
			{ society: "soc-1", society_id: "soc-1" },
			EVENT_COLUMNS,
		);
		expect(body.refused).toBeNull();
		expect(body.body).toEqual({ society_id: "soc-1" });
	});

	it("keeps the host society on a real form create", () => {
		const canonical = canonicalWriteBody(eventPolicy, eventFormPayload(), EVENT_COLUMNS);
		const created = createEntries(eventPolicy, canonical.body, EVENT_COLUMNS);
		const fields = Object.fromEntries(created ?? []);
		expect(fields.society_id).toBe("soc-1");
		expect(fields.status).toBe("draft");
	});

	it("accepts a draft with no society; the route inserts NULL for the FK", () => {
		// The form posts `society: ""` when none is chosen. The write accepts the
		// empty value (the entity can legitimately have no host), and the create
		// action inserts NULL when no society entry is present at all.
		const payload = eventFormPayload({ society: "" });
		const canonical = canonicalWriteBody(eventPolicy, payload, EVENT_COLUMNS);
		expect(canonical.refused).toBeNull();
		const created = createEntries(eventPolicy, canonical.body, EVENT_COLUMNS) ?? [];
		expect(created.some(([key, value]) => key === "society_id" && value === "")).toBe(false);
		expect(created.some(([key]) => key === "society_id")).toBe(false);
	});

	it("never lets the form's `status` publish a new event", () => {
		// The publish control is the workspace workflow action; the setup form
		// only displays the status it read back. Whatever the body says, a create
		// lands in the policy default and `status` is not a chosen column.
		const payload = eventFormPayload({ status: "published" });
		const canonical = canonicalWriteBody(eventPolicy, payload, EVENT_COLUMNS);
		expect(eventPolicy.writableFields?.create).not.toContain("status");
		expect(canonical.body.status).toBe("published");
		expect(Object.fromEntries(createEntries(eventPolicy, canonical.body, EVENT_COLUMNS) ?? [])).toMatchObject({
			status: "draft",
		});
	});

	it("translates a camelCase form field and the PocketBase date aliases", () => {
		const body = canonicalWriteBody(eventPolicy, { endDate: "2026-12-01", updated: "x" }, EVENT_COLUMNS);
		expect(body.body).toEqual({ end_date: "2026-12-01", updated_at: "x" });
	});
});

describe("event edit: the form's own payload is accepted", () => {
	it("maps the full form payload onto allowed columns", () => {
		const canonical = canonicalWriteBody(eventPolicy, eventFormPayload(), EVENT_COLUMNS);
		const writable = updateEntries(eventPolicy, canonical.body, EVENT_COLUMNS, true);
		const fields = Object.fromEntries(writable ?? []);
		expect(fields.title).toBe("Hardware Security");
		expect(fields.venue).toBe("AI Lab");
		expect(fields.form_template).toEqual([]);
		// The create-only society and the workflow status are not edits.
		expect(fields).not.toHaveProperty("society_id");
		expect(fields).not.toHaveProperty("status");
	});

	it("does not 405 a save that restates only unchanged values", () => {
		// `sameFieldValue` is what lets the route treat a restated field as a
		// no-op (200, no audit row) instead of a refusal.
		const existing = { title: "Hardware Security", registration_open: 1, time_tbc: 0 };
		const writable = updateEntries(
			eventPolicy,
			canonicalWriteBody(eventPolicy, eventFormPayload(), EVENT_COLUMNS).body,
			EVENT_COLUMNS,
			true,
		);
		const changed = (writable ?? []).filter(
			([key, value]) => !sameFieldValue(existing[key as keyof typeof existing], value),
		);
		// Everything else in the form's payload is either a value the fixture
		// already holds or a boolean the row stores as 0/1, so a save that only
		// restates the row changes nothing and is not refused.
		expect(changed.map(([key]) => key)).not.toContain("title");
		expect(changed.length).toBeLessThan((writable ?? []).length);
	});

	it("answers a body of only readonly columns with a 400, not a 405", () => {
		const canonical = canonicalWriteBody(
			eventPolicy,
			{ approval_status: "approved", registered_count: 3 },
			EVENT_COLUMNS,
		);
		expect(canonical.body).toEqual({ approval_status: "approved", registered_count: 3 });
		expect(updateEntries(eventPolicy, canonical.body, EVENT_COLUMNS, true)).toEqual([]);
		// The route distinguishes "collection has no update list" (405) from
		// "nothing you sent is writable" (400); the allow-list exists here.
		expect(eventPolicy.writableFields?.update?.length).toBeGreaterThan(0);
	});
});

describe("society editor: hidden/unhide is a full-visibility action", () => {
	const createPayload = { name: "Computer Society", slug: "computer-society", bio: "", defaultWhatsappLink: "" };

	it("creates hidden, then the same save unhides once the profile exists", () => {
		const createBody = canonicalWriteBody(societyPolicy, createPayload, SOCIETY_COLUMNS);
		expect(Object.fromEntries(createEntries(societyPolicy, createBody.body, SOCIETY_COLUMNS) ?? [])).toMatchObject({
			name: "Computer Society",
			is_hidden: 1,
		});

		const unhide = canonicalWriteBody(societyPolicy, { ...createPayload, isHidden: false }, SOCIETY_COLUMNS);
		expect(unhide.body.is_hidden).toBe(false);
		// A full-visibility editor sends it; an explicit unhide is a real change.
		expect(Object.fromEntries(updateEntries(societyPolicy, unhide.body, SOCIETY_COLUMNS, true) ?? [])).toHaveProperty(
			"is_hidden",
			false,
		);
	});

	it("does not let a scoped society editor unhide or hide", () => {
		const body = canonicalWriteBody(societyPolicy, { name: "N", isHidden: false }, SOCIETY_COLUMNS);
		expect(Object.fromEntries(updateEntries(societyPolicy, body.body, SOCIETY_COLUMNS, false) ?? [])).toEqual({ name: "N" });
	});

	it("keeps the profile fields a scoped editor does own", () => {
		const payload = { name: "CS", slug: "cs", bio: "b", defaultWhatsappLink: "https://chat" };
		const body = canonicalWriteBody(societyPolicy, payload, SOCIETY_COLUMNS);
		expect(Object.fromEntries(updateEntries(societyPolicy, body.body, SOCIETY_COLUMNS, false) ?? [])).toEqual({
			name: "CS",
			slug: "cs",
			bio: "b",
			default_whatsapp_link: "https://chat",
		});
	});
});

describe("sameFieldValue matches how SQLite stores the value", () => {
	it("treats booleans as 0/1", () => {
		expect(sameFieldValue(1, true)).toBe(true);
		expect(sameFieldValue(0, false)).toBe(true);
		expect(sameFieldValue(0, true)).toBe(false);
	});

	it("compares strings and numbers strictly", () => {
		expect(sameFieldValue("360", 360)).toBe(false);
		expect(sameFieldValue(null, null)).toBe(true);
	});
});
