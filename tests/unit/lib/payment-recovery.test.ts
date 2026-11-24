/**
 * Defensive payment recovery — the paths that must not depend on a webhook.
 *
 * Runs against a real SQLite file (the same bootstrap `tests/integration-db.mjs`
 * uses) and a fake PayGate whose payloads are shaped by the provider's own v4
 * source (`GET /v1/payments/{id}`, snake_case amounts as `"100.37"` strings, no
 * `metadata.environment` echo), so nothing leaves the machine:
 *
 *   - a lost webhook is recovered by the batch pass's provider read;
 *   - a reservation the provider still holds is never released from local state,
 *     and a 404 is not an answer: only an affirmative provider response may
 *     release or confirm;
 *   - an unavailable provider keeps the seat and the next pass still works;
 *   - a late payment after release is parked for review, not resurrected;
 *   - parallel duplicate deliveries produce exactly one transition and one
 *     set of outbox rows.
 */

import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const workDir = mkdtempSync(join(tmpdir(), "ieee-payment-recovery-"));
const dbPath = join(workDir, "test.db");

process.env.SQLITE_PATH = dbPath;
process.env.UPLOADS_DIR = join(workDir, "uploads");
process.env.APP_SECRET = "recovery-test-secret-at-least-32-bytes-long";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYGATE_URL = "https://paygate.example.test";
process.env.PAYGATE_API_KEY = "recovery-test-api-key-at-least-32-bytes!!";
process.env.PAYGATE_WEBHOOK_SECRET = "recovery-webhook-secret-at-least-32-bytes";
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
const { reconcileExpiredRegistrations, isProviderPollDue } = await import("@/server/payments/reconcile");
const { syncRegistrationWithProvider, applyProviderPaymentToRegistration } = await import(
	"@/server/payments/apply"
);
const { readProviderPayment, getConfig, normalizeProviderPayment, statusReadEnabled, PAYGATE_STATUS_PATH } =
	await import("@/server/payments/paygate");
const { action: webhookAction } = await import("@/routes/api.webhooks.paygate");

const EVENT = "a2000000-0000-4000-8000-000000000001";
const SOCIETY = "a1000000-0000-4000-8000-000000000001";
const FEE_PAISE = 50_000;
const PAYABLE_PAISE = FEE_PAISE + 37;

let seq = 0;
function nextId(prefix: string): string {
	seq += 1;
	return `${prefix}-${seq}`;
}

async function rawDb(): Promise<Database> {
	const { default: BetterSqlite } = await import("better-sqlite3");
	const db = new BetterSqlite(dbPath) as Database;
	db.pragma("foreign_keys = ON");
	return db;
}

/**
 * A pending paid registration, written the way `createRegistration` writes one:
 * pending/pending with the provider and a session id already recorded.
 */
async function createPending(input: {
	paymentId?: string | null;
	providerStatus?: string;
	expiresAt?: string;
	registrationDate?: string;
	userId?: string;
}): Promise<{ id: string; userId: string; paymentId: string }> {
	const id = nextId("reg");
	const userId = input.userId ?? nextId("user");
	// `null` means "never initialised": no session at the provider.
	const paymentId = input.paymentId === null ? "" : (input.paymentId ?? nextId("pay"));
	const registrationDate = input.registrationDate ?? new Date().toISOString();

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
		"Recovery Tester",
		`${userId}@example.com`,
		registrationDate,
		FEE_PAISE,
		FEE_PAISE,
		JSON.stringify({
			provider: "paygate",
			paymentId,
			providerStatus: input.providerStatus ?? "pending",
			requestedAmountPaise: FEE_PAISE,
			payableAmountPaise: PAYABLE_PAISE,
			payableAmount: PAYABLE_PAISE / 100,
			expiresAt: input.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
			upiUri: `upi://pay?pa=ieee%40upi&am=${PAYABLE_PAISE / 100}&cu=INR&tn=PayGate%20${paymentId}`,
			transactionNote: `PayGate ${paymentId}`,
			lastSyncedAt: input.registrationDate ?? new Date().toISOString(),
		}),
		registrationDate,
		registrationDate,
	);
	db.close();
	return { id, userId, paymentId };
}

/**
 * The provider's real GET shape, from `internal/v4/httpapi/merchant.go`:
 * snake_case money strings, `metadata` echoed verbatim, and **no**
 * `metadata.environment` (PayGate does not know it).
 */
function providerBody(
	paymentId: string,
	status: string,
	registrationId: string,
	extra: Record<string, unknown> = {},
) {
	const now = new Date();
	return {
		id: paymentId,
		object: "payment",
		name: "Recovery Tester",
		external_id: EVENT,
		metadata: { registration_id: registrationId },
		status,
		currency: "INR",
		// PayGate's own arithmetic: the *requested* amount is the clean fee and
		// the fingerprint lives in `payable_amount` only.
		requested_amount: `${FEE_PAISE / 100}.00`,
		payable_amount: `${FEE_PAISE / 100}.${String(PAYABLE_PAISE - FEE_PAISE).padStart(2, "0")}`,
		adjustment: "0.37",
		upi_uri: `upi://pay?pa=ieee%40upi&am=${PAYABLE_PAISE / 100}&cu=INR&tn=PayGate%20${paymentId}`,
		transaction_note: `PayGate ${paymentId}`,
		created_at: now.toISOString(),
		expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
		grace_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
		paid_at: status === "paid" ? now.toISOString() : null,
		...extra,
	};
}

/** Route the fake the way the provider does: fixed `/v1/payments/{id}` only. */
function paygateFetch(
	respond: (
		paymentId: string,
		url: string,
		headers: Headers,
	) => { status: number; body?: unknown; headers?: Record<string, string> },
	options: { signalRespecting?: boolean } = {},
): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		expect(url.startsWith(`https://paygate.example.test${PAYGATE_STATUS_PATH}/`)).toBe(true);
		if (init?.signal?.aborted) throw new Error("aborted");
		const headers = new Headers(init?.headers);
		const result = respond(decodeURIComponent(url.split("/").pop() ?? ""), url, headers);
		if (options.signalRespecting === false) {
			await new Promise(() => undefined);
		}
		return new Response(JSON.stringify(result.body ?? {}), {
			status: result.status,
			headers: { "Content-Type": "application/json", ...(result.headers ?? {}) },
		});
	}) as typeof fetch;
}

async function registrationState(id: string): Promise<Record<string, unknown>> {
	const found = await query<Record<string, unknown>>("SELECT * FROM registrations WHERE id = ?", [id]);
	const row = found.rows[0];
	if (!row) throw new Error(`registration ${id} is missing`);
	return row;
}

async function outboxFor(id: string) {
	const found = await query<{ kind: string }>(
		"SELECT kind FROM notification_outbox WHERE registration_id = ? ORDER BY kind",
		[id],
	);
	return found.rows.map((row) => row.kind);
}

/**
 * A probe that answers with the provider's real body shape. `expiredLongAgo`
 * makes the provider's own `expires_at` old, which is what a session that
 * closed hours ago actually looks like.
 */
function okProbe(status: string, options: { expiredLongAgo?: boolean } = {}) {
	return async (row: { id: string; payment_data: string | null }) => {
		const paymentId = String(JSON.parse(String(row.payment_data)).paymentId ?? "");
		const expiresAt = options.expiredLongAgo
			? new Date(Date.now() - 60 * 60_000).toISOString()
			: undefined;
		return {
			kind: "ok" as const,
			payment: normalizeProviderPayment(
				providerBody(paymentId, status, row.id, expiresAt ? { expires_at: expiresAt } : {}),
			) as never,
		};
	};
}

beforeEach(async () => {
	// One published paid event for every case.
	const db = await rawDb();
	// Earlier cases leave pending rows behind, and the batch pass scans every
	// one of them. Reset the per-test reservation state so each case sees only
	// its own row (the event and society stay).
	db.prepare("DELETE FROM attendance_records WHERE registration_id IN (SELECT id FROM registrations WHERE event_id = ?)").run(EVENT);
	db.prepare("DELETE FROM payments WHERE registration_id IN (SELECT id FROM registrations WHERE event_id = ?)").run(EVENT);
	db.prepare("DELETE FROM notification_outbox WHERE registration_id IN (SELECT id FROM registrations WHERE event_id = ?)").run(EVENT);
	db.prepare("UPDATE event_waitlist SET accepted_registration = NULL WHERE accepted_registration IN (SELECT id FROM registrations WHERE event_id = ?)").run(EVENT);
	db.prepare("DELETE FROM registrations WHERE event_id = ?").run(EVENT);
	db.prepare("DELETE FROM users WHERE id LIKE 'user-%'").run();
	db.prepare("INSERT OR IGNORE INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)").run(
		SOCIETY,
		"Recovery Society",
		"recovery-society",
	);
	db.prepare(
		`INSERT OR IGNORE INTO events
		   (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise)
		 VALUES (?,?,?,?,'published','internal',1,50,?,?)`,
	).run(EVENT, "Recovery Event", "recovery-event", "2027-12-01T00:00:00.000Z", SOCIETY, FEE_PAISE);
	db.close();
});

afterAll(() => {
	closeDatabase();
	rmSync(workDir, { recursive: true, force: true });
});

describe("lost webhook recovery", () => {
	it("confirms a paid reservation the reconciliation pass reads from the provider", async () => {
		const registration = await createPending({});
		const reads: string[] = [];
		const probe = okProbe("paid");

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async (row) => {
				reads.push(String(JSON.parse(String(row.payment_data)).paymentId));
				return probe(row);
			},
		});

		expect(reads).toEqual([registration.paymentId]);
		expect(result.confirmed).toBe(1);
		expect(result.released).toBe(0);
		expect(result.confirmedIds).toContain(registration.id);

		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("confirmed");
		expect(row.payment_status).toBe("paid");
		expect(String(row.ticket_id)).toMatch(/^TKT-/);
		// The delivery intent commits with the confirmation, not after it.
		expect(await outboxFor(registration.id)).toEqual(["receipt", "ticket"]);

		const ledger = await query<{ status: string; collected_paise: number }>(
			"SELECT status, collected_paise FROM payments WHERE registration_id = ?",
			[registration.id],
		);
		expect(ledger.rows[0]?.status).toBe("captured");
		expect(ledger.rows[0]?.collected_paise).toBe(PAYABLE_PAISE);
	});

	it("recovers the same payment through the attendee refresh, at the real read path", async () => {
		const registration = await createPending({});
		const fetchImpl = paygateFetch((paymentId) => ({
			status: 200,
			body: providerBody(paymentId, "paid", registration.id),
		}));

		const sync = await syncRegistrationWithProvider(registration.id, { fetchImpl });
		expect(sync.providerReachable).toBe(true);
		expect(sync.state.action).toBe("confirm");

		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("confirmed");
		expect(row.payment_status).toBe("paid");
	});
});

describe("only an affirmative provider answer may end a reservation", () => {
	const longAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

	it("keeps the seat when the provider still reports pending, however old the row is", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: okProbe("pending"),
		});

		expect(result.released).toBe(0);
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});

	it("releases only after the provider says expired and the grace window has passed", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			graceSeconds: 600,
			probeProvider: okProbe("expired", { expiredLongAgo: true }),
		});

		expect(result.released).toBe(1);
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("cancelled");
		expect(row.payment_status).toBe("failed");
		expect(JSON.parse(String(row.payment_data)).releaseReason).toMatch(/expired/i);

		const auditRows = await query<{ action: string }>(
			"SELECT action FROM admin_audit_log WHERE registration_id = ?",
			[registration.id],
		);
		expect(auditRows.rows.map((r) => r.action)).toContain("payment.expiry-release");
	});

	it("releases on an affirmative cancelled state", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: okProbe("cancelled"),
		});

		// `applyProviderState` cancels the registration on `payment.cancelled`
		// itself, so the release loop is never reached — the outcome is the same
		// cancel, from the affirmative provider state rather than from grace.
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("cancelled");
		expect(row.payment_status).toBe("failed");
		expect(result.released).toBe(0);
	});

	it("does not release an expired payment before its grace window", async () => {
		const registration = await createPending({
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			graceSeconds: 600,
			probeProvider: okProbe("expired"),
		});

		expect(result.released).toBe(0);
		expect((await registrationState(registration.id)).registration_status).toBe("pending");
	});

	it("releases a reservation that never reached the provider, after grace", async () => {
		const registration = await createPending({
			paymentId: null,
			providerStatus: "not_initialized",
			registrationDate: longAgo,
		});

		const result = await reconcileExpiredRegistrations({ now: Date.now(), random: () => 0 });

		expect(result.releasedIds).toContain(registration.id);
		expect((await registrationState(registration.id)).registration_status).toBe("cancelled");
	});

	it("never releases an initialised reservation on a 404 — it may be the wrong path or scope", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async () => ({ kind: "not_found" }),
		});

		expect(result.released).toBe(0);
		expect(result.keptForProvider).toBe(1);
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});

	it("never releases an initialised reservation on a 404 through the attendee refresh", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});
		const fetchImpl = paygateFetch(() => ({ status: 404, body: { error: { code: "payment_not_found" } } }));

		const sync = await syncRegistrationWithProvider(registration.id, { fetchImpl });

		expect(sync.probablyExpired).toBe(false);
		expect(sync.state.retry).toBe(true);
		expect((await registrationState(registration.id)).registration_status).toBe("pending");
	});

	it("never releases on a 401 from a scoped or rotated key", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});
		const fetchImpl = paygateFetch(() => ({ status: 401, body: { error: { code: "unauthorized" } } }));

		const sync = await syncRegistrationWithProvider(registration.id, { fetchImpl });

		expect(sync.providerReachable).toBe(false);
		expect(sync.state.retry).toBe(true);
		expect((await registrationState(registration.id)).registration_status).toBe("pending");
	});
});

describe("late and duplicated provider events", () => {
	it("parks a payment that arrives after the seat was released, and never resurrects it", async () => {
		const registration = await createPending({ registrationDate: new Date().toISOString() });
		await query(
			"UPDATE registrations SET registration_status = 'cancelled', payment_status = 'failed' WHERE id = ?",
			[registration.id],
		);

		const state = await applyProviderPaymentToRegistration({
			registrationId: registration.id,
			payment: normalizeProviderPayment(providerBody(registration.paymentId, "paid", registration.id)) as never,
			eventType: "payment.paid",
			eventId: "evt_late",
			revalidate: false,
		});

		expect(state.action).toBe("manual_review");
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("cancelled");
		expect(row.payment_status).toBe("failed");
		expect(JSON.parse(String(row.payment_data)).manualReview).toBe(true);
		expect(await outboxFor(registration.id)).toEqual([]);
	});

	it("applies one transition for parallel duplicate deliveries", async () => {
		const registration = await createPending({});
		const payment = normalizeProviderPayment(providerBody(registration.paymentId, "paid", registration.id)) as never;

		const results = await Promise.all([
			applyProviderPaymentToRegistration({
				registrationId: registration.id,
				payment,
				eventType: "payment.paid",
				eventId: "",
				revalidate: false,
			}),
			applyProviderPaymentToRegistration({
				registrationId: registration.id,
				payment,
				eventType: "payment.paid",
				eventId: "",
				revalidate: false,
			}),
			reconcileExpiredRegistrations({
				now: Date.now(),
				random: () => 0,
				probeProvider: async () => ({ kind: "ok", payment }),
			}),
		]);

		const actions = results
			.slice(0, 2)
			.map((entry) => (entry as { action: string }).action)
			.sort();
		expect(actions).toEqual(["confirm", "noop"]);
		expect(await outboxFor(registration.id)).toEqual(["receipt", "ticket"]);

		const ledger = await query<{ n: number }>(
			"SELECT count(*) AS n FROM payments WHERE registration_id = ?",
			[registration.id],
		);
		expect(ledger.rows[0]?.n).toBe(1);
	});

	it("applies one transition for a replayed signed webhook", async () => {
		const registration = await createPending({});
		const body = JSON.stringify({
			id: "evt_replay_1",
			type: "payment.paid",
			data: { payment: providerBody(registration.paymentId, "paid", registration.id) },
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const secret = process.env.PAYGATE_WEBHOOK_SECRET as string;
		const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
		const makeRequest = () =>
			new Request("http://localhost/api/webhooks/paygate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-PayGate-Event-Id": "evt_replay_1",
					"X-PayGate-Timestamp": timestamp,
					"X-PayGate-Signature": `v1=${signature}`,
				},
				body,
			});

		const first = await webhookAction({ request: makeRequest(), params: {}, context: {} } as never);
		const second = await webhookAction({ request: makeRequest(), params: {}, context: {} } as never);

		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ action: "confirm" });
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ message: "Already processed" });
		expect(await outboxFor(registration.id)).toEqual(["receipt", "ticket"]);
	});
});

describe("provider failure keeps the reservation and lets the next pass work", () => {
	const longAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

	it.each([
		["unavailable", { kind: "unavailable", reason: "status_503" }],
		["rate limited", { kind: "rate_limited", retryAfterMs: 10_000 }],
		["timed out", { kind: "unavailable", reason: "timeout" }],
		["not found", { kind: "not_found" }],
		["contradictory", { kind: "invalid", error: "PayGate registration identity mismatch" }],
	])("keeps the seat when the provider is %s", async (_label, read) => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async () => read as never,
		});

		expect(result.released).toBe(0);
		expect(result.keptForProvider).toBe(1);
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});

	it("releases on the next pass once the provider answers expired, not before", async () => {
		const registration = await createPending({
			registrationDate: longAgo,
			expiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		});

		const failed = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async () => ({ kind: "unavailable", reason: "status_502" }),
		});
		expect(failed.released).toBe(0);

		const recovered = await reconcileExpiredRegistrations({
			now: Date.now() + 60_000,
			random: () => 0,
			probeProvider: async () => ({
				kind: "ok",
				payment: normalizeProviderPayment(
					providerBody(registration.paymentId, "expired", registration.id, {
						expires_at: new Date(Date.now() - 60 * 60_000).toISOString(),
					}),
				) as never,
			}),
		});
		expect(recovered.released).toBe(1);
	});

	it("does not let a throwing probe break the pass", async () => {
		const registration = await createPending({ registrationDate: longAgo });
		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async () => {
				throw new Error("socket hang up");
			},
		});
		expect(result.keptForProvider).toBe(1);
		expect((await registrationState(registration.id)).registration_status).toBe("pending");
	});

	it("stops starting reads once the pass budget is spent", async () => {
		const registrations = await Promise.all([createPending({}), createPending({}), createPending({})]);
		let reads = 0;
		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			pollBudgetMs: 1_000,
			probeProvider: async (row) => {
				reads += 1;
				// The first read is slow enough to exhaust the whole budget.
				await new Promise((resolve) => setTimeout(resolve, 1_100));
				return okProbe("pending")(row);
			},
		});
		expect(reads).toBe(1);
		expect(result.scanned).toBe(registrations.length);
	});
});

describe("bounded, validated provider read at the provider's real path", () => {
	it("calls GET /v1/payments/{id} with the bearer key and decodes the v4 body", async () => {
		const seen: { value: Headers | null } = { value: null };
		const read = await readProviderPayment(
			"pay_01JABC",
			{ registrationId: "reg_1", expectedAmountRupees: FEE_PAISE / 100 },
			paygateFetch((paymentId, _url, headers) => {
				seen.value = headers;
				return { status: 200, body: providerBody(paymentId, "paid", "reg_1") };
			}),
			getConfig(),
		);
		expect(read).toMatchObject({ kind: "ok" });
		expect(seen.value?.get("Authorization")).toBe(`Bearer ${process.env.PAYGATE_API_KEY}`);
		expect(seen.value?.get("Accept")).toBe("application/json");
		if (read.kind === "ok") {
			expect(read.payment.requestedAmountPaise).toBe(FEE_PAISE);
			expect(read.payment.payableAmountPaise).toBe(PAYABLE_PAISE);
			expect(read.payment.metadata.registration_id).toBe("reg_1");
			expect(read.payment.externalId).toBe(EVENT);
		}
	});

	it("accepts the body although the provider does not echo metadata.environment", async () => {
		const read = await readProviderPayment(
			"pay_01JABC",
			{ registrationId: "reg_1", environment: "local" },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "paid", "reg_1") })),
			getConfig(),
		);
		expect(read.kind).toBe("ok");
	});

	it("returns unavailable instead of hanging when the transport ignores the abort signal", async () => {
		const started = Date.now();
		const read = await readProviderPayment(
			"pay_slow_0001",
			{ registrationId: "reg_1" },
			paygateFetch(() => ({ status: 200 }), { signalRespecting: false }),
			getConfig(),
			50,
		);
		// A timeout says nothing about whether the provider saw the request.
		expect(read).toEqual({ kind: "ambiguous", reason: "timeout" });
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it("maps 429 and 404 to their own outcomes", async () => {
		const config = getConfig();
		const limited = await readProviderPayment(
			"pay_1",
			{},
			paygateFetch(() => ({ status: 429, headers: { "Retry-After": "3" } })),
			config,
		);
		expect(limited).toEqual({ kind: "rate_limited", retryAfterMs: 3_000 });
		// A 404 is a non-answer, never "the payment is gone".
		const missing = await readProviderPayment("pay_2", {}, paygateFetch(() => ({ status: 404 })), config);
		expect(missing).toEqual({ kind: "unavailable", reason: "not_found" });
	});

	it("refuses a response that disagrees on identity or amount", async () => {
		const config = getConfig();
		const wrongRegistration = await readProviderPayment(
			"pay_1",
			{ registrationId: "reg_other" },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "paid", "reg_1") })),
			config,
		);
		expect(wrongRegistration.kind).toBe("invalid");

		const wrongAmount = await readProviderPayment(
			"pay_1",
			{ registrationId: "reg_1", expectedAmountRupees: 999 },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "paid", "reg_1") })),
			config,
		);
		expect(wrongAmount.kind).toBe("invalid");

		const wrongPayment = await readProviderPayment(
			"pay_other",
			{ paymentId: "pay_expected", registrationId: "reg_1" },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "paid", "reg_1") })),
			config,
		);
		expect(wrongPayment.kind).toBe("invalid");

		const wrongEvent = await readProviderPayment(
			"pay_1",
			{ externalId: "another_event", registrationId: "reg_1" },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "paid", "reg_1") })),
			config,
		);
		expect(wrongEvent.kind).toBe("invalid");
	});

	it("refuses a status the provider does not publish", async () => {
		const read = await readProviderPayment(
			"pay_1",
			{ registrationId: "reg_1" },
			paygateFetch((paymentId) => ({ status: 200, body: providerBody(paymentId, "review", "reg_1") })),
			getConfig(),
		);
		expect(read.kind).toBe("invalid");
	});

	it("is disabled unless explicitly enabled", async () => {
		const previous = process.env.PAYGATE_STATUS_READ;
		delete process.env.PAYGATE_STATUS_READ;
		try {
			expect(statusReadEnabled(getConfig())).toBe(false);
			let called = false;
			const read = await readProviderPayment(
				"pay_1",
				{},
				paygateFetch(() => {
					called = true;
					return { status: 200 };
				}),
				getConfig(),
			);
			expect(read).toEqual({ kind: "disabled" });
			expect(called).toBe(false);
		} finally {
			process.env.PAYGATE_STATUS_READ = previous;
		}
	});
});

describe("poll scheduling", () => {
	const now = Date.parse("2026-11-24T12:00:00.000Z");

	it("does not poll a healthy checkout that is nowhere near expiry", () => {
		expect(
			isProviderPollDue({
				paymentData: {
					provider: "paygate",
					providerStatus: "pending",
					expiresAt: "2026-11-24T12:15:00.000Z",
					providerPolledAt: "2026-11-24T11:59:00.000Z",
				},
				nowMs: now,
				graceSeconds: 60,
			}),
		).toBe(false);
	});

	it("polls near expiry and respects the per-payment interval", () => {
		// Session creation also stamps `lastSyncedAt`; it must not delay the first read.
		const due = isProviderPollDue({
			paymentData: {
				provider: "paygate",
				providerStatus: "pending",
				expiresAt: "2026-11-24T12:01:00.000Z",
				lastSyncedAt: "2026-11-24T11:59:59.000Z",
			},
			nowMs: now,
			graceSeconds: 60,
		});
		expect(due).toBe(true);
		expect(
			isProviderPollDue({
				paymentData: {
					provider: "paygate",
					providerStatus: "pending",
					expiresAt: "2026-11-24T12:01:00.000Z",
					providerPolledAt: "2026-11-24T11:59:50.000Z",
				},
				nowMs: now,
				graceSeconds: 60,
			}),
		).toBe(false);
	});
});

describe("rows that predate the provider read", () => {
	// A reservation initialised before this change carries no `providerPolledAt`
	// and may be hours old. Whatever the provider says — or fails to say — the
	// seat must not be released on anything but an affirmative answer.
	const hoursOld = new Date(Date.now() - 6 * 60 * 60_000).toISOString();

	it("holds, and never reads, when the provider read is switched off (the default)", async () => {
		const previous = process.env.PAYGATE_STATUS_READ;
		delete process.env.PAYGATE_STATUS_READ;
		try {
			const registration = await createPending({ registrationDate: hoursOld, expiresAt: hoursOld });
			const result = await reconcileExpiredRegistrations({ now: Date.now(), random: () => 0 });
			expect(result.released).toBe(0);
			expect(result.readsDisabled).toBeGreaterThanOrEqual(1);
			const row = await registrationState(registration.id);
			expect(row.registration_status).toBe("pending");
			expect(row.payment_status).toBe("pending");
		} finally {
			process.env.PAYGATE_STATUS_READ = previous;
		}
	});

	it.each([
		["404 (wrong path, key scope or retention)", { kind: "not_found" }],
		["401 (rotated or scoped key)", { kind: "unavailable", reason: "status_401" }],
		["403", { kind: "unavailable", reason: "status_403" }],
		["500", { kind: "unavailable", reason: "status_500" }],
		["429", { kind: "rate_limited", retryAfterMs: 10_000 }],
		["timeout", { kind: "unavailable", reason: "timeout" }],
		["a body naming another registration", { kind: "invalid", error: "PayGate registration identity mismatch" }],
	])("holds an hours-old row through %s", async (_label, read) => {
		const registration = await createPending({ registrationDate: hoursOld, expiresAt: hoursOld });
		const result = await reconcileExpiredRegistrations({
			now: Date.now(),
			random: () => 0,
			probeProvider: async () => read as never,
		});
		expect(result.released).toBe(0);
		expect(result.keptForProvider).toBe(1);
		const row = await registrationState(registration.id);
		expect(row.registration_status).toBe("pending");
		expect(row.payment_status).toBe("pending");
	});
});
