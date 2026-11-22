/**
 * A society-scoped manager must be able to manage the team of an event their
 * society runs.
 *
 * `hasEventCapability` matches a society assignment by comparing the
 * assignment's society with the *event's* society, so the workspace service has
 * to resolve the event row. It used to pass `{ id }` alone, which silently
 * denied every society-scoped manager — a regression against the PocketBase
 * rules, which loaded the event.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";

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

/** A society-scoped assignment whose society actually has an event. */
function societyScopedChair(): { userId: string; societyId: string; eventId: string } | null {
	const db = new Database(DB_PATH, { readonly: true });
	try {
		const row = db
			.prepare(
				`SELECT a.user_id AS userId, a.society_id AS societyId, e.id AS eventId
				   FROM organization_assignments a
				   JOIN events e ON e.society_id = a.society_id
				  WHERE a.scope_type = 'society' AND a.active = 1 AND a.society_id IS NOT NULL
				  LIMIT 1`,
			)
			.get() as { userId: string; societyId: string; eventId: string } | undefined;
		return row ?? null;
	} finally {
		db.close();
	}
}

test.describe("society-scoped assignment management", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	test("a society manager can list event-scope assignments for their own event", async () => {
		const scope = societyScopedChair();
		test.skip(!scope, "no society-scoped assignment with an event in the fixture");

		const cookie = mintSession(scope!.userId);
		const own = await fetch(
			`${BASE}/api/workspace/assignments?scopeType=event&scopeId=${scope!.eventId}`,
			{ headers: { Cookie: `${COOKIE}=${cookie}` } },
		);
		expect(own.status, "own society's event").toBe(200);

		// And a different society's event stays out of reach.
		const otherEvent = await fetch(
			`${BASE}/api/workspace/assignments?scopeType=event&scopeId=00000000-0000-4000-8000-000000000000`,
			{ headers: { Cookie: `${COOKIE}=${cookie}` } },
		);
		expect(otherEvent.status, "unknown event").toBe(403);
	});
});

test.describe("scoped reporting reads", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	test("a society manager reads their own outbox rows, a plain user reads none", async () => {
		const scope = societyScopedChair();
		test.skip(!scope, "no society-scoped assignment with an event in the fixture");

		const chair = mintSession(scope!.userId);
		const own = await fetch(`${BASE}/api/collections/notification_outbox?perPage=1`, {
			headers: { Cookie: `${COOKIE}=${chair}` },
		});
		expect(own.status, "scoped read allowed").toBe(200);

		const db = new Database(DB_PATH, { readonly: true });
		let plainUserId = "";
		try {
			plainUserId = (db.prepare("SELECT id FROM users WHERE role = 'user' LIMIT 1").get() as {
				id: string;
			}).id;
		} finally {
			db.close();
		}
		const plain = mintSession(plainUserId);
		const denied = await fetch(`${BASE}/api/collections/notification_outbox?perPage=1`, {
			headers: { Cookie: `${COOKIE}=${plain}` },
		});
		expect(denied.status, "no capability at all").toBe(403);
	});
});
