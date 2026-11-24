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
import { query } from "@/lib/db.server";
import { applyProviderPaymentToRegistration, hasEventId } from "@/server/payments/apply";
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

/**
 * The event types we can act on: the four v4 product statuses (the provider
 * only publishes pending|paid|expired|cancelled), plus `late`, which older
 * signed deliveries and the local lifecycle still produce. `payment.pending`
 * from v4 is accepted as a no-op transition.
 */
const HANDLED = new Set([
	"payment.paid",
	"payment.expired",
	"payment.cancelled",
	"payment.pending",
	"payment.late",
]);

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
	// `late` stays accepted on purpose: it is not a PayGate v4 status (the
	// provider only publishes pending|paid|expired|cancelled) but older signed
	// deliveries and the local lifecycle still produce it, and it must keep
	// landing in manual review rather than be acknowledged and dropped.
	if (!HANDLED.has(eventType)) {
		// A 4xx is not retried by the provider (only 408/425/429/5xx are), so an
		// event we cannot interpret stops retrying and stays visible in its
		// Activity log for an operator — where an unreachable 200/501 would
		// either be retried eight times over two days or recorded as delivered.
		return json({ code: "PAYGATE_EVENT_UNHANDLED", error: "Unsupported PayGate event type", type: eventType }, 422);
	}

	const rawPayment = body.data?.payment;
	const normalized = normalizeProviderPayment(rawPayment);
	const registrationId = String(normalized?.metadata.registration_id ?? "").trim();
	// Not ours to act on (no registration metadata). Acknowledged so the
	// provider does not retry it for days.
	if (!registrationId) return json({ success: true, ignored: true, reason: "no_registration" }, 200);

	try {
		// Replay check first so a duplicate never re-applies a transition. The
		// transition itself enqueues the ticket/receipt inside its transaction,
		// so a confirmation can never commit without its delivery intent.
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

		// Everything below this line is authenticated: the provider signs its
		// own events, so a refusal here means *we* could not apply it yet. It is
		// answered non-2xx on purpose — the provider retries, and a transient
		// rejection must not be recorded as "processed". PayGate retries 408,
		// 425, 429 and 5xx, so the transient cases use 503 and a permanent
		// mismatch uses 409 (acked, and surfaced in the provider's Activity log).
		const finalPaise = finalFeePaise(registration);
		if (finalPaise <= 0 || finalPaise % 100 !== 0) {
			return json(
				{ code: "PAYGATE_EVENT_MISMATCH", error: "Registration amount is not compatible with PayGate" },
				409,
			);
		}

		const validated = validateProviderPayment(rawPayment, finalPaise / 100, {
			paymentId: current.paymentId ? String(current.paymentId) : undefined,
			externalId: registration.event_id,
			registrationId: registration.id,
		});
		if (!validated.ok) {
			return json({ code: "PAYGATE_EVENT_MISMATCH", error: validated.error }, 409);
		}

		// One transition for webhook, poll and refresh: it re-reads the row under
		// the write lock, parks money that arrived after the seat was released,
		// and queues the ticket/receipt in the same transaction.
		const result = await applyProviderPaymentToRegistration({
			registrationId: registration.id,
			payment: validated.payment,
			eventType,
			eventId,
			revalidate: false,
		});

		if (result.action === "error") {
			return json({ code: "PAYGATE_EVENT_MISMATCH", error: result.error }, 409);
		}
		if (!result.action) {
			// A racing webhook, poll or refresh applied this first. Retrying with
			// 5xx cannot help and would re-enter the same race, so it is acked.
			return json(
				{ code: "PAYGATE_EVENT_MISMATCH", error: "Registration changed while the event was applied" },
				409,
			);
		}
		return json({ success: true, action: result.action }, 200);
	} catch (err) {
		console.error(
			"[paygate] webhook transaction failed:",
			err instanceof Error ? err.message : "unknown",
		);
		// A 500 is retried by the provider, which is what a transient write
		// failure needs.
		return json(
			{ code: "PAYGATE_WEBHOOK_FAILED", error: "Could not persist PayGate webhook state" },
			500,
		);
	}
}

export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
