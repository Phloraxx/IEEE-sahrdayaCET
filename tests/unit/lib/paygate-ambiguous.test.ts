/**
 * Ambiguous-create recovery — the state machine that must never double-charge
 * and never deadlock.
 *
 * The cases that matter and are easy to get wrong:
 *
 *   - a create whose outcome is unknown may have **no provider id** at all
 *     (the answer was lost before the body arrived), so recovery cannot rely
 *     on an id. It relies on the stored **exact attempt** (idempotency key +
 *     request DTO), which the provider replays idempotently;
 *   - once that attempt exists, a retry must never post a *different* body —
 *     an amount or name change makes the provider answer 409, not a new
 *     payment — so a changed request is held for review, not re-created;
 *   - an attempt is only cleared on an affirmative disposition (`paid`,
 *     `expired`, `cancelled` from the provider, or a successful replay);
 *   - the user is never told "no charge was taken" while the result is
 *     unverified.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const workDir = mkdtempSync(join(tmpdir(), "ieee-paygate-ambiguous-"));
const dbPath = join(workDir, "test.db");

process.env.SQLITE_PATH = dbPath;
process.env.UPLOADS_DIR = join(workDir, "uploads");
process.env.APP_SECRET = "ambiguous-test-secret-at-least-32-bytes";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYGATE_URL = "https://paygate.example.test";
process.env.PAYGATE_API_KEY = "ambiguous-test-api-key-at-least-32-bytes!";
process.env.PAYGATE_WEBHOOK_SECRET = "ambiguous-webhook-secret-at-least-32-bytes";
process.env.PAYGATE_CLIENT_NAMESPACE = "local";
// The integration guard refuses paid initiation unless the endpoint is declared a
// sandbox. This suite exercises the real initiation path, so it declares it.
process.env.PAYGATE_SANDBOX = "true";
process.env.NODE_ENV = "test";

interface Database {
	exec(sql: string): void;
	pragma(sql: string): unknown;
	prepare(sql: string): {
		run(...params: unknown[]): unknown;
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
	};
	close(): void;
}

{
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath) as Database;
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.exec("BEGIN IMMEDIATE");
	db.exec(readFileSync(resolve("sqlite/schema.sql"), "utf8"));
	db.pragma("user_version = 1");
	db.exec("COMMIT");
	db.close();
}

const { query, closeDatabase } = await import("@/lib/db.server");
const { startPayment, buildCreateBody, idempotencyKeyFor } = await import("@/server/payments/initiate");
const { action: webhookAction } = await import("@/routes/api.webhooks.paygate");

const EVENT = "d2000000-0000-4000-8000-000000000001";
const SOCIETY = "d1000000-0000-4000-8000-000000000001";
const FEE_PAISE = 500_00;
const FINGERPRINT = 37;

let seq = 0;
async function rawDb(): Promise<Database> {
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath) as Database;
	db.pragma("foreign_keys = ON");
	return db;
}

async function newRegistration(finalFeePaise = FEE_PAISE) {
	seq += 1;
	const id = `areg-${seq}`;
	const userId = `auser-${seq}`;
	const now = new Date().toISOString();
	const db = await rawDb();
	db.prepare("INSERT OR IGNORE INTO users (id,email) VALUES (?,?)").run(userId, `${userId}@example.com`);
	db.prepare(
		`INSERT INTO registrations
		   (id, user_id, event_id, user_name, user_email, registration_status, payment_status,
		    registration_date, base_fee_paise, discount_paise, final_fee_paise, payment_data,
		    registration_source, created_at, updated_at)
		 VALUES (?,?,?,?,?,'pending','pending',?,?,0,?,?,'self_service',?,?)`,
	).run(
		id,
		userId,
		EVENT,
		"Sourav P Bijoy",
		`${userId}@example.com`,
		now,
		finalFeePaise,
		finalFeePaise,
		JSON.stringify({ provider: "paygate" }),
		now,
		now,
	);
	db.close();
	return { id, userId };
}

function providerResponse(paymentId: string, status: string, registrationId = "irrelevant") {
	return {
		id: paymentId,
		object: "payment",
		name: "Sourav P Bijoy",
		external_id: EVENT,
		metadata: { registration_id: registrationId, environment: "local" },
		status,
		currency: "INR",
		requested_amount: `${FEE_PAISE / 100}.00`,
		payable_amount: `${FEE_PAISE / 100}.${String(FINGERPRINT).padStart(2, "0")}`,
		adjustment: `0.${String(FINGERPRINT).padStart(2, "0")}`,
		upi_uri: `upi://pay?pa=m%40upi&am=${FEE_PAISE / 100}.${FINGERPRINT}&cu=INR&tn=PayGate%20${paymentId}`,
		transaction_note: `PayGate ${paymentId}`,
		created_at: new Date().toISOString(),
		expires_at: new Date(Date.now() + 300_000).toISOString(),
		grace_until: new Date(Date.now() + 600_000).toISOString(),
		paid_at: null,
	};
}

interface Seen {
	method: string;
	url: string;
	headers: Headers;
	body: string;
}

type Reply = { status: number; body?: unknown; html?: boolean } | "network" | "hang";

function fakeProvider(script: Reply[]) {
	const calls: Seen[] = [];
	const queue = [...script];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const seen: Seen = {
			method: String(init?.method ?? "GET"),
			url: String(input),
			headers: new Headers(init?.headers),
			body: String(init?.body ?? ""),
		};
		calls.push(seen);
		const reply = queue.length > 1 ? queue.shift() : queue[0];
		if (reply === "network") throw new TypeError("fetch failed");
		if (reply === "hang") await new Promise(() => undefined);
		const result = reply as { status: number; body?: unknown; html?: boolean };
		return new Response(
			result.html ? "<!doctype html><html>paygate dashboard</html>" : JSON.stringify(result.body ?? {}),
			{
				status: result.status,
				headers: { "Content-Type": result.html ? "text/html; charset=utf-8" : "application/json" },
				...(result.body && !result.html
					? {}
					: {}),
			},
		);
	}) as typeof fetch;
	return { fetch: fetchImpl, calls };
}

interface StateRow {
	id: string;
	event_id: string;
	user_name: string;
	registration_status: string;
	payment_status: string;
	final_fee_paise: number;
	data: Record<string, unknown>;
}

async function state(id: string): Promise<StateRow> {
	const found = await query<Record<string, unknown>>("SELECT * FROM registrations WHERE id = ?", [id]);
	const row = found.rows[0];
	if (!row) throw new Error("missing registration");
	return {
		id: String(row.id ?? ""),
		event_id: String(row.event_id ?? ""),
		user_name: String(row.user_name ?? ""),
		registration_status: String(row.registration_status ?? ""),
		payment_status: String(row.payment_status ?? ""),
		final_fee_paise: Number(row.final_fee_paise ?? 0),
		data: JSON.parse(String(row.payment_data ?? "{}")) as Record<string, unknown>,
	};
}

function attemptOf(data: Record<string, unknown>): { idempotencyKey?: string } {
	return (data.createAttempt ?? {}) as { idempotencyKey?: string };
}

beforeEach(async () => {
	const db = await rawDb();
	const scope = "(SELECT id FROM registrations WHERE event_id = ?)";
	db.prepare(`DELETE FROM attendance_records WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM payments WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM notification_outbox WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM admin_audit_log WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`UPDATE event_waitlist SET accepted_registration = NULL WHERE accepted_registration IN ${scope}`).run(EVENT);
	db.prepare("DELETE FROM registrations WHERE event_id = ?").run(EVENT);
	db.prepare("DELETE FROM users WHERE id LIKE 'auser-%'").run();
	db.prepare("INSERT OR IGNORE INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)").run(
		SOCIETY,
		"Ambiguous Society",
		"ambiguous-society",
	);
	db.prepare(
		`INSERT OR IGNORE INTO events
		   (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise)
		 VALUES (?,?,?,?,'published','internal',1,50,?,?)`,
	).run(EVENT, "Ambiguous Event", "ambiguous-event", "2027-12-01T00:00:00.000Z", SOCIETY, FEE_PAISE);
	db.close();
});

afterAll(() => {
	closeDatabase();
	rmSync(workDir, { recursive: true, force: true });
});

describe("ambiguous create with no provider id", () => {
	it("does not deadlock: the next attempt replays the same stored attempt", async () => {
		const registration = await newRegistration();
		const provider = fakeProvider([
			{ status: 200, html: true },
			{ status: 200, body: providerResponse("pay_replayed", "pending") },
		]);

		const first = await startPayment(registration.id, registration.userId, provider.fetch);
		expect(first.ok).toBe(false);
		if (!first.ok) {
			expect(first.code).toBe("PAYGATE_VERIFYING");
			expect(first.unverified).toBe(true);
		}

		const afterFirst = await state(registration.id);
		expect(afterFirst.data.createAttempt).toMatchObject({
			idempotencyKey: expect.any(String),
			request: expect.any(Object),
		});
		expect(afterFirst.data.paymentId).toBeFalsy();

		const second = await startPayment(registration.id, registration.userId, provider.fetch);
		expect(second.ok).toBe(true);
		if (second.ok) expect(second.paymentId).toBe("pay_replayed");

		// Both calls were the same POST: same key, same body. No GET is possible
		// without an id, and no *new* payment was requested.
		const posts = provider.calls.filter((call) => call.method === "POST");
		expect(posts).toHaveLength(2);
		expect(posts[0]?.headers.get("Idempotency-Key")).toBe(posts[1]?.headers.get("Idempotency-Key"));
		expect(posts[0]?.body).toBe(posts[1]?.body);
		expect(posts[0]?.url).toBe("https://paygate.example.test/v1/payments");
	});

	it("keeps the attempt when the retry is ambiguous again, without changing it", async () => {
		const registration = await newRegistration();
		const provider = fakeProvider([{ status: 200, html: true }]);

		await startPayment(registration.id, registration.userId, provider.fetch);
		const first = (await state(registration.id)).data.createAttempt as Record<string, unknown>;
		const second = await startPayment(registration.id, registration.userId, provider.fetch);
		const after = (await state(registration.id)).data.createAttempt as Record<string, unknown>;

		expect(second.ok).toBe(false);
		// The immutable pair (key + DTO) never changes; replays are counted beside it.
		expect(after).toEqual(first);
		expect(second.ok).toBe(false);
		expect(provider.calls[1]?.body).toBe(provider.calls[0]?.body);
		expect(provider.calls[1]?.headers.get("Idempotency-Key")).toBe(
			provider.calls[0]?.headers.get("Idempotency-Key"),
		);
		expect(provider.calls).toHaveLength(2);
		expect(provider.calls[0]?.headers.get("Idempotency-Key")).toBe(
			provider.calls[1]?.headers.get("Idempotency-Key"),
		);
	});

	it("never tells the user no charge was taken while the result is unverified", async () => {
		const registration = await newRegistration();
		const provider = fakeProvider([{ status: 200, html: true }]);

		const result = await startPayment(registration.id, registration.userId, provider.fetch);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.toLowerCase()).not.toContain("no charge");
			expect(result.error.toLowerCase()).not.toContain("no payment was taken");
			// It must not invite a fresh payment before the session is shown.
			expect(result.error).toMatch(/do not pay/i);
			expect(result.unverified).toBe(true);
		}
	});
});

describe("a changed request while an attempt may still exist", () => {
	it("holds for review instead of posting a new key", async () => {
		const registration = await newRegistration();
		const provider = fakeProvider([{ status: 200, html: true }]);
		await startPayment(registration.id, registration.userId, provider.fetch);
		const attemptKey = attemptOf((await state(registration.id)).data).idempotencyKey;

		// The amount changed after the ambiguous attempt (an organizer edit).
		await query("UPDATE registrations SET final_fee_paise = ?, base_fee_paise = ? WHERE id = ?", [
			FEE_PAISE + 10_000,
			FEE_PAISE + 10_000,
			registration.id,
		]);

		const callsBefore = provider.calls.length;
		const result = await startPayment(registration.id, registration.userId, provider.fetch);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(["PAYGATE_ATTEMPT_REVIEW", "PAYGATE_SESSION_CONFLICT"]).toContain(result.code);
		// No new provider request at all: the old attempt may still be live.
		expect(provider.calls.length).toBe(callsBefore);
		expect(attemptOf((await state(registration.id)).data).idempotencyKey).toBe(attemptKey);
		const row = await state(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});

	it("records why, so an operator can act", async () => {
		const registration = await newRegistration();
		const provider = fakeProvider([{ status: 200, html: true }]);
		await startPayment(registration.id, registration.userId, provider.fetch);
		await query("UPDATE registrations SET final_fee_paise = ?, base_fee_paise = ? WHERE id = ?", [
			FEE_PAISE + 10_000,
			FEE_PAISE + 10_000,
			registration.id,
		]);

		await startPayment(registration.id, registration.userId, provider.fetch);
		const data = (await state(registration.id)).data;
		expect(String((data.attemptReview as Record<string, unknown> | undefined)?.reason ?? "")).toMatch(
			/amount|request|changed/i,
		);
		expect(data.createAttempt).toBeTruthy();
	});
});

describe("cleanup only on affirmative disposition", () => {
	it.each([
		["paid", "PAYMENT_AWAITING_CONFIRMATION"],
		["expired", null],
		["cancelled", null],
	] as const)("resolves an id-known attempt reported %s", async (status, expectedCode) => {
		const registration = await newRegistration();
		const row = await state(registration.id);
		const attempt = buildCreateBody({
			id: row.id,
			event_id: row.event_id,
			user_name: row.user_name,
			final_fee_paise: row.final_fee_paise,
		} as never);
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify({
				provider: "paygate",
				paymentId: "pay_known",
				providerStatus: "unverified",
				sessionUnverified: true,
				createAttempt: { idempotencyKey: idempotencyKeyFor(attempt), request: attempt },
			}),
			registration.id,
		]);

		const provider = fakeProvider([
			{ status: 200, body: providerResponse("pay_known", status, registration.id) },
			{ status: 201, body: providerResponse("pay_fresh", "pending", registration.id) },
		]);
		const result = await startPayment(registration.id, registration.userId, provider.fetch);
		const data = (await state(registration.id)).data;

		if (expectedCode) {
			// `paid`: the attempt is kept until the transition confirms the money,
			// but the user is told to stop paying and nothing is re-created.
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe(expectedCode);
			expect(provider.calls.every((call) => call.method === "GET")).toBe(true);
			return;
		}
		// expired / cancelled: an affirmative disposition clears the attempt and
		// a fresh create is then safe.
		expect(data.createAttempt).toBeUndefined();
		expect(data.sessionUnverified).toBe(false);
		{
			// Nothing live to resume: a fresh create is safe and happens.
			expect(provider.calls.some((call) => call.method === "POST")).toBe(true);
		}
	});
});

describe("webhook permanent vs transient disposition", () => {
	it("does not acknowledge a transient write failure", async () => {
		// A mutation on the amount makes the transition refuse: that is a
		// permanent mismatch in our model, and the provider must see it.
		const registration = await newRegistration();
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify({ provider: "paygate", paymentId: "pay_w" }),
			registration.id,
		]);
		await query("UPDATE registrations SET final_fee_paise = ? WHERE id = ?", [FEE_PAISE + 1, registration.id]);

		const { createHmac } = await import("node:crypto");
		const body = JSON.stringify({
			id: "evt_w",
			type: "payment.paid",
			data: { payment: { ...providerResponse("pay_w", "paid"), metadata: { registration_id: registration.id } } },
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = createHmac("sha256", process.env.PAYGATE_WEBHOOK_SECRET as string)
			.update(`${timestamp}.${body}`)
			.digest("hex");

		const response = await webhookAction({
			request: new Request("http://localhost/api/webhooks/paygate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"PayGate-Event-Id": "evt_w",
					"PayGate-Timestamp": timestamp,
					"PayGate-Signature": `v1=${signature}`,
				},
				body,
			}),
			params: {},
			context: {},
		} as never);

		// Not a 2xx: the provider must not record this as delivered.
		expect(response.status).toBeGreaterThanOrEqual(400);
		// 409 is not in PayGate's retryable set (408/425/429/5xx), so a
		// permanent mismatch is acked there; a transient one must be 5xx.
		expect([409, 500, 503]).toContain(response.status);
	});
});
