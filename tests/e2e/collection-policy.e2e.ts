/**
 * `/api/collections/:name` authorization, at the HTTP boundary.
 *
 * The unit test asserts the policy *table* is sound. This asserts the endpoint
 * actually behaves: a collection that is not in the allow-list is a 404 before
 * any auth check, and a "self" policy cannot be widened by being an admin.
 *
 * Written for the registrations regression: the policy used to be
 * `read: "self"` with no `ownerColumn`, so every signed-in user could list every
 * registration. That is a data-exposure bug, so it gets an HTTP test, not just a
 * table test.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";

function mintSession(userId: string): string {
	const db = new Database(DB_PATH);
	try {
		const token = randomBytes(32).toString("base64url");
		const now = new Date();
		db.prepare(
			`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
			 VALUES (?,?,?,?,?,?,?,?)`,
		).run(
			randomBytes(16).toString("hex"),
			createHash("sha256").update(token).digest("hex"),
			userId,
			now.toISOString(),
			new Date(now.getTime() + 86_400_000).toISOString(),
			now.toISOString(),
			"playwright",
			"",
		);
		return Buffer.from(JSON.stringify(token)).toString("base64");
	} finally {
		db.close();
	}
}

function firstId(sql: string): string {
	const db = new Database(DB_PATH, { readonly: true });
	try {
		const row = db.prepare(sql).get() as { id: string } | undefined;
		if (!row) throw new Error(`no row for: ${sql}`);
		return row.id;
	} finally {
		db.close();
	}
}

test.describe("collection endpoint authorization", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	let plainCookie = "";
	let adminCookie = "";
	let plainUserId = "";
	let adminUserId = "";
	let registrationId = "";

	test.beforeAll(() => {
		plainUserId = firstId("SELECT id FROM users WHERE role = 'user' LIMIT 1");
		adminUserId = firstId("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
		plainCookie = mintSession(plainUserId);
		adminCookie = mintSession(adminUserId);
		registrationId = firstId("SELECT id FROM registrations LIMIT 1");
	});

	async function get(path: string, cookie: string) {
		return (await fetch(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100"}${path}`, {
			headers: { Cookie: `${COOKIE}=${cookie}` },
		})).status;
	}

	test("a collection removed with its feature is not served", async () => {
		// The blog was removed on 2026-11-22. Its rows are still in the database,
		// which is why they are read directly here: the endpoint must 404 before
		// any authorization, not answer with an empty list.
		const db = new Database(DB_PATH, { readonly: true });
		let blogId = "";
		try {
			blogId = (db.prepare("SELECT id FROM blogs LIMIT 1").get() as { id: string } | undefined)?.id ?? "";
		} finally {
			db.close();
		}
		expect(await get("/api/collections/blogs?perPage=1", "")).toBe(404);
		if (blogId) expect(await get(`/api/collections/blogs/${blogId}`, adminCookie)).toBe(404);
	});

	test("registrations is not readable through the collection endpoint", async () => {
		// Not an allow-listed collection at all: 404, before auth is even consulted.
		expect(await get("/api/collections/registrations?perPage=1", plainCookie)).toBe(404);
		expect(await get(`/api/collections/registrations/${registrationId}`, plainCookie)).toBe(404);
		// And an admin does not get it either — the surface is gone, not gated.
		expect(await get("/api/collections/registrations?perPage=1", adminCookie)).toBe(404);
	});

	test("another user's row is a 404, not a 403", async () => {
		// `users` is a self policy; being an admin does not widen it, and the
		// answer must not confirm that the id exists.
		expect(await get(`/api/collections/users/${adminUserId}`, plainCookie)).toBe(404);
		expect(await get(`/api/collections/users/${plainUserId}`, adminCookie)).toBe(404);
		// Each may read their own row.
		expect(await get(`/api/collections/users/${plainUserId}`, plainCookie)).toBe(200);
	});

	test("a plain user cannot list users", async () => {
		const response = await fetch(
			`${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100"}/api/collections/users?perPage=5`,
			{ headers: { Cookie: `${COOKIE}=${plainCookie}` } },
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { totalItems: number; items: Array<{ id: string }> };
		expect(body.totalItems).toBe(1);
		expect(body.items).toHaveLength(1);
	});

	test("unpublished rows are visible only to staff", async () => {
		// Events: drafts and cancelled events are not public state.
		expect(await count("/api/collections/events?filter=status%3D'draft'", "")).toBe(0);
		expect(await count("/api/collections/events?filter=status%3D'draft'", plainCookie)).toBe(0);
		expect(await count("/api/collections/events?filter=status%3D'draft'", adminCookie)).toBeGreaterThan(0);

		// Blogs were removed with the feature: the collection is not served at all.
		// That is asserted in its own test, which also covers the detail route.

		// Societies: hidden rows are hidden from the directory and the API.
		expect(await count("/api/collections/societies?filter=is_hidden%3D1", "")).toBe(0);
		expect(await count("/api/collections/societies?filter=is_hidden%3D1", plainCookie)).toBe(0);
		expect(await count("/api/collections/societies?filter=is_hidden%3D1", adminCookie)).toBeGreaterThan(0);
	});

	test("a hidden column is not a filter oracle", async () => {
		// Filters and sorts are restricted to the columns the reader can see, so
		// a non-staff caller cannot probe the approval trail.
		expect(
			await get(`/api/collections/events?perPage=1&filter=${encodeURIComponent("finance_approval_status = 'approved'")}`, plainCookie),
		).toBe(400);
		expect(
			await get(`/api/collections/events?perPage=1&sort=${encodeURIComponent("-approval_revision")}`, ""),
		).toBe(400);
		expect(
			await get(`/api/collections/events?perPage=1&filter=${encodeURIComponent("finance_approval_status = 'approved'")}`, adminCookie),
		).toBe(200);
	});

	test("a draft detail row is not readable without the edit capability", async () => {
		const draftId = firstId(
			"SELECT id FROM events WHERE status NOT IN ('published', 'completed') AND is_deleted = 0 LIMIT 1",
		);
		expect(await get(`/api/collections/events/${draftId}`, "")).toBe(404);
		expect(await get(`/api/collections/events/${draftId}`, plainCookie)).toBe(404);
		expect(await get(`/api/collections/events/${draftId}`, adminCookie)).toBe(200);
	});

	test("the audit log, the outbox and the waitlist are read-only through the collection endpoint", async () => {
		// The audit row below is written by the audit trail, not by a client. The
		// endpoint serves it for display and refuses every generic write, so a
		// reader cannot append a decision or erase the trail.
		const auditId = firstId("SELECT id FROM admin_audit_log LIMIT 1");
		expect(await patch(`/api/collections/admin_audit_log/${auditId}`, adminCookie, { note: "rewritten" })).toBe(405);
		expect(await remove(`/api/collections/admin_audit_log/${auditId}`, adminCookie)).toBe(405);
		expect((await post("/api/collections/admin_audit_log", adminCookie, { action: "event.publish" })).status).toBe(405);
		expect((await post("/api/collections/notification_outbox", adminCookie, { kind: "ticket" })).status).toBe(405);
		expect((await post("/api/collections/event_waitlist", plainCookie, { status: "accepted" })).status).toBe(405);
	});

	test("a new event is created as a draft, whatever the body says", async () => {
		// Publishing is the workflow command's decision. The collection create
		// applies the policy default, so a body that asks for `status` still lands
		// in `draft`; the admin UI then publishes from the event workspace.
		const created = await post("/api/collections/events", adminCookie, {
			title: `Policy probe ${Date.now()}`,
			slug: `policy-probe-${Date.now()}`,
			date: new Date().toISOString(),
		});
		expect(created.status).toBe(201);
		const body = (await created.json()) as { id: string; status: string };
		expect(body.status).toBe("draft");

		// An edit that only names columns the policy does not allow is a 400, and
		// the event survives it (the admin UI never sends those columns). A
		// collection with no update allow-list at all is the 405 case instead.
		expect(await patch(`/api/collections/events/${body.id}`, adminCookie, { approval_status: "approved" })).toBe(400);
		expect(await get(`/api/collections/events/${body.id}`, adminCookie)).toBe(200);
		// An allowed column still edits the row.
		expect(await patch(`/api/collections/events/${body.id}`, adminCookie, { title: "probe renamed" })).toBe(200);
		// After the delete the id is gone for everyone, staff included.
		expect(await remove(`/api/collections/events/${body.id}`, adminCookie)).toBe(204);
		expect(await patch(`/api/collections/events/${body.id}`, adminCookie, { title: "x" })).toBe(404);
	});

	test("execom contact details are staff-only", async () => {
		// `email` is not in the public projection, so a non-staff caller cannot
		// even filter on it: the column is not part of the readable grammar.
		const filter = encodeURIComponent("email != ''");
		expect((await fetch(`${BASE}/api/collections/execom?perPage=1&filter=${filter}`)).status).toBe(400);
		expect(
			(await fetch(`${BASE}/api/collections/execom?perPage=1&filter=${filter}`, { headers: { Cookie: `${COOKIE}=${plainCookie}` } }))
				.status,
		).toBe(400);
		const staffResponse = await fetch(`${BASE}/api/collections/execom?perPage=1&filter=${filter}`, {
			headers: { Cookie: `${COOKIE}=${adminCookie}` },
		});
		expect(staffResponse.status).toBe(200);

		// And when the rows themselves are listed, the contact columns are absent
		// for anonymous and member callers, present for staff.
		async function firstItem(cookie: string) {
			const response = await fetch(`${BASE}/api/collections/execom?perPage=1`, {
				headers: cookie ? { Cookie: `${COOKIE}=${cookie}` } : {},
			});
			expect(response.status).toBe(200);
			const body = (await response.json()) as { items: Array<Record<string, unknown>> };
			return body.items[0] ?? {};
		}

		const anonymous = await firstItem("");
		const plain = await firstItem(plainCookie);
		expect(anonymous.email).toBeUndefined();
		expect(anonymous.phone).toBeUndefined();
		expect(plain.email).toBeUndefined();
		expect(plain.phone).toBeUndefined();
	});
});

async function count(path: string, cookie: string): Promise<number> {
	const response = await fetch(`${BASE}${path}`, {
		headers: cookie ? { Cookie: `${COOKIE}=${cookie}` } : {},
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as { totalItems: number };
	return body.totalItems;
}

function writeHeaders(cookie: string): Record<string, string> {
	return { "Content-Type": "application/json", Cookie: `${COOKIE}=${cookie}` };
}

async function post(path: string, cookie: string, body: unknown): Promise<Response> {
	return fetch(`${BASE}${path}`, { method: "POST", headers: writeHeaders(cookie), body: JSON.stringify(body) });
}

async function patch(path: string, cookie: string, body: unknown): Promise<number> {
	return (
		await fetch(`${BASE}${path}`, { method: "PATCH", headers: writeHeaders(cookie), body: JSON.stringify(body) })
	).status;
}

async function remove(path: string, cookie: string): Promise<number> {
	return (await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Cookie: `${COOKIE}=${cookie}` } })).status;
}

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
