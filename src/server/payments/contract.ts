/**
 * PayGate v4 merchant contract — the one place the provider's wire format is
 * described, and the one place a failure is classified.
 *
 * Every shape here is taken from the provider's own source
 * (`internal/v4/httpapi/merchant.go`, `internal/v4/payments/service.go`,
 * `internal/v4/webhooks/service.go`) and the checked-in spec
 * (`docs/v4/04_PUBLIC_API_AND_WEBHOOKS.md`), not from an assumption:
 *
 *   POST /v1/payments          create (201 new, 200 replayed)
 *   GET  /v1/payments/{id}     status read
 *   POST /v1/payments/{id}/cancel
 *
 * Create request — strict JSON with **no unknown fields**:
 *   { "amount": 500, "name": "…", "external_id": "…", "metadata": { … } }
 * `amount` is whole rupees (the server multiplies by 100, so the requested
 * amount is always `₹N.00`); the fingerprint is applied by the provider and
 * returned as `payable_amount` / `adjustment`.
 *
 * Create/GET response — `merchantPaymentResponse`:
 *   id, object:"payment", name, external_id, metadata,
 *   status ∈ {pending, paid, expired, cancelled}, currency:"INR",
 *   requested_amount / payable_amount / adjustment (fixed two-decimal strings),
 *   upi_uri, transaction_note, created_at, expires_at, grace_until, paid_at,
 *   payer?: { name, upi_id }
 *
 * Webhook delivery: `PayGate-Event-Id`, `PayGate-Timestamp`,
 * `PayGate-Signature: v1=<hex HMAC-SHA256(timestamp + "." + rawBody)>`, with
 * the body `{ id, type, created_at, data: { payment } }`.
 *
 * A non-JSON body — notably the SPA's `index.html` served with 200 for unknown
 * paths — is never a success however well-formed the HTTP status is.
 */

/** Where PayGate mounts the merchant API. Not `/v4`, despite the product name. */
export const PAYGATE_STATUS_PATH = "/v1/payments";

export type ProviderFailure =
	| "validation"
	| "capacity"
	| "conflict"
	| "rate_limited"
	| "unauthorized"
	| "ambiguous"
	| "unavailable";

const RECORDED = Symbol("paygate-recorded");

const FAILURE_OF: Record<string, ProviderFailure> = {
	invalid_amount: "validation",
	invalid_payment: "validation",
	invalid_request: "validation",
	invalid_content_type: "validation",
	idempotency_key_required: "conflict",
	idempotency_conflict: "conflict",
	payment_capacity_unavailable: "capacity",
	collection_unavailable: "capacity",
	AMOUNT_CAPACITY_EXHAUSTED: "capacity",
	payment_not_found: "validation",
	payment_terminal: "conflict",
	unauthorized: "unauthorized",
	internal_error: "unavailable",
};

interface RecordedError extends Error {
	[RECORDED]?: true;
	kind?: ProviderFailure;
	status?: number;
	code?: string;
}

export interface ProviderHttpErrorInit {
	kind: ProviderFailure;
	status: number;
	code: string;
	/** Safe to show? Only reached from an authenticated, well-formed error. */
	detail?: string;
}

/**
 * A provider call that failed, classified.
 *
 * `ambiguous` is the important one: the request may or may not have been
 * applied (socket closed, timeout, the SPA's HTML 200, a truncated body). A
 * caller must never treat it as "nothing happened".
 */
export class ProviderHttpError extends Error {
	readonly kind: ProviderFailure;
	readonly status: number;
	readonly code: string;

	constructor(init: ProviderHttpErrorInit) {
		super(init.detail || init.code || init.kind);
		this.name = "ProviderHttpError";
		this.kind = init.kind;
		this.status = init.status;
		this.code = init.code;
		(this as RecordedError)[RECORDED] = true;
	}
}

/** A value already constructed inside this module, passed through unchanged. */
function isRecorded(error: unknown): error is RecordedError {
	return Boolean(error && typeof error === "object" && (error as RecordedError)[RECORDED]);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** `error.code` from a provider error body, which nests it under `error`. */
export function providerErrorCode(body: unknown): string {
	const envelope = asRecord(body);
	const error = asRecord(envelope.error ?? envelope);
	return String(error.code ?? "").trim();
}

export function classifyProviderFailure(status: number, body: unknown): ProviderFailure {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 429) return "rate_limited";
	const mapped = FAILURE_OF[providerErrorCode(body)];
	if (mapped) return mapped;
	return status >= 400 && status < 500 ? "validation" : "unavailable";
}

function isJsonResponse(response: Response): boolean {
	return (response.headers.get("Content-Type") ?? "").toLowerCase().includes("application/json");
}

export interface ReadProviderBodyOptions {
	/** Which operation this is, for the message. */
	operation: string;
	/** Statuses the caller can interpret; anything else is ambiguous. */
	acceptStatus?: (status: number) => boolean;
	/** Copy of the parsed body for interpretation. */
	parse?: (body: unknown) => unknown;
}

/**
 * Turn a provider response into a body, or throw a classified failure.
 *
 * The content type is checked before the status: an unknown path on PayGate is
 * answered by the embedded dashboard (`index.html`, `text/html`, **200**), so a
 * status-only check would accept a web page as a payment. A 200 that is not
 * JSON, or that does not parse, is `ambiguous` — the request was routed
 * somewhere and the caller cannot know what happened to it.
 */
export async function readProviderBody<T>(
	response: Response,
	options: ReadProviderBodyOptions,
): Promise<T> {
	if (!isJsonResponse(response)) {
		throw new ProviderHttpError({
			kind: "ambiguous",
			status: response.status,
			code: "non_json_response",
			detail: `${options.operation} did not return JSON`,
		});
	}

	const body = (await response.json().catch(() => undefined)) as unknown;
	if (body === undefined) {
		throw new ProviderHttpError({
			kind: "ambiguous",
			status: response.status,
			code: "unreadable_response",
			detail: `${options.operation} returned an unreadable body`,
		});
	}

	const accepted = options.acceptStatus ? options.acceptStatus(response.status) : response.ok;
	if (!accepted) {
		throw new ProviderHttpError({
			kind: classifyProviderFailure(response.status, body),
			status: response.status,
			code: providerErrorCode(body) || `status_${response.status}`,
		});
	}

	return (options.parse ? options.parse(body) : body) as T;
}

/**
 * Wrap a provider call so transport failures become classified errors rather
 * than raw exceptions: a dead socket or an aborted read is `ambiguous`, because
 * the request may already have been applied at the provider.
 */
export async function callProvider<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (isRecorded(error)) throw error;
		throw new ProviderHttpError({
			kind: "ambiguous",
			status: 0,
			code: "transport_error",
			detail: error instanceof Error && error.name === "TimeoutError"
				? "PayGate did not answer in time"
				: undefined,
		});
	}
}

/** Narrow a classified failure, with a sane default for foreign errors. */
export function providerFailureOf(error: unknown): ProviderFailure {
	if (isRecorded(error) && error.kind) return error.kind;
	return "ambiguous";
}
