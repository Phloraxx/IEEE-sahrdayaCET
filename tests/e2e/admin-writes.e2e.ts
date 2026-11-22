/**
 * Admin create/edit, end to end.
 *
 * The forms used to post `multipart/form-data` to `/api/collections/:name`,
 * which only parses JSON, so every event, society and execom save was a 400.
 * The fix splits the write: JSON for the row, then the image through
 * `/api/uploads/:collection/:recordId/:field`.
 *
 * This spec exercises both halves against the real server: create, edit, upload,
 * and the row actually carrying the generated filename.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";

/** A 1x1 PNG — enough for the type/size checks and for sharp not to be involved. */
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

function mintAdminCookie(): string {
	const db = new Database(DB_PATH);
	try {
		const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as
			| { id: string }
			| undefined;
		if (!admin) throw new Error("no admin user in the migrated database");
		const token = randomBytes(32).toString("base64url");
		const now = new Date();
		db.prepare(
			`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
			 VALUES (?,?,?,?,?,?,?,?)`,
		).run(
			randomBytes(16).toString("hex"),
			createHash("sha256").update(token).digest("hex"),
			admin.id,
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

function societyRow(id: string): { name: string; logo: string | null } | undefined {
	const db = new Database(DB_PATH, { readonly: true });
	try {
		return db.prepare("SELECT name, logo FROM societies WHERE id = ?").get(id) as
			| { name: string; logo: string | null }
			| undefined;
	} finally {
		db.close();
	}
}

test.describe("admin writes", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	let cookie = "";
	let createdId = "";

	test.beforeAll(() => {
		cookie = mintAdminCookie();
	});

	test.afterAll(async () => {
		if (createdId) {
			await fetch(`${BASE}/api/collections/societies/${createdId}`, {
				method: "DELETE",
				headers: { Cookie: `${COOKIE}=${cookie}` },
			});
		}
	});

	test("creates a row with JSON, edits it, then uploads an image to it", async () => {
		const slug = `audit-write-${Date.now()}`;

		const created = await fetch(`${BASE}/api/collections/societies`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${cookie}` },
			body: JSON.stringify({ name: "Write Probe", slug }),
		});
		expect(created.status, "JSON create").toBe(201);
		const row = (await created.json()) as { id: string };
		createdId = row.id;

		const edited = await fetch(`${BASE}/api/collections/societies/${createdId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${cookie}` },
			body: JSON.stringify({ bio: "edited by the audit spec" }),
		});
		expect(edited.status, "JSON edit").toBe(200);
		expect(societyRow(createdId)?.name).toBe("Write Probe");

		// The half that used to be a 400: a real file, through the upload route.
		const form = new FormData();
		form.append("file", new Blob([PNG], { type: "image/png" }), "logo.png");
		const uploaded = await fetch(`${BASE}/api/uploads/societies/${createdId}/logo`, {
			method: "POST",
			headers: { Cookie: `${COOKIE}=${cookie}` },
			body: form,
		});
		expect(uploaded.status, "upload").toBe(201);
		const { filename } = (await uploaded.json()) as { filename: string };
		expect(filename).toMatch(/^[0-9a-f-]{36}\.png$/);
		expect(societyRow(createdId)?.logo, "row carries the generated filename").toBe(filename);
	});

	test("rejects a multipart body on the collections endpoint", async () => {
		// Documents *why* the split exists: this is what the client used to send.
		const form = new FormData();
		form.append("name", "Multipart Probe");
		form.append("slug", `multipart-${Date.now()}`);
		const response = await fetch(`${BASE}/api/collections/societies`, {
			method: "POST",
			headers: { Cookie: `${COOKIE}=${cookie}` },
			body: form,
		});
		expect(response.status).toBe(400);
	});

	test("refuses an upload into a column that is not allow-listed", async () => {
		const form = new FormData();
		form.append("file", new Blob([PNG], { type: "image/png" }), "x.png");
		const response = await fetch(`${BASE}/api/uploads/societies/${createdId}/bio`, {
			method: "POST",
			headers: { Cookie: `${COOKIE}=${cookie}` },
			body: form,
		});
		expect(response.status).toBe(404);
	});
});
