/**
 * Webhook disposition, pinned to the provider's delivery semantics.
 *
 * From `internal/v4/webhooks/service.go`:
 *
 *   - 2xx            -> `delivered`
 *   - 4xx (not 408/425/429, and not exhausted) -> `exhausted`, never retried
 *   - 408/425/429/5xx -> `retry` with backoff (1m … 24h), up to 8 attempts
 *   - an operator can re-queue `retry`/`exhausted` from the Activity log
 *
 * So the receiver's job is to avoid two mistakes: acknowledging (2xx) an event
 * whose state we failed to apply, and burning the whole retry budget on a
 * rejection that can never succeed.
 *
 * Transient means *retry me later*: 429 and 5xx. Permanent means *this will
 * never apply; stop retrying*: 4xx without retry semantics. PayGate does not
 * retry a 4xx, so a 4xx is the honest "do not retry" answer, and the provider
 * records it in Activity for an operator.
 */

import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const workDir = mkdtempSync(join(tmpdir(), "ieee-paygate-disposition-"));
const dbPath = join(workDir, "test.db");

process.env.SQLITE_PATH = dbPath;
process.env.UPLOADS_DIR = join(workDir, "uploads");
process.env.APP_SECRET = "disposition-test-secret-at-least-32-bytes";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYGATE_URL = "https://paygate.example.test";
process.env.PAYGATE_API_KEY = "disposition-test-api-key-at-least-32b";
process.env.PAYGATE_WEBHOOK_SECRET = "disposition-webhook-secret-32-bytes!!";
process.env.PAYGATE_CLIENT_NAMESPACE = "local";
// The integration guard refuses paid initiation unless the endpoint is declared a
// sandbox. This suite exercises the real initiation path, so it declares it.
process.env.PAYGATE_SANDBOX = "true";
process.env.NODE_ENV = "test";

{
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.exec("BEGIN IMMEDIATE");
	db.exec(readFileSync(resolve("sqlite/schema.sql"), "utf8"));
	db.pragma("user_version = 1");
	db.exec("COMMIT");
	db.close();
}

const { query, closeDatabase } = await import("@/lib/db.server");
const { action: webhookAction } = await import("@/routes/api.webhooks.paygate");

const EVENT = "e2000000-0000-4000-8000-000000000001";
const SOCIETY = "e1000000-0000-4000-8000-000000000001";
const FEE_PAISE = 50_000;

let seq = 0;
async function makeRegistration(): Promise<{ id: string; eventId: string }> {
	seq += 1;
	const id = `dreg-${seq}`;
	const userId = `duser-${seq}`;
	const now = new Date().toISOString();
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath);
	db.pragma("foreign_keys = ON");
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
		"Attendee",
		`${userId}@example.com`,
		now,
		FEE_PAISE,
		FEE_PAISE,
		JSON.stringify({ provider: "paygate", paymentId: "pay_d", providerStatus: "pending" }),
		now,
		now,
	);
	db.close();
	return { id, eventId: EVENT };
}

function paidDelivery(registrationId: string, overrides: Record<string, unknown> = {}) {
	return {
		id: "evt_d",
		type: "payment.paid",
		created_at: "2026-11-24T12:00:00.000Z",
		data: {
			payment: {
				id: "pay_d",
				name: "Attendee",
				external_id: EVENT,
				status: "paid",
				requested_amount: `${FEE_PAISE / 100}.00`,
				payable_amount: `${FEE_PAISE / 100}.37`,
				metadata: { registration_id: registrationId, environment: "local" },
				transaction_note: "PayGate pay_d",
				...overrides,
			},
		},
	};
}

async function send(body: unknown, options: { signature?: string } = {}) {
	const raw = JSON.stringify(body);
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature =
		options.signature ??
		`v1=${createHmac("sha256", process.env.PAYGATE_WEBHOOK_SECRET as string)
			.update(`${timestamp}.${raw}`)
			.digest("hex")}`;
	return webhookAction({
		request: new Request("http://localhost/api/webhooks/paygate", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"PayGate-Event-Id": String((body as { id?: string }).id ?? ""),
				"PayGate-Timestamp": timestamp,
				"PayGate-Signature": signature,
			},
			body: raw,
		}),
		params: {},
		context: {},
	} as never);
}

beforeAll(async () => {
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath);
	db.pragma("foreign_keys = ON");
	db.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)").run(
		SOCIETY,
		"Disposition Society",
		"disposition-society",
	);
	db.prepare(
		`INSERT INTO events
		   (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise)
		 VALUES (?,?,?,?,'published','internal',1,50,?,?)`,
	).run(EVENT, "Disposition Event", "disposition-event", "2027-12-01T00:00:00.000Z", SOCIETY, FEE_PAISE);
	db.close();
});

beforeEach(async () => {
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath);
	db.pragma("foreign_keys = ON");
	const scope = "(SELECT id FROM registrations WHERE event_id = ?)";
	db.prepare(`DELETE FROM attendance_records WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM payments WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM notification_outbox WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare(`DELETE FROM admin_audit_log WHERE registration_id IN ${scope}`).run(EVENT);
	db.prepare("DELETE FROM registrations WHERE event_id = ?").run(EVENT);
	db.prepare("DELETE FROM users WHERE id LIKE 'duser-%'").run();
	db.close();
});

afterAll(() => {
	closeDatabase();
	rmSync(workDir, { recursive: true, force: true });
});

describe("unauthenticated deliveries", () => {
	it("are refused with a 4xx, which the provider does not retry", async () => {
		const registration = await makeRegistration();
		const response = await send(paidDelivery(registration.id), { signature: "v1=deadbeef" });
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});

describe("authenticated deliveries we cannot yet apply", () => {
	it("a permanent mismatch is a 4xx (never retried) and is recorded", async () => {
		const registration = await makeRegistration();
		await query("UPDATE registrations SET final_fee_paise = ? WHERE id = ?", [FEE_PAISE + 1, registration.id]);

		const response = await send(paidDelivery(registration.id));
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
		// The event did not become "delivered" in our state either.
		const row = await query<{ registration_status: string }>(
			"SELECT registration_status FROM registrations WHERE id = ?",
			[registration.id],
		);
		expect(row.rows[0]?.registration_status).toBe("pending");
	});

	it("an unknown event type is a 4xx so it is visible rather than silently dropped", async () => {
		const registration = await makeRegistration();
		const response = await send({ ...paidDelivery(registration.id), id: "evt_x", type: "payment.refunded" });
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});

	it("answers 200 only for events that genuinely do not concern us", async () => {
		const body = paidDelivery("some-other-registration");
		delete (body.data.payment.metadata as Record<string, unknown>).registration_id;
		const response = await send(body);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ reason: "no_registration" });
	});
});

describe("transient failures are never acknowledged", () => {
	it("a database write failure answers 5xx, so the provider retries", async () => {
		const registration = await makeRegistration();
		// Simulate a storage failure at the point of the transition.
		const dbModule = await import("@/lib/db.server");
		const original = dbModule.withTransaction;
		const spy = vi
			.spyOn(dbModule, "withTransaction")
			.mockRejectedValueOnce(new Error("SQLITE_BUSY: database is locked"));

		try {
			const response = await send(paidDelivery(registration.id));
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({ code: "PAYGATE_WEBHOOK_FAILED" });
			const row = await query<{ registration_status: string }>(
				"SELECT registration_status FROM registrations WHERE id = ?",
				[registration.id],
			);
			expect(row.rows[0]?.registration_status).toBe("pending");
		} finally {
			spy.mockRestore();
			expect(dbModule.withTransaction).toBe(original);
		}
	});

	it("a duplicate that lost the race is acked, not retried forever", async () => {
		const registration = await makeRegistration();
		const first = await send(paidDelivery(registration.id));
		expect(first.status).toBe(200);
		// Same delivery again: recognised as processed, acknowledged.
		const second = await send(paidDelivery(registration.id));
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ message: "Already processed" });
	});
});
