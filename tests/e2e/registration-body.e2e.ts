/**
 * The registration action parses its own body, so it needs its own guards.
 *
 * `[]` used to be treated as `{}` and create a real registration; a 300 KB body
 * used to be parsed before anything was checked. Both are rejected before the
 * registration command runs, so these assertions need no spare capacity.
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

test.describe("registration body validation", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	test("rejects an array, malformed JSON and an oversized body before registering", async () => {
		const cookie = mintSession(firstId("SELECT id FROM users WHERE role = 'user' LIMIT 1"));
		const eventId = firstId("SELECT id FROM events WHERE is_deleted = 0 LIMIT 1");
		const url = `${BASE}/api/events/${eventId}/register`;
		const headers = { Cookie: `${COOKIE}=${cookie}`, "Content-Type": "application/json" };

		const array = await fetch(url, { method: "POST", headers, body: "[]" });
		expect(array.status).toBe(400);
		expect(((await array.json()) as { code?: string }).code).toBe("INVALID_BODY");

		const malformed = await fetch(url, { method: "POST", headers, body: "{not json" });
		expect(malformed.status).toBe(400);

		const big = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ formResponses: { padding: "x".repeat(300 * 1024) } }),
		});
		expect(big.status).toBe(413);

	});
});
