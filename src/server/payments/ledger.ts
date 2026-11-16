/**
 * Payment ledger — port of `syncPaymentLedger` from `pb_hooks/paygate-helpers.js`.
 *
 * One ledger row per provider payment. The lookup order is what makes webhook
 * replay idempotent:
 *   1. by `provider_order_id` — a replay of the same provider payment finds the
 *      same row and updates it instead of inserting a second one;
 *   2. by (registration, provider) — repairs a row that was created before the
 *      provider id was known.
 *
 * `collected_paise` only ever moves up (`max(old, new)`), so a stale
 * out-of-order event cannot reduce the recorded amount.
 */

import { query } from "@/lib/db.server";
import { finalFeePaise } from "@/server/registration/helpers";
import { PAYGATE_PROVIDER, isCollected, ledgerStatusFor, type ProviderPayment } from "./paygate";

export interface LedgerRegistration {
	id: string;
	event_id: string;
	final_fee_paise: number;
	discount_paise: number;
	base_fee_paise: number;
	amount: number | null;
}

export interface LedgerOptions {
	manualReview?: boolean;
	reviewReason?: string;
}

/**
 * Create or update the ledger row for a provider payment.
 *
 * Returns the row id. Must be called inside the caller's transaction so the
 * ledger write commits or rolls back with the registration transition.
 */
export async function syncPaymentLedger(
	registration: LedgerRegistration,
	payment: ProviderPayment,
	options: LedgerOptions = {},
): Promise<string | null> {
	if (!registration || !payment?.id) return null;

	const providerStatus = payment.status || "pending";
	const manualReview = options.manualReview === true;

	const finalPaise = finalFeePaise(registration);
	const discountPaise = Number(registration.discount_paise) || 0;
	const basePaise = Number(registration.base_fee_paise) || finalPaise + discountPaise;
	const collectedPaise = isCollected(providerStatus)
		? Number(payment.payableAmountPaise) || 0
		: 0;
	const status = ledgerStatusFor(providerStatus, manualReview);
	const nowIsoValue = new Date().toISOString();

	// 1. Same provider payment id?
	const byProvider = await query<{ id: string; collected_paise: number; captured_at: string | null }>(
		"SELECT id, collected_paise, captured_at FROM payments WHERE provider_order_id = ? LIMIT 1",
		[payment.id],
	);

	// 2. Otherwise the newest PayGate row for this registration.
	let existing = byProvider.rows[0];
	if (!existing) {
		const byRegistration = await query<{
			id: string;
			collected_paise: number;
			captured_at: string | null;
		}>(
			`SELECT id, collected_paise, captured_at FROM payments
			  WHERE registration_id = ? AND provider = ?
			  ORDER BY created_at DESC LIMIT 1`,
			[registration.id, PAYGATE_PROVIDER],
		);
		existing = byRegistration.rows[0];
	}

	if (!existing) {
		const id = crypto.randomUUID();
		await query(
			`INSERT INTO payments (
			   id, registration_id, event_id, provider, provider_order_id, receipt, status,
			   base_fee_paise, discount_paise, final_fee_paise, collected_paise, refunded_paise,
			   currency, payment_method, confirmation_source, captured_at, last_synced_at,
			   manual_review, review_reason
			 ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			[
				id,
				registration.id,
				registration.event_id,
				PAYGATE_PROVIDER,
				payment.id,
				`paygate_${registration.id}`.slice(0, 120),
				status,
				basePaise,
				discountPaise,
				finalPaise,
				collectedPaise,
				0,
				"INR",
				"upi",
				PAYGATE_PROVIDER,
				providerStatus === "paid" ? payment.paidAt || nowIsoValue : null,
				nowIsoValue,
				manualReview || providerStatus === "late" ? 1 : 0,
				String(options.reviewReason ?? ""),
			],
		);
		return id;
	}

	const capturedAt =
		providerStatus === "paid" && !existing.captured_at
			? payment.paidAt || nowIsoValue
			: existing.captured_at;

	await query(
		`UPDATE payments
		    SET provider_order_id = ?, status = ?, base_fee_paise = ?, discount_paise = ?,
		        final_fee_paise = ?, collected_paise = ?, currency = 'INR',
		        payment_method = 'upi', confirmation_source = ?, last_synced_at = ?,
		        manual_review = ?, review_reason = ?, captured_at = ?
		  WHERE id = ?`,
		[
			payment.id,
			status,
			basePaise,
			discountPaise,
			finalPaise,
			// Never reduce a recorded collection.
			Math.max(Number(existing.collected_paise) || 0, collectedPaise),
			PAYGATE_PROVIDER,
			nowIsoValue,
			manualReview || providerStatus === "late" ? 1 : 0,
			String(options.reviewReason ?? ""),
			capturedAt,
			existing.id,
		],
	);
	return existing.id;
}

/** The ledger row for a registration, if any. */
export async function findLedgerForRegistration(registrationId: string): Promise<
	| {
			id: string;
			status: string;
			collected_paise: number;
			final_fee_paise: number;
			manual_review: number;
			review_reason: string | null;
			captured_at: string | null;
	  }
	| undefined
> {
	const result = await query<{
		id: string;
		status: string;
		collected_paise: number;
		final_fee_paise: number;
		manual_review: number;
		review_reason: string | null;
		captured_at: string | null;
	}>(
		`SELECT id, status, collected_paise, final_fee_paise, manual_review, review_reason, captured_at
		   FROM payments WHERE registration_id = ? ORDER BY created_at DESC LIMIT 1`,
		[registrationId],
	);
	return result.rows[0];
}
