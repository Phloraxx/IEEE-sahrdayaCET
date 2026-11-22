/**
 * `/admin` requires workspace access, not merely a session.
 *
 * The server gate used to check only "is there a session", so an ordinary member
 * received the admin shell with a 200 and was moved on by client JavaScript.
 * A crawler, a no-JS client, or anything reading the status code saw success.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

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

async function status(path: string, cookie?: string) {
	const response = await fetch(BASE + path, {
		redirect: "manual",
		headers: cookie ? { Cookie: `${COOKIE}=${cookie}` } : {},
	});
	return response.status;
}

test.describe("admin workspace gate", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	test("anonymous is redirected, a member is forbidden, staff get the shell", async () => {
		const adminCookie = mintSession(firstId("SELECT id FROM users WHERE role = 'admin' LIMIT 1"));
		const memberCookie = mintSession(firstId("SELECT id FROM users WHERE role = 'user' LIMIT 1"));

		expect(await status("/admin")).toBe(302);
		expect(await status("/admin/events")).toBe(302);
		expect(await status("/admin", memberCookie)).toBe(403);
		expect(await status("/admin/events", memberCookie)).toBe(403);
		expect(await status("/admin", adminCookie)).toBe(200);
	});
});
