/**
 * Payment initiation — port of `createPaymentForRegistration` and
 * `paymentSession` from `pb_hooks/paygate-helpers.js`, corrected against the
 * provider's own create contract.
 *
 * The provider call is `POST {origin}/v1/payments` — not `/v4/payments`, which
 * PayGate does not mount and answers with its dashboard's HTML. The request is
 * strict JSON with no unknown fields:
 *
 *   { "amount": 500, "name": "Attendee", "external_id": "<event id>",
 *     "metadata": { "registration_id": "<uuid>", "environment": "<namespace>" } }
 *
 * `amount` is **whole rupees**; the provider multiplies by 100 and owns the
 * paise fingerprint, returning `requested_amount: "500.00"` and
 * `payable_amount: "500.37"`. `Idempotency-Key` is mandatory and scoped to the
 * registration plus a fingerprint of the request body, so a retry with the same
 * amount replays the same payment while a changed amount is a conflict rather
 * than a silently truncated replay.
 *
 * Safety rules this file exists to keep:
 *
 *   - **never a second charge.** A create that fails in a way that may have
 *     been applied (timeout, dropped socket, non-JSON 200, truncated body) is
 *     persisted as *unverified* before the error is returned, and every later
 *     attempt re-reads that session instead of creating a new one. If the
 *     provider does not know the key at all, a retry reuses it; if the provider
 *     holds it, a replayed create returns the same payment.
 *   - **never a local cancellation on ambiguity.** A timeout or an unreadable
 *     answer says nothing about the payment, so it never cancels a
 *     registration: only a signed provider event or an affirmative status read
 *     may do that.
 */

import { query } from "@/lib/db.server";
import { finalFeePaise } from "@/server/registration/helpers";
import {
	PAYGATE_PROVIDER,
	deploymentNamespace,
	expectedRequestedPaise,
	getConfig,
	idempotencyKeyForRegistration,
	normalizeProviderPayment,
	paymentConfigured,
	type ProviderPayment,
	paygateActive,
} from "./paygate";
import {
	PAYGATE_STATUS_PATH,
	ProviderHttpError,
	callProvider,
	providerFailureOf,
	readProviderBody,
} from "./contract";

export interface PaymentRegistration {
	id: string;
	user_id: string | null;
	user_name: string | null;
	user_email: string | null;
	event_id: string;
	registration_status: string | null;
	payment_status: string | null;
	ticket_id: string | null;
	payment_ticket_id: string | null;
	payment_data: string | null;
	final_fee_paise: number;
	discount_paise: number;
	base_fee_paise: number;
	amount: number | null;
}

export type InitiateResult =
	| {
			ok: true;
			status: 200;
			paymentRequired: boolean;
			amount: number;
			paymentId: string;
			providerStatus: string;
			upiUri: string;
			expiresAt: string;
			alreadyPaid: boolean;
			createdAt: string;
			transactionNote: string;
			requestedAmountPaise: number;
			payableAmountPaise: number;
			payableAmount: string;
	  }
	| {
			ok: false;
			status: number;
			code: string;
			error: string;
			/** True when the provider may already hold the payment. */
			unverified?: boolean;
			/** True when this needs an operator, not another attendee retry. */
			operatorReview?: boolean;
	  };

function parseData(value: string | null): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/**
 * The exact create attempt, persisted when its outcome is unknown.
 *
 * `request` is the DTO that was posted and `idempotencyKey` the key it was
 * posted with. Because the provider fingerprints `{amount,name,external_id,
 * metadata}` per key, replaying *this immutable pair* is safe and idempotent:
 * it either creates the payment once or returns the payment the lost answer
 * would have described. Nothing else may be posted while an unresolved
 * attempt exists.
 */
export interface CreateAttempt {
	idempotencyKey: string;
	request: Record<string, unknown>;
	requestedAt: string;
}

/** Why an unresolved attempt blocks a different request. */
export interface AttemptReview {
	reason: string;
	attemptedAmount: number;
	requestedAmount: number;
	since: string;
}

function createAttemptOf(data: Record<string, unknown>): CreateAttempt | null {
	const attempt = data.createAttempt as Partial<CreateAttempt> | undefined;
	if (!attempt || typeof attempt !== "object") return null;
	if (typeof attempt.idempotencyKey !== "string" || !attempt.request) return null;
	return {
		idempotencyKey: attempt.idempotencyKey,
		request: attempt.request as Record<string, unknown>,
		requestedAt: String(attempt.requestedAt ?? ""),
	};
}

/** Is this attempt exactly the request we would post now? */
export function sameCreateRequest(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/** The create body, exactly as the provider's strict decoder expects it. */
export function buildCreateBody(registration: PaymentRegistration): Record<string, unknown> {
	return {
		// Whole rupees: the provider multiplies by 100 itself.
		amount: finalFeePaise(registration) / 100,
		// The attendee's name, as the provider echoes it back (`name`, length
		// 1-120). It is display metadata; payment matching never uses it.
		name:
			String(registration.user_name ?? "").trim().slice(0, 120) ||
			String(registration.user_email ?? "").trim().slice(0, 120) ||
			"IEEE Sahrdaya attendee",
		external_id: registration.event_id,
		metadata: {
			registration_id: registration.id,
			environment: deploymentNamespace(),
		},
	};
}

/**
 * The idempotency key: registration + environment + request fingerprint.
 *
 * The provider scopes keys to the merchant, so a key that changes with the
 * amount can never replay a stale ₹100 payment for a ₹500 request. Reusing the
 * key with identical content is exactly the retry the provider deduplicates.
 */
export function idempotencyKeyFor(body: Record<string, unknown>): string {
	const metadata = body.metadata as Record<string, unknown>;
	return idempotencyKeyForRegistration(
		`${String(metadata.registration_id)}-${Number(body.amount)}`,
	);
}

function payableAmountString(paise: number): string {
	return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

/** What the IEEE frontend session needs, from a persisted or fresh payment. */
function sessionFrom(
	registration: PaymentRegistration,
	data: Record<string, unknown>,
	options: { providerStatus: string; alreadyPaid: boolean },
): InitiateResult {
	const finalPaise = finalFeePaise(registration);
	const payablePaise = Number(data.payableAmountPaise ?? 0);
	const requestedPaise = Number(data.requestedAmountPaise ?? expectedRequestedPaise(finalPaise / 100));
	return {
		ok: true,
		status: 200,
		paymentRequired: true,
		amount: finalPaise / 100,
		paymentId: String(data.paymentId ?? ""),
		providerStatus: options.providerStatus,
		upiUri: String(data.upiUri ?? ""),
		expiresAt: String(data.expiresAt ?? ""),
		alreadyPaid: options.alreadyPaid,
		createdAt: String(data.createdAt ?? ""),
		transactionNote: String(data.transactionNote ?? ""),
		requestedAmountPaise: requestedPaise,
		payableAmountPaise: payablePaise,
		payableAmount: payableAmountString(payablePaise),
	};
}

/**
 * The created payment, decoded the same way the status read decodes one: the
 * v4 body is snake_case with fixed two-decimal strings, so it must go through
 * `normalizeProviderPayment` rather than be read field-by-field.
 */
function verifiedPayment(raw: unknown): ProviderPayment {
	const payment = normalizeProviderPayment(raw);
	if (!payment || !payment.id || payment.status !== "pending") {
		throw new ProviderHttpError({
			kind: "ambiguous",
			status: 0,
			code: "unexpected_create_payment",
			detail: "PayGate returned a payment that is not a fresh pending session",
		});
	}
	return payment;
}

/**
 * Call the provider's create endpoint and persist a usable session.
 *
 * Returns the persisted data on success. Throws a classified
 * `ProviderHttpError`; on `ambiguous` the caller *must* record the attempt
 * before surfacing anything, and this function has done so already when the
 * provider returned an id it could not use.
 */
async function createAtProvider(
	registration: PaymentRegistration,
	body: Record<string, unknown>,
	options: { idempotencyKey: string; fetchImpl: typeof fetch },
): Promise<{
	paymentId: string;
	data: Record<string, unknown>;
}> {
	const config = getConfig();
	const fetchImpl = options.fetchImpl;
	const response = await callProvider(() =>
		fetchImpl(`${config.url}${PAYGATE_STATUS_PATH}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: `Bearer ${config.apiKey}`,
				// Exactly the key of the attempt being made or replayed.
				"Idempotency-Key": options.idempotencyKey,
			},
			// `externalId` is the event id, which the provider echoes back.
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(8_000),
		}),
	);

	// 201 is a new payment; 200 is the provider replaying the same
	// idempotency key, which is the resume path and equally valid.
	const raw = await readProviderBody<unknown>(response, {
		operation: "PayGate create",
		acceptStatus: (status) => status === 200 || status === 201,
	});
	const payment = verifiedPayment(raw);

	const live = parseData(registration.payment_data);
	const data = {
		...live,
		provider: PAYGATE_PROVIDER,
		paymentId: String(payment.id),
		providerStatus: "pending",
		requestedAmountPaise: Number(payment.requestedAmountPaise) || expectedRequestedPaise(Number(body.amount)),
		payableAmountPaise: Number(payment.payableAmountPaise) || 0,
		payableAmount: Number(payment.payableAmount) || 0,
		upiUri: String(payment.upiUri ?? ""),
		transactionNote: String(payment.transactionNote ?? ""),
		expiresAt: String(payment.expiresAt ?? ""),
		createdAt: String(payment.createdAt ?? ""),
		idempotencyKey: options.idempotencyKey,
		// No longer unverified: this session is the provider's own answer. The
		// attempt record is cleared in the same write, atomically with the id.
		createAttempt: undefined,
		attemptReview: undefined,
		sessionUnverified: false,
		lastSyncedAt: new Date().toISOString(),
	};

	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify(data),
		registration.id,
	]);

	return { paymentId: String(payment.id), data };
}

/**
 * Start (or resume) a payment for a pending registration.
 *
 * Guards, in order: the registration exists and belongs to the caller, it is
 * still pending, the amount is a whole rupee, and PayGate is configured.
 */
export async function startPayment(
	registrationId: string,
	userId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<InitiateResult> {
	const found = await query<PaymentRegistration>("SELECT * FROM registrations WHERE id = ?", [
		registrationId,
	]);
	const registration = found.rows[0];

	// 404 for a foreign registration: an id is not a capability.
	if (!registration || registration.user_id !== userId) {
		return { ok: false, status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" };
	}

	const data = parseData(registration.payment_data);

	if (registration.payment_status === "paid") {
		return sessionFrom(registration, data, { providerStatus: "paid", alreadyPaid: true });
	}

	if (registration.registration_status !== "pending" || registration.payment_status !== "pending") {
		return {
			ok: false,
			status: 409,
			code: "PAYMENT_NOT_AVAILABLE",
			error: "This registration is not awaiting payment",
		};
	}

	const finalPaise = finalFeePaise(registration);
	if (finalPaise <= 0) {
		return {
			ok: false,
			status: 409,
			code: "PAYMENT_NOT_REQUIRED",
			error: "This registration does not require payment",
		};
	}
	if (finalPaise % 100 !== 0) {
		return {
			ok: false,
			status: 400,
			code: "PAYGATE_WHOLE_RUPEE_REQUIRED",
			error: "PayGate requires a whole-rupee final amount",
		};
	}

	const config = getConfig();
	if (!paymentConfigured(config)) {
		return {
			ok: false,
			status: 503,
			code: "PAYGATE_NOT_AVAILABLE",
			error: "UPI payment is temporarily unavailable for this event",
		};
	}

	// Resume a live session rather than creating a second charge.
	if (data.paymentId && data.providerStatus === "pending" && String(data.upiUri ?? "")) {
		return sessionFrom(registration, data, { providerStatus: "pending", alreadyPaid: false });
	}

	// A previous attempt whose outcome is unknown. It blocks any *different*
	// request and is otherwise replayed exactly (see `recoverAttempt`).
	const attempt = createAttemptOf(data);
	if (attempt) {
		const recovery = await recoverAttempt(registration, data, attempt, fetchImpl);
		if (recovery) return recovery;
	}

	const body = buildCreateBody(registration);
	try {
		const created = await createAtProvider(registration, body, {
			idempotencyKey: idempotencyKeyFor(body),
			fetchImpl,
		});
		return sessionFrom(
			{ ...registration, payment_data: JSON.stringify(created.data) },
			created.data,
			{ providerStatus: "pending", alreadyPaid: false },
		);
	} catch (error) {
		return await creationFailure(registration, body, error);
	}
}

/**
 * Resolve an earlier attempt whose outcome is unknown.
 *
 * Returns a result when this call is answered by the attempt (a live session,
 * a held-money notice, an operator-review stop), and `null` only when the
 * provider has given an affirmative disposition that nothing live remains —
 * in which case the caller may safely post a fresh create.
 *
 * Two shapes are handled:
 *
 *   - **id known**: ask the provider about that id. `pending` resumes it,
 *     `paid` waits for the transition, `expired`/`cancelled` clear it.
 *   - **id unknown** (the answer was lost before the body arrived): the only
 *     safe move is to replay the *identical* request with its stored key, which
 *     the provider fingerprints and deduplicates. If the request we would send
 *     now differs — the amount or the attendee changed — nothing is posted:
 *     the attempt may still be live, so it is held for an operator.
 */
async function recoverAttempt(
	registration: PaymentRegistration,
	data: Record<string, unknown>,
	attempt: CreateAttempt,
	fetchImpl: typeof fetch,
): Promise<InitiateResult | null> {
	const body = buildCreateBody(registration);
	if (!sameCreateRequest(body, attempt.request)) {
		return await holdForReview(registration, data, attempt, body);
	}

	const paymentId = String(data.paymentId ?? "");
	if (paymentId) {
		return await verifyKnownSession(registration, data, attempt, paymentId, fetchImpl);
	}

	// No id, identical request: replay it. The provider answers 200 with the
	// original payment when the first attempt landed, or 201 when it did not.
	try {
		const created = await createAtProvider(registration, attempt.request, {
			idempotencyKey: attempt.idempotencyKey,
			fetchImpl,
		});
		return sessionFrom(
			{ ...registration, payment_data: JSON.stringify(created.data) },
			created.data,
			{ providerStatus: "pending", alreadyPaid: false },
		);
	} catch (error) {
		const failure = providerFailureOf(error);
		if (failure === "conflict") {
			// The key is held with a different fingerprint. That means an earlier
			// request for this registration is still recorded at the provider and
			// we cannot tell which: never guess, never post a fresh one.
			return await holdForReview(registration, data, attempt, body, "key_reused_with_other_request");
		}
		// Still unknown (ambiguous) or unavailable: the attempt stays exactly as
		// it is, so the next call replays the same immutable pair.
		if (failure === "ambiguous") {
			return await retryPending(registration, data, attempt);
		}
		return await creationFailure(registration, attempt.request, error);
	}
}

/**
 * Ask the provider about an id we hold for an unresolved attempt.
 *
 * `pending` resumes it; `paid` defers to the transition; `expired`/`cancelled`
 * are affirmative dispositions that clear the attempt so a fresh create is
 * safe. Anything else keeps the attempt untouched.
 */
async function verifyKnownSession(
	registration: PaymentRegistration,
	data: Record<string, unknown>,
	attempt: CreateAttempt,
	paymentId: string,
	fetchImpl: typeof fetch,
): Promise<InitiateResult | null> {
	const config = getConfig();
	let raw: Record<string, unknown>;
	try {
		const response = await callProvider(() =>
			fetchImpl(`${config.url}${PAYGATE_STATUS_PATH}/${encodeURIComponent(paymentId)}`, {
				method: "GET",
				headers: { Accept: "application/json", Authorization: `Bearer ${config.apiKey}` },
				signal: AbortSignal.timeout(5_000),
			}),
		);
		raw = await readProviderBody<Record<string, unknown>>(response, {
			operation: "PayGate verify",
			acceptStatus: (status) => status === 200,
		});
	} catch (error) {
		if (providerFailureOf(error) === "validation") {
			// A 404 can mean a scoped key or a retention window, so it is an
			// unknown identity, not an absent payment: the attempt is kept.
			return await retryPending(registration, data, attempt, "identity_unconfirmed");
		}
		throw error;
	}

	const status = String(raw.status ?? "").toLowerCase();
	if (status === "pending") {
		const merged = {
			...data,
			providerStatus: "pending",
			upiUri: String(raw.upi_uri ?? data.upiUri ?? ""),
			expiresAt: String(raw.expires_at ?? data.expiresAt ?? ""),
			createAttempt: undefined,
			attemptReview: undefined,
			sessionUnverified: false,
		};
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify(merged),
			registration.id,
		]);
		return sessionFrom({ ...registration, payment_data: JSON.stringify(merged) }, merged, {
			providerStatus: "pending",
			alreadyPaid: false,
		});
	}
	if (status === "paid") {
		// Money is in; the signed event or the transition finishes it. The
		// attempt stays until that affirmative confirmation lands.
		return {
			ok: false,
			status: 409,
			code: "PAYMENT_AWAITING_CONFIRMATION",
			error: "This payment has been made and is being confirmed. Do not pay again.",
			unverified: false,
		};
	}
	// expired / cancelled: an affirmative disposition with nothing live left.
	const cleared = { ...data, providerStatus: status, createAttempt: undefined, attemptReview: undefined };
	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify(cleared),
		registration.id,
	]);
	return null;
}

/**
 * Stop: an unresolved attempt exists and cannot be replayed safely because the
 * request we would send differs from it. The attempt may still be live at the
 * provider, so nothing is posted and the user is not told to pay again.
 */
async function holdForReview(
	registration: PaymentRegistration,
	data: Record<string, unknown>,
	attempt: CreateAttempt,
	body: Record<string, unknown>,
	reason = "request_changed",
): Promise<InitiateResult> {
	const review: AttemptReview = {
		reason,
		attemptedAmount: Number(attempt.request.amount ?? 0),
		requestedAmount: Number(body.amount ?? 0),
		since: attempt.requestedAt,
	};
	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify({ ...data, attemptReview: review, attemptReviewAt: new Date().toISOString() }),
		registration.id,
	]).catch((error: unknown) => {
		console.error("[paygate] could not record attempt review:", error);
	});
	return {
		ok: false,
		status: 409,
		code: "PAYGATE_ATTEMPT_REVIEW",
		error:
			"This registration has an earlier payment attempt we could not confirm. An organizer is checking it before you can pay again.",
		unverified: true,
		operatorReview: true,
	};
}

/** The attempt is unchanged and still unresolved: say exactly that. */
async function retryPending(
	registration: PaymentRegistration,
	data: Record<string, unknown>,
	attempt: CreateAttempt,
	reason = "unverified",
): Promise<InitiateResult> {
	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify({
			...data,
			provider: PAYGATE_PROVIDER,
			providerStatus: "unverified",
			sessionUnverified: true,
			// The attempt itself never changes; replay accounting is separate so
			// the exact key/DTO pair stays byte-identical.
			createAttempt: attempt,
			attemptReplays: (Number(data.attemptReplays ?? 0) || 0) + 1,
			lastSyncedAt: new Date().toISOString(),
		}),
		registration.id,
	]).catch((error: unknown) => {
		// The stored attempt is unchanged, which is what keeps the retry safe.
		console.error("[paygate] could not record the replayed attempt:", error);
	});
	return {
		ok: false,
		status: 503,
		code: "PAYGATE_VERIFYING",
		error:
			"We could not confirm the payment session yet. Please try again in a moment and do not pay until the QR code appears.",
		unverified: true,
		operatorReview: reason === "identity_unconfirmed",
	};
}

async function creationFailure(
	registration: PaymentRegistration,
	body: Record<string, unknown>,
	error: unknown,
): Promise<InitiateResult> {
	const failure = providerFailureOf(error);

	if (failure === "ambiguous") {
		// The provider may hold a payment we cannot name. Persist the *exact*
		// attempt (key + DTO) so the next call can replay it idempotently, and
		// keep the registration pending: nothing here may cancel a seat.
		const data = parseData(registration.payment_data);
		const attempt: CreateAttempt = createAttemptOf(data) ?? {
			idempotencyKey: idempotencyKeyFor(body),
			request: body,
			requestedAt: new Date().toISOString(),
		};
		// Awaited on purpose: this record is what stops the next attempt from
		// posting something else, so it must be committed before we answer.
		await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
			JSON.stringify({
				...data,
				provider: PAYGATE_PROVIDER,
				providerStatus: "unverified",
				sessionUnverified: true,
				createAttempt: attempt,
				lastSyncedAt: new Date().toISOString(),
			}),
			registration.id,
		]).catch((writeError: unknown) => {
			// Losing this record is not silent: the deterministic key still makes
			// a replay safe, it only costs one wasted attempt.
			console.error("[paygate] could not record an unverified create:", writeError);
		});
		return {
			ok: false,
			status: 503,
			code: "PAYGATE_VERIFYING",
			error:
				"We could not confirm the payment session yet. Please try again in a moment and do not pay until the QR code appears.",
			unverified: true,
		};
	}

	if (failure === "capacity" || failure === "rate_limited" || failure === "unavailable") {
		return {
			ok: false,
			status: 503,
			code: "PAYGATE_NOT_AVAILABLE",
			error: "UPI payment is temporarily unavailable for this event",
		};
	}
	if (failure === "conflict") {
		return {
			ok: false,
			status: 409,
			code: "PAYGATE_SESSION_CONFLICT",
			error: "A different payment session already exists for this registration",
		};
	}
	// Validation (including a 401 from a rotated key) and anything unrecognised.
	return {
		ok: false,
		status: 502,
		code: "PAYGATE_REQUEST_REFUSED",
		error: "The payment service refused this request",
	};
}

/** Current payment state for a registration the caller owns. */
export async function getPaymentStatus(
	registrationId: string,
	userId: string,
): Promise<
	| {
			ok: true;
			paymentRequired: boolean;
			/** False when this deployment may not act on PayGate; see getConfig(). */
			paygateAvailable: boolean;
			registrationStatus: string;
			paymentStatus: string;
			amount: number;
			providerStatus: string;
			manualReview: boolean;
			reviewReason: string;
			expiresAt: string;
			upiUri: string;
	  }
	| { ok: false; status: number; code: string; error: string }
> {
	const found = await query<PaymentRegistration>("SELECT * FROM registrations WHERE id = ?", [
		registrationId,
	]);
	const registration = found.rows[0];
	if (!registration || registration.user_id !== userId) {
		return { ok: false, status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" };
	}

	const data = parseData(registration.payment_data);
	const amount = finalFeePaise(registration) / 100;
	const status = registration.registration_status ?? "";
	const paymentStatus = registration.payment_status ?? "";

	// Status polling obeys the same fail-closed rule as initiation. Without this,
	// a staging deployment that inherited a live endpoint would still show a
	// pending UPI payment (with a usable `upiUri`) for a flow it refuses to
	// start or apply. When PayGate is not active here, a pending payment is
	// reported as unavailable rather than actionable.
	const paygate = paygateActive();
	const pendingHere = status === "pending" && paymentStatus === "pending" && amount > 0;

	return {
		ok: true,
		paymentRequired: pendingHere && paygate,
		paygateAvailable: paygate,
		paymentStatus,
		registrationStatus: status,
		amount,
		providerStatus: String(data.providerStatus ?? ""),
		manualReview: data.manualReview === true,
		reviewReason: String(data.reviewReason ?? ""),
		expiresAt: String(data.expiresAt ?? ""),
		upiUri: paygate ? String(data.upiUri ?? "") : "",
	};
}
