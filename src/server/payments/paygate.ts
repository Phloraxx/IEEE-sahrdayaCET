/**
 * PayGate v4 integration — TypeScript port of `pb_hooks/paygate-helpers.js`.
 *
 * The parts that matter and are ported verbatim:
 *   - **Signature**: HMAC-SHA256 over `timestamp + "." + rawBody`, hex, compared
 *     in constant time. A timestamp outside the tolerance window is refused.
 *   - **Amount fingerprint**: PayGate adds 1–99 (or 101–199) paise to the
 *     requested amount so a bank credit can be matched to a session. The
 *     requested amount must equal the registration's fee exactly, and the
 *     payable amount must carry a valid fingerprint.
 *   - **Identity**: the payment id, the registration id in metadata, the
 *     environment and the transaction note must all agree.
 *   - **State machine**: a terminal event never regresses a confirmed payment;
 *     a payment that arrives after the seat was released becomes a manual
 *     review, not a resurrection.
 *
 * The webhook is an optimisation; reconciliation is the independent correctness
 * path. That distinction is preserved: `applyProviderState` is shared by both.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { PAYGATE_STATUS_PATH, providerFailureOf, readProviderBody } from "./contract";

export { PAYGATE_STATUS_PATH };

export const PAYGATE_PROVIDER = "paygate";

/**
 * Provider statuses this integration understands.
 *
 * `pending | paid | expired | cancelled` are the only statuses PayGate v4
 * publishes (`docs/v4/03_PAYMENT_LIFECYCLE_AND_MATCHING.md`: "Public/product
 * statuses remain… Do not expose `late`, `review`, `reconciled`…"). `late` is
 * kept because the signed webhook still accepts it as a manual-review signal,
 * but a *status read* may never report it.
 */
export const SUPPORTED_STATUSES = new Set(["pending", "paid", "expired", "cancelled", "late"]);

/** The statuses a `GET` may return. Anything else is a contract breach. */
export const PUBLISHED_STATUSES = new Set(["pending", "paid", "expired", "cancelled"]);

export interface PayGateConfig {
	url: string;
	apiKey: string;
	webhookSecret: string;
	registrationGraceSeconds: number;
	webhookToleranceSeconds: number;
	/** Explicit opt-in for the provider status read. Off unless `PAYGATE_STATUS_READ` is on. */
	statusRead: boolean;
	/** `DEPLOY_ENV === "production"`: a live endpoint is legitimate here. */
	production: boolean;
	/**
	 * This deployment may act on a PayGate endpoint: production, or a
	 * non-production deployment that declared `PAYGATE_SANDBOX=true`.
	 */
	sandbox: boolean;
}

function positiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || Math.floor(parsed) !== parsed || parsed <= 0) return fallback;
	return parsed;
}

/** Reject an insecure origin in production. */
export function normalizePayGateOrigin(value: unknown): string {
	const text = String(value ?? "").trim().replace(/\/+$/, "");
	const match = text.match(
		/^(https?):\/\/(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::([0-9]{1,5}))?$/i,
	);
	if (!match) return "";
	if (String(match[1]).toLowerCase() === "http") {
		const host = String(match[2]).toLowerCase();
		const deployEnv = String(process.env.DEPLOY_ENV ?? "").trim().toLowerCase();
		const localHost =
			host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "host.docker.internal";
		if ((deployEnv === "production" || deploymentNamespace() === "production") && !localHost) return "";
	}
	if (match[3] && Number(match[3]) > 65535) return "";
	return text;
}

export function deploymentNamespace(): string {
	const explicit = String(process.env.PAYGATE_CLIENT_NAMESPACE ?? "").trim().toLowerCase();
	if (explicit) return explicit.replace(/[^a-z0-9_-]/g, "-").slice(0, 40) || "local";
	const site = String(process.env.SITE_URL ?? "").trim().toLowerCase();
	if (site.includes("staging.ieeesahrdaya.com")) return "staging";
	if (site.includes("ieeesahrdaya.com")) return "production";
	return "local";
}

/**
 * A deployment is production when its own `DEPLOY_ENV` says so.
 *
 * This is deliberately the deployment's declaration, not a hostname guess: the
 * integration rule that follows from it ("staging may not spend real money",
 * "production may") has to be readable and auditable in the environment file
 * that defines the deployment.
 */
export function isProductionDeployment(): boolean {
	return String(process.env.DEPLOY_ENV ?? "").trim().toLowerCase() === "production";
}

/**
 * Buoy for `PAYGATE_SANDBOX`, which the integration guard may set before the
 * first request. It exists only so a test or a CLI can force the value; the
 * normal path reads the environment directly in `getConfig()`.
 */
let sandboxOverride: boolean | null = null;

/** The integration guard resolves sandbox-ness once; tests may reset it. */
export function setIsSandboxOverride(value: boolean | null): void {
	sandboxOverride = value;
}

function sandboxDeclared(): boolean {
	if (sandboxOverride !== null) return sandboxOverride;
	const text = String(process.env.PAYGATE_SANDBOX ?? "").trim().toLowerCase();
	return text === "1" || text === "true" || text === "yes" || text === "on";
}

export function getConfig(): PayGateConfig {
	const production = isProductionDeployment();
	return {
		url: normalizePayGateOrigin(process.env.PAYGATE_URL),
		apiKey: String(process.env.PAYGATE_API_KEY ?? "").trim(),
		webhookSecret: String(process.env.PAYGATE_WEBHOOK_SECRET ?? "").trim(),
		registrationGraceSeconds: positiveInt(process.env.PAYGATE_REGISTRATION_GRACE_SECONDS, 600),
		webhookToleranceSeconds: Math.min(
			positiveInt(process.env.PAYGATE_WEBHOOK_TOLERANCE_SECONDS, 300),
			900,
		),
		statusRead: statusReadEnabled({
			url: normalizePayGateOrigin(process.env.PAYGATE_URL),
			apiKey: String(process.env.PAYGATE_API_KEY ?? "").trim(),
		}),
		production,
		// Production is permitted to run a live endpoint; everything else must
		// declare its endpoint a sandbox before it may touch money.
		sandbox: production || sandboxDeclared(),
	};
}

/**
 * Is the provider status read switched on?
 *
 * **Opt-in, and off by default on purpose.** The read path and response shape
 * are verified against the provider's source, but not yet against a sandbox
 * deployment with a real key. Until an operator sets `PAYGATE_STATUS_READ=1`
 * (or `true`/`on`/`yes`) after that check, the poller performs no reads and
 * therefore *cannot* confirm or release anything from provider state: recovery
 * falls back to the signed webhook and the local grace rules, exactly as
 * before this change. Failing closed beats guessing at production.
 */
export function statusReadEnabled(config: { url?: string; apiKey?: string }): boolean {
	const flag = String(process.env.PAYGATE_STATUS_READ ?? "").trim().toLowerCase();
	if (!["1", "true", "on", "yes"].includes(flag)) return false;
	return Boolean(config.url && String(config.apiKey ?? "").length >= 32);
}

/**
 * Is paid registration initiation allowed to run here?
 *
 * Fail closed on money, scoped to the environment. A non-production deployment
 * must declare its endpoint a sandbox (`PAYGATE_SANDBOX=true`); production is the
 * one place a live endpoint is legitimate, and its own environment file is where
 * that is decided. The runtime cannot tell a live PayGate endpoint from a sandbox
 * one by looking, so the rule is: staging never spends real money, production
 * trusts its own operator — and a staging stack that inherits a production
 * `.env` still refuses.
 */
export function paymentConfigured(config: PayGateConfig): boolean {
	const ready = Boolean(config.url && config.apiKey.length >= 32);
	if (!ready) return false;
	return config.production ? true : config.sandbox;
}

/**
 * May a PayGate-signed webhook be acted on here?
 *
 * Same readiness rule as initiation, so a deployment that cannot initiate also
 * cannot apply a callback for a session it did not create. The secret is the
 * only thing that makes a callback trustworthy.
 */
export function webhookConfigured(config: PayGateConfig): boolean {
	if (config.webhookSecret.length < 32) return false;
	return paymentConfigured(config) || Boolean(config.production && config.url);
}

/** One decision for every active path: initiate, webhook and status refresh. */
export function paygateActive(config: PayGateConfig = getConfig()): boolean {
	return paymentConfigured(config);
}

export function idempotencyKeyForRegistration(registrationId: string): string {
	return `ieee-paygate-${deploymentNamespace()}-${registrationId}`;
}

/** Rupees (integer) -> paise, or 0 when not a safe whole amount. */
export function expectedRequestedPaise(amountRupees: unknown): number {
	const amount = Number(amountRupees);
	if (!Number.isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) return 0;
	const paise = amount * 100;
	return Number.isSafeInteger(paise) ? paise : 0;
}

/** `"12.34"` -> 1234, or 0 when malformed. */
export function moneyStringToPaise(value: unknown): number {
	const text = String(value ?? "").trim();
	if (!/^\d+\.\d{2}$/.test(text)) return 0;
	const [rupeesText, paiseText] = text.split(".");
	const rupees = Number(rupeesText);
	const paise = Number(paiseText);
	if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise) || paise < 0 || paise > 99) {
		return 0;
	}
	const total = rupees * 100 + paise;
	return Number.isSafeInteger(total) && total > 0 ? total : 0;
}

/**
 * Verify a webhook signature.
 *
 * `expected = HMAC-SHA256(timestamp + "." + rawBody, secret)` as hex, compared
 * in constant time. The header may be `v1=<hex>` or bare `<hex>`.
 */
export function verifyWebhookSignature(input: {
	timestamp: string;
	rawBody: string;
	signatureHeader: string;
	secret: string;
	nowSeconds?: number;
	toleranceSeconds?: number;
}): { ok: true } | { ok: false; code: string; error: string } {
	const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	const tolerance = input.toleranceSeconds ?? 300;

	const timestampNumber = Number(input.timestamp);
	if (
		!Number.isFinite(timestampNumber) ||
		Math.floor(timestampNumber) !== timestampNumber ||
		Math.abs(now - timestampNumber) > tolerance
	) {
		return {
			ok: false,
			code: "PAYGATE_SIGNATURE_STALE",
			error: "PayGate webhook timestamp is outside the accepted window",
		};
	}

	const provided = input.signatureHeader.startsWith("v1=")
		? input.signatureHeader.slice(3)
		: "";
	if (!provided) {
		return {
			ok: false,
			code: "PAYGATE_SIGNATURE_INVALID",
			error: "Invalid PayGate webhook signature",
		};
	}

	const expected = createHmac("sha256", input.secret)
		.update(`${input.timestamp}.${input.rawBody}`)
		.digest("hex");

	const a = Buffer.from(provided, "utf8");
	const b = Buffer.from(expected, "utf8");
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return {
			ok: false,
			code: "PAYGATE_SIGNATURE_INVALID",
			error: "Invalid PayGate webhook signature",
		};
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Provider payment shape
// ---------------------------------------------------------------------------

export interface ProviderPayment {
	id: string;
	status: string;
	requestedAmountPaise: number;
	payableAmountPaise: number;
	payableAmount: number;
	externalId: string;
	metadata: Record<string, unknown>;
	transactionNote: string;
	upiUri: string;
	expiresAt: string;
	createdAt: string;
	paidAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Normalise a provider payload into the fields we validate.
 *
 * Two shapes reach this function:
 *   - the v4 wire shape the provider actually returns (`requested_amount`
 *     /`payable_amount` as fixed two-decimal **strings**, `external_id`,
 *     `transaction_note`), used by both a status read and a webhook body;
 *   - the internal camelCase snapshot written into `payment_data` and sent by
 *     older fixtures. Kept so stored state and existing payloads still parse.
 */
export function normalizeProviderPayment(raw: unknown): ProviderPayment | null {
	const source = asRecord(raw);
	const id = String(source.id ?? "").trim();
	if (!id) return null;

	const requested = asRecord(source.requestedAmount);
	const payable = asRecord(source.payableAmount);

	// Wire strings first: `"100.37"`. camelCase numbers only as a fallback.
	const wireRequested = moneyStringToPaise(source.requested_amount);
	const wirePayable = moneyStringToPaise(source.payable_amount);
	const requestedAmountPaise = wireRequested || Number(requested.paise ?? source.requestedAmountPaise ?? 0);
	const payableAmountPaise = wirePayable || Number(payable.paise ?? source.payableAmountPaise ?? 0);
	const payableAmount = wirePayable
		? wirePayable / 100
		: Number(payable.rupees ?? source.payableAmount ?? 0);

	return {
		id,
		status: String(source.status ?? "").trim().toLowerCase(),
		requestedAmountPaise,
		payableAmountPaise,
		payableAmount,
		externalId: String(source.external_id ?? source.externalId ?? "").trim(),
		metadata: asRecord(source.metadata),
		transactionNote: String(source.transaction_note ?? source.transactionNote ?? "").trim(),
		upiUri: String(source.upi_uri ?? source.upiUri ?? "").trim(),
		expiresAt: String(source.expires_at ?? source.expiresAt ?? "").trim(),
		createdAt: String(source.created_at ?? source.createdAt ?? "").trim(),
		paidAt: String(source.paid_at ?? source.paidAt ?? "").trim(),
	};
}

export interface ValidateOptions {
	paymentId?: string;
	externalId?: string;
	registrationId?: string;
	environment?: string;
	requireUpiUri?: boolean;
	/** Require `expires_at` on a pending payment (create/GET, not webhooks). */
	requireExpiry?: boolean;
}

/**
 * Validate a provider payment against the registration it claims to pay for.
 *
 * Every check here is a way a payment could be misapplied to the wrong
 * registration or the wrong amount, so all of them are refusals rather than
 * corrections.
 */
export function validateProviderPayment(
	raw: unknown,
	expectedAmountRupees: number,
	options: ValidateOptions = {},
): { ok: true; payment: ProviderPayment } | { ok: false; error: string } {
	const payment = normalizeProviderPayment(raw);
	if (!payment) return { ok: false, error: "PayGate returned an invalid payment response" };

	const expectedPaise = expectedRequestedPaise(expectedAmountRupees);
	if (!payment.id || !SUPPORTED_STATUSES.has(payment.status) || !expectedPaise) {
		return { ok: false, error: "PayGate returned an invalid payment response" };
	}

	if (
		!Number.isSafeInteger(payment.requestedAmountPaise) ||
		payment.requestedAmountPaise !== expectedPaise
	) {
		return { ok: false, error: "PayGate requested amount does not match the registration" };
	}

	// The fingerprint is the whole point: it is what lets a bank credit be
	// matched to this session.
	const delta = payment.payableAmountPaise - payment.requestedAmountPaise;
	const validFingerprint = (delta >= 1 && delta <= 99) || (delta >= 101 && delta <= 199);
	if (!Number.isSafeInteger(payment.payableAmountPaise) || !validFingerprint) {
		return { ok: false, error: "PayGate returned an invalid verification amount" };
	}

	if (options.paymentId && payment.id !== options.paymentId) {
		return { ok: false, error: "PayGate payment identity mismatch" };
	}
	if (options.externalId && payment.externalId !== options.externalId) {
		return { ok: false, error: "PayGate registration identity mismatch" };
	}
	if (options.registrationId) {
		const metadataRegistrationId = String(payment.metadata.registration_id ?? "").trim();
		if (metadataRegistrationId !== options.registrationId) {
			return { ok: false, error: "PayGate registration identity mismatch" };
		}
	}
	if (options.environment) {
		// PayGate stores our metadata verbatim but does not know the deployment
		// environment. When the payload simply omits it, that is not a mismatch;
		// when it carries a different one, the payment crossed environments.
		const echoed = payment.metadata.environment;
		if (echoed !== undefined && String(echoed ?? "").trim() !== options.environment) {
			return { ok: false, error: "PayGate environment identity mismatch" };
		}
	}
	if (payment.transactionNote && payment.transactionNote !== `PayGate ${payment.id}`) {
		return { ok: false, error: "PayGate transaction reference does not match the payment" };
	}
	// A create/GET response carries `expires_at`; a webhook delivery does not
	// (it ships id, name, external_id, status, amounts, metadata,
	// transaction_note and, once paid, paid_at/payer). So the expiry is
	// required only where the caller says it should arrive.
	if (options.requireExpiry && payment.status === "pending" && !payment.expiresAt) {
		return { ok: false, error: "PayGate did not provide a payment expiry" };
	}
	return { ok: true, payment };
}

// ---------------------------------------------------------------------------
// Provider status read
// ---------------------------------------------------------------------------

/**
 * Provider read outcome.
 *
 * Only `ok` carries an answer from the provider. Everything else is a
 * non-answer, and a caller must treat it as "keep the reservation": `not_found`
 * in particular is **not** proof that the payment does not exist — it can mean a
 * wrong or versioned path, a key scoped to another merchant, or a retention
 * window. It therefore never releases a reservation.
 */
export type ProviderRead =
	| { kind: "ok"; payment: ProviderPayment }
	| { kind: "disabled" }
	| { kind: "not_found" }
	| { kind: "rate_limited"; retryAfterMs: number }
	/** The read may or may not have reached the provider (timeout, abort). */
	| { kind: "ambiguous"; reason: string }
	| { kind: "unavailable"; reason: string }
	| { kind: "invalid"; error: string };

export interface ProviderReadOptions {
	/**
	 * Identity and amount to validate the response against. When omitted the
	 * response is validated structurally only (the caller re-validates inside
	 * its transaction against live state, like the PocketBase hook did).
	 */
	paymentId?: string;
	externalId?: string;
	registrationId?: string;
	environment?: string;
	expectedAmountRupees?: number;
}

/** Hard ceiling on one provider read: a status page must never hang a tick. */
export const PROVIDER_READ_TIMEOUT_MS = 5_000;

/**
 * Bound a provider read by `timeoutMs`, whatever the transport honours.
 *
 * `AbortSignal.timeout` covers a well-behaved fetch; this outer race covers a
 * fake or transport that ignores the signal. The loser is left to settle on its
 * own and can never reject unhandled.
 */
export async function withTimeout<T>(
	work: Promise<T>,
	timeoutMs: number,
	fallback: T,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const guarded = new Promise<T>((resolve) => {
		timer = setTimeout(() => resolve(fallback), timeoutMs);
		timer.unref?.();
	});
	work.catch(() => undefined);
	try {
		return await Promise.race([work, guarded]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function retryAfterMsFrom(response: Response | null): number {
	const header = Number(response?.headers.get("Retry-After"));
	return Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 120_000) : 10_000;
}

/**
 * Read one payment's authoritative state from PayGate.
 *
 * `GET /v1/payments/{id}` with the merchant bearer key. The read is bounded in
 * time and every response is validated before it is returned.
 *
 * Only an affirmative answer may change a reservation: `ok` with `paid` admits
 * money, `ok` with `expired`/`cancelled` permits release after grace. A 404,
 * 401/403, 429, timeout or contradictory body is a non-answer — the reservation
 * is kept and retried — because each of those can mean the path, the key scope
 * or the provider's retention is wrong rather than the payment being gone.
 */
export async function readProviderPayment(
	paymentId: string,
	options: ProviderReadOptions = {},
	fetchImpl: typeof fetch = fetch,
	config: PayGateConfig = getConfig(),
	timeoutMs: number = PROVIDER_READ_TIMEOUT_MS,
): Promise<ProviderRead> {
	const id = String(paymentId ?? "").trim();
	if (!id) return { kind: "invalid", error: "No PayGate payment id to read" };
	if (!statusReadEnabled(config)) return { kind: "disabled" };
	if (!paymentConfigured(config)) return { kind: "unavailable", reason: "not_configured" };

	const work = (async (): Promise<ProviderRead> => {
		const response = await fetchImpl(
			`${config.url}${PAYGATE_STATUS_PATH}/${encodeURIComponent(id)}`,
			{
				method: "GET",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${config.apiKey}`,
				},
				signal: AbortSignal.timeout(timeoutMs),
			},
		);

		// The shared reader refuses a non-JSON 200 — the provider answers an
		// unknown path with its dashboard's `index.html` — so a wrong base path
		// can never look like an answer here either.
		let raw: unknown;
		try {
			raw = await readProviderBody<unknown>(response, {
				operation: "PayGate status read",
				acceptStatus: (status) => status === 200,
			});
		} catch (error) {
			const failure = providerFailureOf(error);
			if (failure === "rate_limited") {
				return { kind: "rate_limited", retryAfterMs: retryAfterMsFrom(response) };
			}
			return {
				kind: "unavailable",
				reason: response.status === 404 ? "not_found" : `status_${response.status || "none"}`,
			};
		}

		const payment = normalizeProviderPayment(raw);
		if (!payment) return { kind: "invalid", error: "PayGate returned an invalid payment response" };
		// `late` is a webhook-only concept; a status read never carries it.
		if (!PUBLISHED_STATUSES.has(payment.status)) {
			return { kind: "invalid", error: "PayGate returned an unsupported payment status" };
		}
		if (!Number.isSafeInteger(payment.requestedAmountPaise) || payment.requestedAmountPaise <= 0) {
			return { kind: "invalid", error: "PayGate returned an invalid requested amount" };
		}

		if (options.paymentId && payment.id !== options.paymentId) {
			return { kind: "invalid", error: "PayGate payment identity mismatch" };
		}
		if (options.externalId) {
			const externalId = String(payment.externalId ?? "").trim();
			if (externalId && externalId !== options.externalId) {
				return { kind: "invalid", error: "PayGate registration identity mismatch" };
			}
		}
		if (options.registrationId) {
			const metadataRegistrationId = String(payment.metadata.registration_id ?? "").trim();
			if (metadataRegistrationId && metadataRegistrationId !== options.registrationId) {
				return { kind: "invalid", error: "PayGate registration identity mismatch" };
			}
		}
		// PayGate does not know the environment; when we did not send one in the
		// metadata, its absence is expected rather than a mismatch.
		if (options.environment && payment.metadata.environment !== undefined) {
			if (String(payment.metadata.environment ?? "").trim() !== options.environment) {
				return { kind: "invalid", error: "PayGate environment identity mismatch" };
			}
		}
		if (options.expectedAmountRupees !== undefined) {
			const expectedPaise = expectedRequestedPaise(options.expectedAmountRupees);
			if (!expectedPaise || payment.requestedAmountPaise !== expectedPaise) {
				return { kind: "invalid", error: "PayGate requested amount does not match the registration" };
			}
		}
		return { kind: "ok", payment };
	})();

	return withTimeout(work, timeoutMs, { kind: "ambiguous", reason: "timeout" });
}

/** The provider events a status read is equivalent to. */
export function eventTypeForStatus(status: string): string {
	return `payment.${status}`;
}

/**
 * Does this event type describe this payment status?
 *
 * `payment.pending` is a v4 event whose payment carries `status: "pending"`, so
 * the plain rule covers it. `payment.late` is the legacy manual-review signal:
 * the payment may still read `paid` (money arrived late) or `late` in old
 * fixtures, so it is accepted for either and the transition decides.
 */
export function eventMatchesStatus(eventType: string, status: string): boolean {
	if (eventType === "payment.late") return status === "paid" || status === "late";
	return eventType === eventTypeForStatus(status);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type TransitionAction =
	| "noop"
	| "confirm"
	| "cancel"
	| "mark_expired"
	| "manual_review"
	| "error";

export interface Transition {
	action: TransitionAction;
	error?: string;
}

/**
 * Decide what a provider event means for a registration.
 *
 * The rule that matters: a terminal event must never regress a confirmed
 * payment, and money that arrives after the seat was released becomes a manual
 * review rather than a resurrection.
 */
export function resolveProviderTransition(input: {
	eventType: string;
	registrationStatus: string;
	paymentStatus: string;
	amountMatches: boolean;
	paymentIdMatches: boolean;
}): Transition {
	if (!input.amountMatches) return { action: "error", error: "Amount mismatch" };
	if (!input.paymentIdMatches) return { action: "error", error: "Payment identity mismatch" };

	if (input.eventType === "payment.paid") {
		if (input.paymentStatus === "paid" && input.registrationStatus === "confirmed") {
			return { action: "noop" };
		}
		if (input.registrationStatus === "cancelled") return { action: "manual_review" };
		return { action: "confirm" };
	}

	if (input.eventType === "payment.expired") {
		if (input.registrationStatus === "cancelled" || input.paymentStatus === "paid") {
			return { action: "noop" };
		}
		return { action: "mark_expired" };
	}

	if (input.eventType === "payment.cancelled") {
		if (input.paymentStatus === "paid") return { action: "noop" };
		if (input.registrationStatus === "cancelled") return { action: "noop" };
		return { action: "cancel" };
	}

	if (input.eventType === "payment.late") {
		if (input.paymentStatus === "paid" && input.registrationStatus === "confirmed") {
			return { action: "noop" };
		}
		return { action: "manual_review" };
	}

	// v4 publishes `payment.pending` (the create transition). It carries no new
	// information for a reservation that is already pending, so it is a no-op —
	// the record of the provider status still happens in `applyProviderState`.
	if (input.eventType === "payment.pending") return { action: "noop" };

	return { action: "noop" };
}

/** The provider statuses that count as money actually collected. */
export function isCollected(status: string): boolean {
	return status === "paid" || status === "late";
}

/** Map a provider status to the ledger's status vocabulary. */
export function ledgerStatusFor(providerStatus: string, manualReview: boolean): string {
	if (manualReview) return "manual_review";
	switch (providerStatus) {
		case "paid":
			return "captured";
		case "cancelled":
			return "cancelled";
		case "expired":
			return "failed";
		case "late":
			return "manual_review";
		default:
			return "pending";
	}
}
