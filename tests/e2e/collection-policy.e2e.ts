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
});
