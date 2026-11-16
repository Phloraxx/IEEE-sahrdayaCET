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

export const PAYGATE_PROVIDER = "paygate";

/** Provider statuses this integration understands. */
export const SUPPORTED_STATUSES = new Set(["pending", "paid", "expired", "cancelled", "late"]);

export interface PayGateConfig {
	url: string;
	apiKey: string;
	webhookSecret: string;
	registrationGraceSeconds: number;
	webhookToleranceSeconds: number;
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

export function getConfig(): PayGateConfig {
	return {
		url: normalizePayGateOrigin(process.env.PAYGATE_URL),
		apiKey: String(process.env.PAYGATE_API_KEY ?? "").trim(),
		webhookSecret: String(process.env.PAYGATE_WEBHOOK_SECRET ?? "").trim(),
		registrationGraceSeconds: positiveInt(process.env.PAYGATE_REGISTRATION_GRACE_SECONDS, 600),
		webhookToleranceSeconds: Math.min(
			positiveInt(process.env.PAYGATE_WEBHOOK_TOLERANCE_SECONDS, 300),
			900,
		),
	};
}

export function paymentConfigured(config: PayGateConfig): boolean {
	return Boolean(config.url && config.apiKey.length >= 32);
}

export function webhookConfigured(config: PayGateConfig): boolean {
	return config.webhookSecret.length >= 32;
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
	paidAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Normalise the provider payload into the fields we validate. */
export function normalizeProviderPayment(raw: unknown): ProviderPayment | null {
	const source = asRecord(raw);
	const id = String(source.id ?? "").trim();
	if (!id) return null;

	const requested = asRecord(source.requestedAmount);
	const payable = asRecord(source.payableAmount);
	const requestedAmountPaise = Number(requested.paise ?? source.requestedAmountPaise ?? 0);
	const payableAmountPaise = Number(payable.paise ?? source.payableAmountPaise ?? 0);

	return {
		id,
		status: String(source.status ?? "").trim().toLowerCase(),
		requestedAmountPaise,
		payableAmountPaise,
		payableAmount: Number(payable.rupees ?? source.payableAmount ?? 0),
		externalId: String(source.externalId ?? "").trim(),
		metadata: asRecord(source.metadata),
		transactionNote: String(source.transactionNote ?? "").trim(),
		upiUri: String(source.upiUri ?? "").trim(),
		expiresAt: String(source.expiresAt ?? "").trim(),
		paidAt: String(source.paidAt ?? "").trim(),
	};
}

export interface ValidateOptions {
	paymentId?: string;
	externalId?: string;
	registrationId?: string;
	environment?: string;
	requireUpiUri?: boolean;
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
	if (
		options.environment &&
		String(payment.metadata.environment ?? "").trim() !== options.environment
	) {
		return { ok: false, error: "PayGate environment identity mismatch" };
	}
	if (payment.transactionNote && payment.transactionNote !== `PayGate ${payment.id}`) {
		return { ok: false, error: "PayGate transaction reference does not match the payment" };
	}
	if (payment.status === "pending" && !payment.expiresAt) {
		return { ok: false, error: "PayGate did not provide a payment expiry" };
	}
	return { ok: true, payment };
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
