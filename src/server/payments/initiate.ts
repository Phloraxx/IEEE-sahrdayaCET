/**
 * Payment initiation — port of `createPaymentForRegistration` and
 * `paymentSession` from `pb_hooks/paygate-helpers.js`.
 *
 * Phase 3 keeps the provider call behind a config check: without a configured
 * PayGate URL and API key this answers 503, exactly as the hook did, rather than
 * pretending a session exists. That is also why no test in this repo sends money
 * — the webhook path is what the tests exercise, with a locally signed payload.
 */

import { query } from "@/lib/db.server";
import { finalFeePaise } from "@/server/registration/helpers";
import {
	PAYGATE_PROVIDER,
	deploymentNamespace,
	expectedRequestedPaise,
	getConfig,
	idempotencyKeyForRegistration,
	paymentConfigured,
} from "./paygate";

export interface PaymentRegistration {
	id: string;
	user_id: string | null;
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
	  }
	| { ok: false; status: number; code: string; error: string };

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

	if (registration.payment_status === "paid") {
		return {
			ok: true,
			status: 200,
			paymentRequired: false,
			amount: finalFeePaise(registration) / 100,
			paymentId: String(parseData(registration.payment_data).paymentId ?? ""),
			providerStatus: "paid",
			upiUri: "",
			expiresAt: "",
			alreadyPaid: true,
		};
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

	const data = parseData(registration.payment_data);
	const requestedPaise = expectedRequestedPaise(finalPaise / 100);

	// Resume an existing session rather than creating a second charge.
	if (data.paymentId && data.providerStatus === "pending") {
		return {
			ok: true,
			status: 200,
			paymentRequired: true,
			amount: finalPaise / 100,
			paymentId: String(data.paymentId),
			providerStatus: "pending",
			upiUri: String(data.upiUri ?? ""),
			expiresAt: String(data.expiresAt ?? ""),
			alreadyPaid: false,
		};
	}

	const response = await fetchImpl(`${config.url}/v4/payments`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
			"Idempotency-Key": idempotencyKeyForRegistration(registration.id),
		},
		body: JSON.stringify({
			requestedAmount: { paise: requestedPaise, rupees: finalPaise / 100 },
			externalId: registration.event_id,
			metadata: {
				registration_id: registration.id,
				environment: deploymentNamespace(),
			},
		}),
	}).catch(() => null);

	if (!response || !response.ok) {
		return {
			ok: false,
			status: 503,
			code: "PAYGATE_NOT_AVAILABLE",
			error: "UPI payment is temporarily unavailable for this event",
		};
	}

	const payload = (await response.json().catch(() => null)) as {
		id?: string;
		status?: string;
		upiUri?: string;
		expiresAt?: string;
		payableAmount?: { paise?: number; rupees?: number };
	} | null;

	if (!payload?.id) {
		return {
			ok: false,
			status: 502,
			code: "PAYGATE_BAD_RESPONSE",
			error: "PayGate returned an invalid payment response",
		};
	}

	const next = {
		...data,
		provider: PAYGATE_PROVIDER,
		paymentId: payload.id,
		providerStatus: payload.status ?? "pending",
		requestedAmountPaise: requestedPaise,
		payableAmountPaise: Number(payload.payableAmount?.paise ?? 0),
		payableAmount: Number(payload.payableAmount?.rupees ?? 0),
		upiUri: payload.upiUri ?? "",
		expiresAt: payload.expiresAt ?? "",
	};

	await query("UPDATE registrations SET payment_data = ? WHERE id = ?", [
		JSON.stringify(next),
		registration.id,
	]);

	return {
		ok: true,
		status: 200,
		paymentRequired: true,
		amount: finalPaise / 100,
		paymentId: payload.id,
		providerStatus: String(payload.status ?? "pending"),
		upiUri: payload.upiUri ?? "",
		expiresAt: payload.expiresAt ?? "",
		alreadyPaid: false,
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
			paymentStatus: string;
			registrationStatus: string;
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

	return {
		ok: true,
		paymentRequired: status === "pending" && paymentStatus === "pending" && amount > 0,
		paymentStatus,
		registrationStatus: status,
		amount,
		providerStatus: String(data.providerStatus ?? ""),
		manualReview: data.manualReview === true,
		reviewReason: String(data.reviewReason ?? ""),
		expiresAt: String(data.expiresAt ?? ""),
		upiUri: String(data.upiUri ?? ""),
	};
}
