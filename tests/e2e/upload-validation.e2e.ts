/**
 * Upload validation: the bytes decide the type, not the browser.
 *
 * A valid SVG declared as `image/png` used to be accepted and handed to
 * librsvg, which is the parse surface a 2026 RCE advisory lives in. These are
 * the HTTP-boundary checks; the pure signature tests live in
 * `tests/unit/server/upload-sniff.test.ts`.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);
const SVG = "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><script>alert(2)</script></svg>";

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

async function upload(cookie: string, eventId: string, bytes: Buffer | string, type: string) {
	const form = new FormData();
	form.set("file", new Blob([bytes], { type }), "probe.bin");
	const response = await fetch(`${BASE}/api/uploads/events/${eventId}/banner`, {
		method: "POST",
		headers: { Cookie: `${COOKIE}=${cookie}` },
		body: form,
	});
	return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

test.describe("upload content validation", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	test("accepts a real PNG and rejects content that is not the declared image", async () => {
		const admin = mintSession(firstId("SELECT id FROM users WHERE role = 'admin' LIMIT 1"));
		const eventId = firstId("SELECT id FROM events ORDER BY is_deleted ASC LIMIT 1");

		const png = await upload(admin, eventId, PNG, "image/png");
		expect(png.status).toBe(201);
		expect(String(png.body.filename)).toMatch(/\.png$/);

		const svgAsPng = await upload(admin, eventId, SVG, "image/png");
		expect(svgAsPng.status).toBe(415);

		const pngAsJpeg = await upload(admin, eventId, PNG, "image/jpeg");
		expect(pngAsJpeg.status).toBe(415);

		const svgAsSvg = await upload(admin, eventId, SVG, "image/svg+xml");
		expect(svgAsSvg.status).toBe(415);
	});
});
