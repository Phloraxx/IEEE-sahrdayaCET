/**
 * `POST /api/webhooks/paygate` — PayGate v4 webhook.
 *
 * Port of `pb_hooks/paygate.pb.js`. The signed webhook is an optimisation;
 * reconciliation is the independent correctness path, and both share
 * `applyProviderState`.
 *
 * Idempotency, in order:
 *   1. the signature is verified over the **raw** body before anything is parsed;
 *   2. a replayed event id is recognised from the registration's payment data
 *      and answered "already processed" without a second transition;
 *   3. the ledger is keyed by provider payment id, so a replay cannot insert a
 *      second row.
 *
 * A bad signature is 400/401 and never reaches the database.
 */

import type { ActionFunctionArgs } from "react-router";
import { query, withTransaction } from "@/lib/db.server";
import { applyProviderState, hasEventId } from "@/server/payments/apply";
import { paymentConfirmationDisposition, recordPaidManualReview } from "@/server/payments/guard";
import { syncPaymentLedger } from "@/server/payments/ledger";
import {
	PAYGATE_PROVIDER,
	getConfig,
	normalizeProviderPayment,
	validateProviderPayment,
	verifyWebhookSignature,
	webhookConfigured,
} from "@/server/payments/paygate";
import { finalFeePaise } from "@/server/registration/helpers";

const HANDLED = new Set(["payment.paid", "payment.expired", "payment.cancelled", "payment.late"]);

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

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

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}

	const config = getConfig();
	if (!webhookConfigured(config)) {
		return json(
			{ code: "PAYGATE_WEBHOOK_NOT_CONFIGURED", error: "PayGate webhook is not configured" },
			503,
		);
	}

	const eventId = (
		request.headers.get("X-PayGate-Event-Id") ??
		request.headers.get("PayGate-Event-Id") ??
		""
	).trim();
	const timestamp = (
		request.headers.get("X-PayGate-Timestamp") ??
		request.headers.get("PayGate-Timestamp") ??
		""
	).trim();
	const signatureHeader = (
		request.headers.get("X-PayGate-Signature") ??
		request.headers.get("PayGate-Signature") ??
		""
	).trim();

	if (!eventId || !timestamp || !signatureHeader) {
		return json(
			{ code: "PAYGATE_SIGNATURE_MISSING", error: "Missing PayGate signature headers" },
			401,
		);
	}

	// The signature covers the raw body, so read it as text first.
	const rawBody = await request.text();

	const signature = verifyWebhookSignature({
		timestamp,
		rawBody,
		signatureHeader,
		secret: config.webhookSecret,
		toleranceSeconds: config.webhookToleranceSeconds,
	});
	if (!signature.ok) return json({ code: signature.code, error: signature.error }, 400);

	let body: { id?: string; type?: string; data?: { payment?: unknown } };
	try {
		body = JSON.parse(rawBody || "{}");
	} catch {
		return json({ code: "INVALID_JSON", error: "Invalid webhook body" }, 400);
	}
	if (!body || typeof body !== "object" || body.id !== eventId || typeof body.type !== "string") {
		return json({ code: "INVALID_PAYGATE_EVENT", error: "Invalid PayGate event envelope" }, 400);
	}

	// Narrow once: TypeScript does not carry the check into the transaction closure.
	const eventType: string = body.type;
	if (!HANDLED.has(eventType)) return json({ success: true, ignored: true, type: eventType }, 200);

	const rawPayment = body.data?.payment;
	const normalized = normalizeProviderPayment(rawPayment);
	const registrationId = String(normalized?.metadata.registration_id ?? "").trim();
	if (!registrationId) return json({ success: true, ignored: true }, 200);

	try {
		return await withTransaction(async (): Promise<Response> => {
			const found = await query<{
				id: string;
				event_id: string;
				registration_status: string | null;
				payment_status: string | null;
				ticket_id: string | null;
				coupon_code: string | null;
				payment_data: string | null;
				final_fee_paise: number;
				discount_paise: number;
				base_fee_paise: number;
				amount: number | null;
			}>("SELECT * FROM registrations WHERE id = ?", [registrationId]);

			const registration = found.rows[0];
			if (!registration) {
				return json({ code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }, 404);
			}

			const current = parseData(registration.payment_data);
			if (current.provider !== PAYGATE_PROVIDER) {
				return json(
					{ code: "PAYMENT_PROVIDER_CONFLICT", error: "Registration is not assigned to PayGate" },
					409,
				);
			}

			// Replay: this exact event was already applied.
			if (hasEventId(current, eventId)) {
				const replayPayment = normalizeProviderPayment(rawPayment);
				if (replayPayment) {
					await syncPaymentLedger(registration, replayPayment, {
						manualReview: current.manualReview === true,
						reviewReason: String(current.reviewReason ?? ""),
					});
				}
				return json({ success: true, message: "Already processed" }, 200);
			}

			const finalPaise = finalFeePaise(registration);
			if (finalPaise <= 0 || finalPaise % 100 !== 0) {
				return json(
					{ code: "PAYGATE_EVENT_MISMATCH", error: "Registration amount is not compatible with PayGate" },
					400,
				);
			}

			const validated = validateProviderPayment(rawPayment, finalPaise / 100, {
				paymentId: current.paymentId ? String(current.paymentId) : undefined,
				externalId: registration.event_id,
				registrationId: registration.id,
			});
			if (!validated.ok) {
				return json({ code: "PAYGATE_EVENT_MISMATCH", error: validated.error }, 400);
			}

			// Money that arrives after the seat was released is parked, not applied.
			if (validated.payment.status === "paid") {
				const disposition = await paymentConfirmationDisposition(registration);
				if (disposition.blocked) {
					await recordPaidManualReview(
						registration.id,
						{
							id: validated.payment.id,
							payableAmountPaise: validated.payment.payableAmountPaise,
							paidAt: validated.payment.paidAt,
						},
						registration.event_id,
						disposition.reason,
					);
					await syncPaymentLedger(registration, validated.payment, {
						manualReview: true,
						reviewReason: disposition.reason,
					});
					return json({ success: true, action: "paid_manual_review" }, 200);
				}
			}

			const result = await applyProviderState(
				registration,
				validated.payment,
				eventType,
				eventId,
			);
			if (result.action === "error") {
				return json({ code: "PAYGATE_EVENT_MISMATCH", error: result.error }, 400);
			}
			return json({ success: true, action: result.action }, 200);
		});
	} catch (err) {
		console.error(
			"[paygate] webhook transaction failed:",
			err instanceof Error ? err.message : "unknown",
		);
		return json(
			{ code: "PAYGATE_WEBHOOK_FAILED", error: "Could not persist PayGate webhook state" },
			500,
		);
	}
}

export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
