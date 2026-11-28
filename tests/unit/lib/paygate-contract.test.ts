/**
 * PayGate v4 merchant contract — create, status read and webhook parity.
 *
 * Every fixture here is shaped by the provider's own source
 * (`internal/v4/httpapi/merchant.go`, `internal/v4/payments/service.go`,
 * `internal/v4/webhooks/service.go`), so the test asserts the wire format we
 * actually send and accept rather than a convenient local idea of it.
 *
 * Runs against a real SQLite file; the provider is a fake `fetch`.
 */

import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const workDir = mkdtempSync(join(tmpdir(), "ieee-paygate-contract-"));
const dbPath = join(workDir, "test.db");

process.env.SQLITE_PATH = dbPath;
process.env.UPLOADS_DIR = join(workDir, "uploads");
process.env.APP_SECRET = "contract-test-secret-at-least-32-bytes-long";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYGATE_URL = "https://paygate.example.test";
process.env.PAYGATE_API_KEY = "contract-test-api-key-at-least-32-bytes!!";
process.env.PAYGATE_WEBHOOK_SECRET = "contract-webhook-secret-at-least-32-bytes";
process.env.PAYGATE_CLIENT_NAMESPACE = "local";
process.env.PAYGATE_STATUS_READ = "1";
// The integration guard refuses paid initiation unless the endpoint is declared a
// sandbox. These suites exercise the real initiation path, so they declare it.
process.env.PAYGATE_SANDBOX = "true";
process.env.NODE_ENV = "test";

interface Database {
	exec(sql: string): void;
	pragma(sql: string): unknown;
	prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
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
const { readProviderPayment, getConfig } = await import("@/server/payments/paygate");
const { classifyProviderFailure, providerFailureOf, ProviderHttpError } = await import(
	"@/server/payments/contract"
);
const { action: webhookAction } = await import("@/routes/api.webhooks.paygate");

const EVENT = "c2000000-0000-4000-8000-000000000001";
const SOCIETY = "c1000000-0000-4000-8000-000000000001";
const FEE_RUPEES = 500;
const FEE_PAISE = FEE_RUPEES * 100;
const FINGERPRINT_PAISE = 37;

let seq = 0;
async function rawDb(): Promise<Database> {
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath) as Database;
	db.pragma("foreign_keys = ON");
	return db;
}

async function createRegistration(input: {
	userId?: string;
	finalFeePaise?: number;
} = {}): Promise<{ id: string; userId: string; email: string }> {
	seq += 1;
	const id = `creg-${seq}`;
	const userId = input.userId ?? `cuser-${seq}`;
	const email = `${userId}@example.com`;
	const fee = input.finalFeePaise ?? FEE_PAISE;
	const now = new Date().toISOString();
	const db = await rawDb();
	db.prepare("INSERT OR IGNORE INTO users (id,email) VALUES (?,?)").run(userId, email);
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
		email,
		now,
		fee,
		fee,
		JSON.stringify({ provider: "paygate" }),
		now,
		now,
	);
	db.close();
	return { id, userId, email };
}

/** `merchantPaymentResponse`, exactly as `paymentResponse()` builds it. */
function paymentResponse(
	paymentId: string,
	status: string,
	registrationId: string,
	overrides: Record<string, unknown> = {},
) {
	const now = new Date("2026-11-24T12:00:00.000Z");
	const payable = FEE_PAISE + FINGERPRINT_PAISE;
	return {
		id: paymentId,
		object: "payment",
		name: "Sourav P Bijoy",
		external_id: EVENT,
		metadata: { registration_id: registrationId, environment: "local" },
		status,
		currency: "INR",
		requested_amount: `${FEE_RUPEES}.00`,
		payable_amount: `${FEE_RUPEES}.${String(FINGERPRINT_PAISE).padStart(2, "0")}`,
		adjustment: `0.${String(FINGERPRINT_PAISE).padStart(2, "0")}`,
		upi_uri: `upi://pay?pa=merchant%40upi&pn=Merchant&am=${FEE_RUPEES}.${String(FINGERPRINT_PAISE).padStart(2, "0")}&cu=INR&tn=PayGate%20${paymentId}`,
		transaction_note: `PayGate ${paymentId}`,
		created_at: now.toISOString(),
		expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
		grace_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
		paid_at: status === "paid" ? now.toISOString() : null,
		...overrides,
	};
}

interface Seen {
	method: string;
	url: string;
	headers: Headers;
	body: string;
}

/** A provider fake that records every request it receives. */
function provider(
	respond: (seen: Seen) => { status: number; body?: unknown; html?: boolean; headers?: Record<string, string> },
	fail?: "network" | "hang",
): { fetch: typeof fetch; calls: Seen[] } {
	const calls: Seen[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const seen: Seen = {
			method: String(init?.method ?? "GET"),
			url: String(input),
			headers: new Headers(init?.headers),
			body: String(init?.body ?? ""),
		};
		calls.push(seen);
		if (fail === "network") throw new TypeError("fetch failed");
		if (fail === "hang") await new Promise(() => undefined);
		const result = respond(seen);
		return new Response(result.html ? "<!doctype html><html>dashboard</html>" : JSON.stringify(result.body ?? {}), {
			status: result.status,
			headers: {
				"Content-Type": result.html ? "text/html; charset=utf-8" : "application/json",
				...(result.headers ?? {}),
			},
		});
	}) as typeof fetch;
	return { fetch: fetchImpl, calls };
}

async function paymentData(id: string): Promise<Record<string, unknown>> {
	const found = await query<{ payment_data: string | null; registration_status: string; payment_status: string }>(
		"SELECT payment_data, registration_status, payment_status FROM registrations WHERE id = ?",
		[id],
	);
	return { ...JSON.parse(String(found.rows[0]?.payment_data ?? "{}")), ...found.rows[0] };
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
	db.prepare("DELETE FROM users WHERE id LIKE 'cuser-%'").run();
	db.prepare("INSERT OR IGNORE INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)").run(
		SOCIETY,
		"Contract Society",
		"contract-society",
	);
	db.prepare(
		`INSERT OR IGNORE INTO events
		   (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise)
		 VALUES (?,?,?,?,'published','internal',1,50,?,?)`,
	).run(EVENT, "Contract Event", "contract-event", "2027-12-01T00:00:00.000Z", SOCIETY, FEE_PAISE);
	db.close();
});

afterAll(() => {
	closeDatabase();
	rmSync(workDir, { recursive: true, force: true });
});

describe("create request", () => {
	it("sends the strict v4 body to POST /v1/payments with a mandatory idempotency key", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({ status: 201, body: paymentResponse("pay_01J", "pending", registration.id) }));

		const result = await startPayment(registration.id, registration.userId, fake.fetch);

		expect(result.ok).toBe(true);
		const call = fake.calls[0];
		expect(call).toBeDefined();
		if (!call) throw new Error("no provider call recorded");
		expect(call.method).toBe("POST");
		expect(call.url).toBe("https://paygate.example.test/v1/payments");
		expect(call.headers.get("Content-Type")).toBe("application/json");
		expect(call.headers.get("Authorization")).toBe(`Bearer ${process.env.PAYGATE_API_KEY}`);
		expect(call.headers.get("Idempotency-Key")).toBeTruthy();

		// The provider decodes with DisallowUnknownFields and wants whole rupees.
		const body = JSON.parse(call.body);
		expect(body).toEqual({
			amount: FEE_RUPEES,
			name: "Sourav P Bijoy",
			external_id: EVENT,
			metadata: { registration_id: registration.id, environment: "local" },
		});
		expect(Object.keys(body).sort()).toEqual(["amount", "external_id", "metadata", "name"]);
	});

	it("persists the provider's decimal strings and expiry for the IEEE session", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({ status: 201, body: paymentResponse("pay_01J", "pending", registration.id) }));

		const result = await startPayment(registration.id, registration.userId, fake.fetch);
		if (!result.ok) throw new Error(result.error);

		// The frontend reads these exact fields.
		expect(result).toMatchObject({
			paymentRequired: true,
			paymentId: "pay_01J",
			providerStatus: "pending",
			amount: FEE_RUPEES,
			requestedAmountPaise: FEE_PAISE,
			payableAmountPaise: FEE_PAISE + FINGERPRINT_PAISE,
			payableAmount: `${FEE_RUPEES}.${String(FINGERPRINT_PAISE).padStart(2, "0")}`,
			transactionNote: "PayGate pay_01J",
			alreadyPaid: false,
		});
		expect(result.upiUri).toMatch(/^upi:\/\/pay\?/);
		expect(Number.isFinite(Date.parse(result.expiresAt))).toBe(true);
		expect(Number.isFinite(Date.parse(result.createdAt))).toBe(true);

		const stored = await paymentData(registration.id);
		expect(stored.providerStatus).toBe("pending");
		expect(stored.sessionUnverified).toBe(false);
	});

	it("treats a 200 replay as a valid resume, not an error", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({ status: 200, body: paymentResponse("pay_replay", "pending", registration.id) }));

		const result = await startPayment(registration.id, registration.userId, fake.fetch);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.paymentId).toBe("pay_replay");
	});

	it("refuses an HTML 200 without charging or cancelling anything", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({ status: 200, html: true }));

		const result = await startPayment(registration.id, registration.userId, fake.fetch);

		expect(result).toMatchObject({ ok: false, status: 503, code: "PAYGATE_VERIFYING", unverified: true });
		const stored = await paymentData(registration.id);
		// The exact attempt is remembered (key + DTO), with no id, so the next
		// call can only replay it idempotently — it cannot start a new charge.
		expect(stored.sessionUnverified).toBe(true);
		expect(stored.createAttempt).toMatchObject({
			idempotencyKey: expect.any(String),
			request: expect.objectContaining({ amount: FEE_RUPEES }),
		});
		expect(stored.paymentId).toBeFalsy();
		// Ambiguity never cancels a reservation.
		expect(stored.registration_status).toBe("pending");
		expect(stored.payment_status).toBe("pending");
	});

	it("keeps the idempotency key stable across retries but distinct per amount", () => {
		const registration = {
			id: "reg-1",
			event_id: EVENT,
			user_id: "u",
			user_name: "A",
			user_email: "a@example.com",
			registration_status: "pending",
			payment_status: "pending",
			ticket_id: null,
			payment_ticket_id: null,
			payment_data: null,
			final_fee_paise: FEE_PAISE,
			discount_paise: 0,
			base_fee_paise: FEE_PAISE,
			amount: null,
		};
		const fiveHundred = buildCreateBody(registration);
		const replayed = buildCreateBody({ ...registration });
		expect(idempotencyKeyFor(fiveHundred)).toBe(idempotencyKeyFor(replayed));

		const otherAmount = buildCreateBody({ ...registration, final_fee_paise: 300_00 });
		expect(idempotencyKeyFor(otherAmount)).not.toBe(idempotencyKeyFor(fiveHundred));
	});

	it("classifies every provider refusal the way the handler does", () => {
		expect(classifyProviderFailure(401, { error: { code: "unauthorized" } })).toBe("unauthorized");
		expect(classifyProviderFailure(400, { error: { code: "invalid_amount" } })).toBe("validation");
		expect(classifyProviderFailure(409, { error: { code: "idempotency_conflict" } })).toBe("conflict");
		expect(classifyProviderFailure(503, { error: { code: "collection_unavailable" } })).toBe("capacity");
		expect(classifyProviderFailure(503, { error: { code: "payment_capacity_unavailable" } })).toBe("capacity");
		expect(classifyProviderFailure(429, {})).toBe("rate_limited");
		expect(classifyProviderFailure(500, { error: { code: "internal_error" } })).toBe("unavailable");
	});

	it("turns a dead socket into an ambiguous failure, never a definitive one", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({ status: 201 }), "network");

		const result = await startPayment(registration.id, registration.userId, fake.fetch);
		expect(result).toMatchObject({ ok: false, code: "PAYGATE_VERIFYING", unverified: true });
		expect((await paymentData(registration.id)).registration_status).toBe("pending");
	});

	it("surfaces a provider capacity refusal without persisting a session", async () => {
		const registration = await createRegistration();
		const fake = provider(() => ({
			status: 503,
			body: { error: { code: "payment_capacity_unavailable", message: "…" } },
		}));

		const result = await startPayment(registration.id, registration.userId, fake.fetch);
		expect(result).toMatchObject({ ok: false, status: 503, code: "PAYGATE_NOT_AVAILABLE" });
		expect((await paymentData(registration.id)).sessionUnverified).toBeUndefined();
	});
});

describe("unverified create recovery", () => {
	/** An earlier create whose id reached us but whose answer did not. */
	async function seedUnverified(registrationId: string, paymentId: string) {
		// The same DTO `startPayment` would build for this registration, so the
		// held attempt matches and only the verification read happens.
		const request = {
			amount: FEE_RUPEES,
			name: "Sourav P Bijoy",
			external_id: EVENT,
			metadata: { registration_id: registrationId, environment: "local" },
		};
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify({
				provider: "paygate",
				paymentId,
				providerStatus: "unverified",
				sessionUnverified: true,
				createAttempt: {
					idempotencyKey: `ieee-paygate-local-${registrationId}-${FEE_RUPEES}`,
					request,
					requestedAt: new Date().toISOString(),
				},
			}),
			registrationId,
		]);
	}

	it("reuses the held session instead of creating a second charge", async () => {
		const registration = await createRegistration();
		await seedUnverified(registration.id, "pay_held");

		// Second attempt: the provider knows the payment, which is live.
		const second = provider(() => ({
			status: 200,
			body: paymentResponse("pay_held", "pending", registration.id),
		}));
		const result = await startPayment(registration.id, registration.userId, second.fetch);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.paymentId).toBe("pay_held");
		// It asked about the payment it may already hold — it did not POST again.
		expect(second.calls.map((call) => call.method)).toEqual(["GET"]);
		expect(second.calls[0]?.url).toBe("https://paygate.example.test/v1/payments/pay_held");
		expect((await paymentData(registration.id)).sessionUnverified).toBe(false);
	});

	it("does not create while the provider reports the payment as paid", async () => {
		const registration = await createRegistration();
		await seedUnverified(registration.id, "pay_held");

		const second = provider(() => ({ status: 200, body: paymentResponse("pay_held", "paid", registration.id) }));
		const result = await startPayment(registration.id, registration.userId, second.fetch);

		expect(result).toMatchObject({ ok: false, status: 409, code: "PAYMENT_AWAITING_CONFIRMATION" });
		expect(second.calls.every((call) => call.method === "GET")).toBe(true);
	});
});

describe("status read parity", () => {
	it("refuses an HTML 200 at the read path too", async () => {
		const fake = provider(() => ({ status: 200, html: true }));
		const read = await readProviderPayment("pay_1", { registrationId: "reg_1" }, fake.fetch, getConfig());
		expect(read.kind).toBe("unavailable");
	});

	it("does not turn a dropped socket into an answer", async () => {
		const fake = provider(() => ({ status: 200 }), "network");
		// The read may throw a transport error; what it must never do is pretend
		// it got an answer. Either shape is a non-answer to the caller.
		const outcome = await readProviderPayment("pay_1", { registrationId: "reg_1" }, fake.fetch, getConfig()).then(
			(read) => read.kind,
			(error: unknown) => providerFailureOf(error),
		);
		expect(["unavailable", "ambiguous", "transport_error"]).toContain(outcome);
	});
});

describe("webhook parity with the provider's delivery", () => {
	/**
	 * A delivery signed the way `internal/v4/webhooks/service.go` signs one, with
	 * the exact headers it sets (`PayGate-Event-Id` / `-Timestamp` /
	 * `PayGate-Signature: v1=<hex>`).
	 */
	function signedDelivery(
		body: unknown,
		options: { secret?: string; timestamp?: number; prefix?: "PayGate" | "X-PayGate" } = {},
	) {
		const raw = typeof body === "string" ? body : JSON.stringify(body);
		const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
		const secret = options.secret ?? (process.env.PAYGATE_WEBHOOK_SECRET as string);
		const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
		const prefix = options.prefix ?? "PayGate";
		return new Request("http://localhost/api/webhooks/paygate", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "PayGate/4",
				[`${prefix}-Event-Id`]: String((body as { id?: string }).id ?? ""),
				[`${prefix}-Timestamp`]: timestamp,
				[`${prefix}-Signature`]: `v1=${signature}`,
			},
			body: raw,
		});
	}

	/** `paymentEventPayloadAt`, as the provider builds it. */
	function delivery(eventType: string, registrationId: string, overrides: Record<string, unknown> = {}) {
		return {
			id: `evt_${eventType.replace(".", "_")}`,
			type: eventType,
			created_at: "2026-11-24T12:00:00.000Z",
			data: {
				payment: {
					id: "pay_01J",
					name: "Sourav P Bijoy",
					external_id: EVENT,
					status: eventType.replace("payment.", ""),
					requested_amount: `${FEE_RUPEES}.00`,
					payable_amount: `${FEE_RUPEES}.${String(FINGERPRINT_PAISE).padStart(2, "0")}`,
					metadata: { registration_id: registrationId, environment: "local" },
					transaction_note: "PayGate pay_01J",
					...overrides,
				},
			},
		};
	}

	async function seed() {
		const registration = await createRegistration();
		await query(
			`UPDATE registrations SET payment_data = ? WHERE id = ?`,
			[
				JSON.stringify({
					provider: "paygate",
					paymentId: "pay_01J",
					providerStatus: "pending",
					requestedAmountPaise: FEE_PAISE,
					payableAmountPaise: FEE_PAISE + FINGERPRINT_PAISE,
				}),
				registration.id,
			],
		);
		return registration;
	}

	it("accepts the provider's exact headers and envelope", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.paid", registration.id)),
			params: {},
			context: {},
		} as never);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true, action: "confirm" });
		expect((await paymentData(registration.id)).registration_status).toBe("confirmed");
	});

	it("still accepts the legacy X-PayGate-* header names", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.paid", registration.id), { prefix: "X-PayGate" }),
			params: {},
			context: {},
		} as never);
		expect(response.status).toBe(200);
		expect((await paymentData(registration.id)).registration_status).toBe("confirmed");
	});

	it("rejects a body signed with another secret before touching the database", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.paid", registration.id), {
				secret: "not-our-secret-not-our-secret-32chars",
			}),
			params: {},
			context: {},
		} as never);
		expect(response.status).toBe(400);
		expect((await paymentData(registration.id)).registration_status).toBe("pending");
	});

	it("answers a non-retryable 4xx for an event type it cannot interpret", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.refunded", registration.id)),
			params: {},
			context: {},
		} as never);
		// 4xx is not in PayGate's retryable set, so it stops after one attempt
		// and stays visible, instead of burning eight retries over two days.
		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ code: "PAYGATE_EVENT_UNHANDLED" });
	});

	it("acknowledges a v4 payment.pending delivery without changing the reservation", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.pending", registration.id)),
			params: {},
			context: {},
		} as never);
		// v4 emits this on create. It concerns us (it names our registration),
		// so it is acked; it carries no transition, so nothing moves.
		expect(response.status).toBe(200);
		const row = await paymentData(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});

	it("answers 409, not 400, for an authenticated event naming another event", async () => {
		const registration = await seed();
		const response = await webhookAction({
			request: signedDelivery(delivery("payment.paid", registration.id, { external_id: "some-other-event" })),
			params: {},
			context: {},
		} as never);
		expect(response.status).toBe(409);
	});
});
