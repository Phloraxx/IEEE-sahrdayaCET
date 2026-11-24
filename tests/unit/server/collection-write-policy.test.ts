import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
	COLLECTION_POLICIES,
	auditPreimage,
	createEntries,
	normaliseWriteBody,
	projectRelated,
	projectRow,
	resolveProjection,
	updateEntries,
	validateWriteBody,
	type CollectionPolicy,
	type ExpandSpec,
} from "@/server/collections/policy";
import { collectionAuditInput } from "@/server/collections/audit";
import { parseRegistrationBody } from "@/routes/api.events.$id.register";

/**
 * The access policy of `/api/collections/:name`.
 *
 * Every assertion is a documented allow/deny decision, written from the
 * outside: what an anonymous visitor, a member, a scoped organiser and a
 * full-visibility admin each get. The routes are thin wrappers over
 * `resolveProjection`, `validateWriteBody`, `createEntries`, `updateEntries`
 * and `projectRelated`, so a policy regression fails here without a database, a
 * server or a network. The registration body parser is the one route import,
 * because the shape check *is* the boundary; it is pure.
 */

/** The columns `pragma_table_info` would report, read from the schema file. */
function schemaColumns(table: string): Set<string> {
	const schema = readFileSync(resolve(process.cwd(), "sqlite/schema.sql"), "utf8");
	const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
	if (start < 0) throw new Error(`no table ${table}`);
	const end = schema.indexOf("\n);", start);
	const columns = new Set<string>();
	for (const line of schema.slice(start, end).split("\n").slice(1)) {
		const column = /^\t([a-z_][a-z0-9_]*)\s/.exec(line);
		if (column) {
			columns.add(column[1] as string);
			continue;
		}
		// Table-level `PRIMARY KEY (a, b)` / `UNIQUE (a, b)` clauses.
		const clause = /^\t(?:PRIMARY\s+KEY|UNIQUE)\s*\(([^)]*)\)/.exec(line);
		for (const name of clause?.[1]?.split(",") ?? []) {
			const trimmed = name.trim();
			if (trimmed) columns.add(trimmed);
		}
	}
	return columns;
}

const entries = (list: Array<[string, unknown]> | undefined): Record<string, unknown> =>
	Object.fromEntries(list ?? []);

/** The columns `pragma_table_info` would report `notnull` for, with no default. */
function schemaRequiredColumns(table: string): string[] {
	const schema = readFileSync(resolve(process.cwd(), "sqlite/schema.sql"), "utf8");
	const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
	const end = schema.indexOf("\n);", start);
	const required: string[] = [];
	for (const line of schema.slice(start, end).split("\n").slice(1)) {
		const column = /^\t([a-z_][a-z0-9_]*)\s+(.*)$/.exec(line);
		if (!column) continue;
		const rest = column[2] as string;
		const [, type] = /^\S+/.exec(rest) ?? [];
		if (type?.includes("PRIMARY")) continue;
		if (!/\bNOT NULL\b/.test(rest)) continue;
		if (/\bDEFAULT\b/.test(rest)) continue;
		required.push(column[1] as string);
	}
	return required;
}

describe("read projection is deny-by-default", () => {
	it("gives every collection an explicit allow-list", () => {
		// `publicOmit` is the older, weaker form: a column added to the schema
		// later is served by `SELECT *` until someone remembers to omit it. Every
		// collection now names the columns it may serve instead.
		const withoutAllowList = Object.entries(COLLECTION_POLICIES)
			.filter(([, policy]) => !policy.publicFields?.length && !policy.publicOmit?.length)
			.map(([name]) => name);
		expect(withoutAllowList, "collections with no projection decision").toEqual([]);
	});

	it("answers with no columns when a policy declares neither allow nor omit list", () => {
		const bare: CollectionPolicy = { table: "x", read: "public", write: "capability" };
		expect(resolveProjection(bare, false).columns).toEqual(new Set());
	});

	it("serves the public event shape and nothing else to an anonymous reader", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.events as CollectionPolicy, false);
		const row = {
			id: "evt-1",
			title: "Workshop",
			status: "published",
			registered_count: 12,
			approval_status: "approved",
			approval_note: "Approved with an unusual venue",
			finance_approval_status: "approved",
			finance_approval_note: "Reimbursed",
			attendance_qualification_snapshot: '{"locked":true}',
			submitted_by: "user-9",
			coupons: '["EARLY"]',
			is_deleted: 0,
		};

		expect(projectRow(row, projection)).toEqual({
			id: "evt-1",
			title: "Workshop",
			status: "published",
			registered_count: 12,
		});
	});

	it("serves the whole row only with the full-visibility capability", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.events as CollectionPolicy, true);
		expect(projection.columns).toBeNull();
		expect(projectRow({ id: "evt-1", approval_note: "x" }, projection)).toEqual({ id: "evt-1", approval_note: "x" });
	});

	it("keeps the approval-trail columns out of every collection's allow-list", () => {
		// The list is positive, so this is the same statement as the projection
		// test above, made over the table rather than one row.
		const hidden = ["approval_status", "approval_note", "finance_approval_status", "finance_approved_by", "before", "after"];
		const leaking = Object.entries(COLLECTION_POLICIES).flatMap(([name, policy]) =>
			(policy.publicFields ?? []).filter((field) => hidden.includes(field)).map((field) => `${name}.${field}`),
		);
		expect(leaking).toEqual([]);
	});

	it("keeps execom contact details and the account link out of a member read", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.execom as CollectionPolicy, false);
		const row = { id: "m1", name: "A Member", position: "Chair", email: "person@example.com", phone: "+91", user_id: "user-7" };
		expect(projectRow(row, projection)).toEqual({ id: "m1", name: "A Member", position: "Chair" });
	});

	it("lets a member read their own address but not their role or OAuth link", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.users as CollectionPolicy, false);
		const row = { id: "member-1", email: "member@example.com", name: "Member", role: "admin", google_sub: "123", email_verified: 1 };
		expect(projectRow(row, projection)).toEqual({ id: "member-1", email: "member@example.com", name: "Member" });
	});
});

describe("relation expansion needs its own scoped visibility and summary", () => {
	const societySpec: ExpandSpec = {
		column: "society_id",
		table: "societies",
		policy: COLLECTION_POLICIES.societies,
		visibility: { sql: "is_hidden = 0", capability: "societies.edit" },
		fields: ["id", "name"],
	};

	it("returns only the display fields the UI renders", () => {
		const related = projectRelated(
			{ id: "soc-1", name: "Computer Society", bio: "…", default_whatsapp_link: "https://chat", is_hidden: 1 },
			societySpec,
			false,
		);
		expect(related).toEqual({ id: "soc-1", name: "Computer Society" });
	});

	it("omits a relation with no visibility predicate instead of serving it raw", () => {
		const unguarded: ExpandSpec = { column: "society_id", table: "societies", fields: ["id", "name"] };
		expect(projectRelated({ id: "soc-1", name: "Computer Society" }, unguarded, true)).toBeNull();
	});

	it("omits a relation with no positive field list instead of falling back to a deny-list", () => {
		// A related target that only declares `publicOmit` (or nothing) is not a
		// summary; the source reader's omit list must not decide its shape.
		const denyOnly: CollectionPolicy = {
			table: "registrations",
			read: "capability",
			write: "capability",
			publicOmit: ["payment_data"],
		};
		const spec: ExpandSpec = {
			column: "registration_id",
			table: "registrations",
			policy: denyOnly,
			visibility: { sql: "1 = 1", capability: "reports.view" },
		};
		expect(projectRelated({ id: "reg-1", user_email: "person@example.com", payment_data: "{}" }, spec, false)).toBeNull();
	});

	it("does not widen the summary for a staff reader, only the redacted columns", () => {
		const spec: ExpandSpec = { ...societySpec, fields: ["id", "name", "bio"], redact: ["bio"] };
		expect(projectRelated({ id: "s", name: "S", bio: "b" }, spec, false)).toEqual({ id: "s", name: "S" });
		expect(projectRelated({ id: "s", name: "S", bio: "b" }, spec, true)).toEqual({ id: "s", name: "S", bio: "b" });
	});

	it("returns nothing when every field of the summary is redacted", () => {
		const spec: ExpandSpec = { ...societySpec, fields: ["id"], redact: ["id"] };
		expect(projectRelated({ id: "s" }, spec, false)).toBeNull();
	});
});

describe("the policy table agrees with the schema", () => {
	it("names only columns the table really has", () => {
		for (const [name, policy] of Object.entries(COLLECTION_POLICIES)) {
			const columns = schemaColumns(policy.table);
			const unknown = (policy.publicFields ?? []).filter((column) => !columns.has(column));
			expect(unknown, `${name}: publicFields the schema does not have`).toEqual([]);
			const unwritable = (policy.readonlyColumns ?? []).filter((column) => !columns.has(column));
			expect(unwritable, `${name}: readonlyColumns the schema does not have`).toEqual([]);
			const misSized = Object.keys(policy.maxTextBytes ?? {}).filter((column) => !columns.has(column));
			expect(misSized, `${name}: maxTextBytes for a missing column`).toEqual([]);
			const writable = [...(policy.writableFields?.create ?? []), ...(policy.writableFields?.update ?? [])].filter(
				(column) => !columns.has(column),
			);
			expect(writable, `${name}: writableFields the schema does not have`).toEqual([]);
			const defaults = Object.keys(policy.createDefaults ?? {}).filter((column) => !columns.has(column));
			expect(defaults, `${name}: createDefaults for a missing column`).toEqual([]);
			for (const column of [...(policy.jsonArrayColumns ?? []), ...(policy.jsonObjectColumns ?? [])]) {
				expect(columns.has(column), `${name}: json column ${column}`).toBe(true);
			}
		}
	});

	it("keeps every self policy scoped to its owner column", () => {
		const broken = Object.entries(COLLECTION_POLICIES)
			.filter(([, policy]) => (policy.read === "self" || policy.write === "self") && !policy.ownerColumn)
			.map(([name]) => name);
		expect(broken).toEqual([]);
	});

	it("never lists a readonly column as writable", () => {
		for (const [name, policy] of Object.entries(COLLECTION_POLICIES)) {
			const readonly = new Set(policy.readonlyColumns ?? []);
			const conflict = [...(policy.writableFields?.create ?? []), ...(policy.writableFields?.update ?? [])].filter((column) =>
				readonly.has(column),
			);
			expect(conflict, `${name}: writable and readonly at once`).toEqual([]);
			const owner = policy.write === "self" ? policy.ownerColumn : undefined;
			if (owner) {
				const ownerWritable = [...(policy.writableFields?.create ?? []), ...(policy.writableFields?.update ?? [])].includes(owner);
				expect(ownerWritable, `${name}: owner column is client-writable`).toBe(false);
			}
		}
	});

	it("gives every collection that accepts writes a positive field list", () => {
		const unpoliced = Object.entries(COLLECTION_POLICIES)
			.filter(([, policy]) => policy.genericWrite !== false && !policy.writableFields)
			.map(([name]) => name);
		expect(unpoliced, "writable collections without writableFields").toEqual([]);
	});
});

describe("write policy is a positive field list", () => {
	it("takes an event's approval, finance and counter columns out of reach on every operation", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		const body = {
			title: "New title",
			venue: "Hall",
			registered_count: 99,
			approval_status: "approved",
			finance_approval_status: "approved",
			submitted_by: "user-9",
			is_deleted: 1,
			status: "published",
		};
		const updated = entries(updateEntries(policy, body, columns, true));
		const created = entries(createEntries(policy, body, columns));
		for (const dropped of ["registered_count", "approval_status", "finance_approval_status", "submitted_by", "is_deleted"]) {
			expect(updated, `update ${dropped}`).not.toHaveProperty(dropped);
			expect(created, `create ${dropped}`).not.toHaveProperty(dropped);
		}
		expect(updated).toEqual({ title: "New title", venue: "Hall" });
	});

	it("never makes a schema column client-writable by existing alone", () => {
		// The whole point of the allow-list: a column the policy does not name is
		// inert, whether the table has it or not.
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = new Set([...schemaColumns(policy.table), "future_review_note", "future_billing_state"]);
		expect(entries(updateEntries(policy, { future_review_note: "x", future_billing_state: "x" }, columns, true))).toEqual({});
		expect(entries(createEntries(policy, { future_review_note: "x" }, columns))).toEqual({ status: "draft" });
	});

	it("creates an event as a draft, keeping the host society the client named", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		const body = { title: "Workshop", slug: "workshop", date: "2026-12-01", society_id: "soc-1", status: "published" };

		// `status` is the workflow's and is always the create default; a host
		// society is a real choice on create and survives.
		expect(entries(createEntries(policy, body, columns))).toMatchObject({
			status: "draft",
			title: "Workshop",
			society_id: "soc-1",
		});
	});

	it("does not let an event edit move the event to another society", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(entries(updateEntries(policy, { society_id: "soc-2", title: "T" }, columns, true))).toEqual({ title: "T" });
	});

	it("creates a society hidden and lets only a full-visibility actor hide it", () => {
		const policy = COLLECTION_POLICIES.societies as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(entries(createEntries(policy, { name: "New", slug: "new" }, columns))).toEqual({
			name: "New",
			slug: "new",
			is_hidden: 1,
		});
		expect(entries(updateEntries(policy, { bio: "b", is_hidden: 1 }, columns, false))).toEqual({ bio: "b" });
		expect(entries(updateEntries(policy, { bio: "b", is_hidden: 1 }, columns, true))).toEqual({ bio: "b", is_hidden: 1 });
	});

	it("lets a member edit their own profile but not their email, role or OAuth link", () => {
		const policy = COLLECTION_POLICIES.users as CollectionPolicy;
		const body = {
			name: "New Name",
			display_name: "New",
			avatar: "a.png",
			email: "someone-elses@example.com",
			role: "admin",
			google_sub: "x",
			email_verified: 1,
		};
		expect(entries(updateEntries(policy, body, schemaColumns(policy.table), false))).toEqual({
			name: "New Name",
			display_name: "New",
			avatar: "a.png",
		});
	});

	it("does not accept a user create through the generic surface", () => {
		const policy = COLLECTION_POLICIES.users as CollectionPolicy;
		expect(createEntries(policy, { email: "new@example.com" }, schemaColumns(policy.table))).toBeUndefined();
	});

	it("does not accept an assignment create, and edits only its descriptive fields", () => {
		const policy = COLLECTION_POLICIES.organization_assignments as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(createEntries(policy, { user_id: "u2", role_code: "organizer", scope_type: "branch" }, columns)).toBeUndefined();
		expect(
			entries(updateEntries(policy, { role_code: "organizer", scope_type: "branch", title: "Chair", term: "2026" }, columns, false)),
		).toEqual({ title: "Chair", term: "2026" });
	});

	it("keeps execom account and assignment links out of the member form", () => {
		const policy = COLLECTION_POLICIES.execom as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		const body = { name: "A", position: "Chair", user_id: "u2", role_code: "organizer", assignment_id: "a1", email: "e@x" };
		expect(entries(updateEntries(policy, body, columns, false))).toEqual({ name: "A", position: "Chair", email: "e@x" });
		expect(createEntries(policy, body, columns)).not.toHaveProperty("user_id");
	});

	it("keeps a coupon's used count and its event fixed", () => {
		const policy = COLLECTION_POLICIES.coupons as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(entries(updateEntries(policy, { code: "X", used_count: 0, event_id: "evt-2" }, columns, true))).toEqual({ code: "X" });
		expect(entries(createEntries(policy, { event_id: "evt-1", society_id: "soc-1", code: "X" }, columns))).toEqual({
			event_id: "evt-1",
			society_id: "soc-1",
			code: "X",
		});
	});

	it("refuses a structured field with the wrong shape", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(validateWriteBody(policy, { form_template: { not: "an array" } }, columns)).toMatchObject({ status: 400, code: "INVALID_FIELD" });
		expect(validateWriteBody(policy, { form_template: "[not json" }, columns)).toMatchObject({ status: 400, code: "INVALID_FIELD" });
		expect(validateWriteBody(policy, { form_template: '[{"label":"Name"}]' }, columns)).toBeNull();
	});

	/**
	 * The admin form posts its structured fields as arrays, not JSON strings.
	 * Binding one directly threw `Unsupported SQLite bind value of type object`
	 * — a 500 on every event save that carried `eligibleSemesters`,
	 * `requirements` or `formTemplate`. The array is accepted and stored as the
	 * JSON text the column and its readers expect.
	 */
	it("accepts the arrays the admin form sends and stores them as JSON text", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		const body: Record<string, unknown> = {
			title: "Fixture",
			eligible_semesters: ["S5", "S6"],
			eligible_programmes: ["CSE"],
			requirements: [{ label: "Laptop", required: true }],
			form_template: [{ label: "Name" }],
		};
		normaliseWriteBody(policy, body);
		expect(validateWriteBody(policy, body, columns)).toBeNull();
		expect(body.eligible_semesters).toBe('["S5","S6"]');
		expect(body.eligible_programmes).toBe('["CSE"]');
		expect(JSON.parse(body.requirements as string)).toEqual([{ label: "Laptop", required: true }]);
		expect(body.title).toBe("Fixture");
		const kept = entries(createEntries(policy, body, columns));
		expect(kept.eligible_semesters).toBe('["S5","S6"]');
	});

	it("leaves a JSON string and a plain value alone", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const body: Record<string, unknown> = { eligible_semesters: '["S5"]', tags: "workshop, security", title: "x" };
		normaliseWriteBody(policy, body);
		expect(body).toEqual({ eligible_semesters: '["S5"]', tags: "workshop, security", title: "x" });
	});

	/**
	 * `createDefaults` always contributes an entry (`events.status`), so the
	 * "no writable fields" guard never fired for `{}`: the INSERT ran and
	 * answered 500 with `NOT NULL constraint failed: events.title`. The route
	 * now checks the schema's required columns first.
	 */
	it("reports a required column the body left out, so a create cannot 500", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		const required = schemaRequiredColumns(policy.table);
		expect(required).toEqual(expect.arrayContaining(["title", "slug", "date"]));
		const entriesFor = entries(createEntries(policy, {}, columns));
		expect(entriesFor).toEqual({ status: "draft" });
		const supplied = new Set(Object.keys(entriesFor));
		const missing = required.filter((column) => !supplied.has(column));
		expect(missing).toEqual(expect.arrayContaining(["title", "slug", "date"]));
	});

	it("bounds a sized text column and a JSON value with the shared cap", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const columns = schemaColumns(policy.table);
		expect(validateWriteBody(policy, { title: "x".repeat(201) }, columns)).toMatchObject({ status: 400, code: "FIELD_TOO_LONG" });
		expect(validateWriteBody(policy, { description: "x".repeat(17 * 1024) }, columns)).toMatchObject({ status: 413, code: "FIELD_TOO_LARGE" });
		expect(validateWriteBody(policy, { venue: "Hall" }, columns)).toBeNull();
	});
});

describe("generic writes are disabled where a command owns the record", () => {
	it("serves the audit log, the outbox and the waitlist read-only", () => {
		for (const name of ["admin_audit_log", "notification_outbox", "event_waitlist"]) {
			expect(COLLECTION_POLICIES[name]?.genericWrite, name).toBe(false);
		}
	});

	it("keeps the collections the admin UI saves writable", () => {
		for (const name of ["events", "societies", "execom", "coupons", "community_profiles", "users"]) {
			expect(COLLECTION_POLICIES[name]?.genericWrite, name).not.toBe(false);
			expect(COLLECTION_POLICIES[name]?.writableFields?.update?.length, name).toBeGreaterThan(0);
		}
	});

	it("does not expose an audit snapshot in the feed", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.admin_audit_log as CollectionPolicy, false);
		const row = { id: "a1", action: "event.update", note: "Updated title", before: '{"email":"x@y"}', after: '{"email":"x@y"}' };
		expect(projectRow(row, projection)).toEqual({ id: "a1", action: "event.update", note: "Updated title" });
	});

	it("does not send a recipient address with the failed-notification counter", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.notification_outbox as CollectionPolicy, false);
		const row = { id: "o1", status: "failed", attempts: 9, recipient: "person@example.com", last_error: "boom", dedupe_key: "k" };
		expect(projectRow(row, projection)).toEqual({ id: "o1", status: "failed", attempts: 9 });
	});

	it("gives a member only their own waitlist entry, without the offer plumbing", () => {
		const projection = resolveProjection(COLLECTION_POLICIES.event_waitlist as CollectionPolicy, false);
		const row = { id: "w1", event_id: "evt-1", user_id: "member-1", status: "waiting", active_key: "evt-1:member-1", accepted_registration: "reg-1" };
		expect(projectRow(row, projection)).toEqual({ id: "w1", event_id: "evt-1", user_id: "member-1", status: "waiting" });
	});
});

describe("audit pre-image records only what the actor could read", () => {
	it("redacts a hidden column the actor tried to change", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		const before = auditPreimage({ id: "evt-1", title: "Old", approval_note: "private" }, policy, false, ["title", "approval_note"]);
		expect(before).toEqual({ id: "evt-1", title: "Old", approval_note: "[redacted]" });
	});

	it("keeps the whole row for a full-visibility actor", () => {
		const policy = COLLECTION_POLICIES.events as CollectionPolicy;
		expect(auditPreimage({ id: "evt-1", title: "Old", approval_note: "private" }, policy, true, ["title"])).toEqual({
			id: "evt-1",
			title: "Old",
			approval_note: "private",
		});
	});
});

describe("audit redaction of the recorded pre-image", () => {
	it("keeps a hidden column the actor could not read marked as redacted", () => {
		// The route hands the mapper a pre-image in which a stripped column is
		// `[redacted]`; the marker survives into the log unchanged.
		const input = collectionAuditInput({
			actorId: "organizer-1",
			collection: "events",
			kind: "update",
			row: { id: "evt-1", title: "New", approval_note: "[redacted]" },
			before: { id: "evt-1", title: "Old", approval_note: "[redacted]" },
			changed: ["title", "approval_note"],
		});
		expect(input.before).toEqual({ title: "Old", approval_note: "[redacted]" });
		expect(input.after).toEqual({ title: "New", approval_note: "[redacted]" });
	});
});

describe("registration command body shape", () => {
	it("accepts the answers the form sends", () => {
		const parsed = parseRegistrationBody({
			formResponses: { name: "A Participant", semester: "S5", isIeeeMember: true, answers: [true, false] },
			couponCode: "early",
		});
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.formResponses).toEqual({ name: "A Participant", semester: "S5", isIeeeMember: true, answers: [true, false] });
			expect(parsed.couponCode).toBe("early");
		}
	});

	it("refuses an object or a nested array where an answer belongs", () => {
		expect(parseRegistrationBody({ formResponses: { name: { nested: true } } })).toMatchObject({ ok: false, code: "INVALID_BODY" });
		expect(parseRegistrationBody({ formResponses: { role: [["admin"]] } })).toMatchObject({ ok: false, code: "INVALID_BODY" });
	});

	it("refuses an oversized answer and too many answers", () => {
		expect(parseRegistrationBody({ formResponses: { note: "x".repeat(5 * 1024) } })).toMatchObject({ ok: false, code: "BODY_TOO_LARGE" });
		const many = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`q${index}`, "y"]));
		expect(parseRegistrationBody({ formResponses: many })).toMatchObject({ ok: false, code: "BODY_TOO_LARGE" });
	});

	it("refuses a coupon code that is not a string", () => {
		expect(parseRegistrationBody({ couponCode: { $ne: null } })).toMatchObject({ ok: false, code: "INVALID_BODY" });
	});

	it("treats a missing answer set as an empty one", () => {
		expect(parseRegistrationBody({})).toEqual({ ok: true, formResponses: {}, couponCode: undefined });
	});
});
