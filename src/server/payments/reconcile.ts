/**
 * Payment-expiry reconciliation.
 *
 * Ported from the `paygate-registration-expiry` cron in `paygate.pb.js`.
 *
 * The rule that matters: **a webhook is an optimisation, not a correctness
 * dependency.** A registration whose payment window closes must not sit pending
 * forever just because no webhook arrived. This pass is the independent path
 * that releases the seat.
 *
 * The counter-rule matters just as much: **never release a real provider session
 * from stale state.** If PayGate is unreachable or asks us to slow down, the
 * seat stays pending and the next pass retries. Releasing on a transient error
 * would drop an on-time bank credit whose SMS landed near the expiry boundary.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { recomputeEventCounters, recomputeCouponUsedCount } from "@/server/registration/waitlist";
import { PAYGATE_PROVIDER } from "@/server/payments/paygate";

export interface PendingRegistration {
	id: string;
	event_id: string;
	registration_status: string;
	payment_status: string;
	registration_date: string | null;
	created_at: string;
	coupon_code: string | null;
	payment_data: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
	if (!value) return {};
	if (typeof value === "object") return value as Record<string, unknown>;
	try {
		const parsed = JSON.parse(String(value)) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function toPositiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Should this pending registration's seat be released?
 *
 * Ported verbatim from `shouldReleasePendingRegistration`. Returns false for
 * anything it does not positively recognise, so an unknown provider state keeps
 * the seat rather than dropping it.
 */
export function shouldReleasePendingRegistration(
	registration: {
		registration_status: string;
		payment_status: string;
		registration_date: string | null;
		created_at: string;
		payment_data: string | null;
	},
	nowMs: number,
	graceSeconds: number,
): boolean {
	if (registration.registration_status !== "pending") return false;
	if (registration.payment_status !== "pending") return false;

	const data = asObject(registration.payment_data);
	if (data.provider !== PAYGATE_PROVIDER) return false;

	const status = String(data.providerStatus ?? "not_initialized");
	const graceMs = toPositiveInt(graceSeconds, 600) * 1000;

	if (status === "cancelled" || status === "late") return true;

	if (status === "expired") {
		const expiresAt = Date.parse(String(data.expiresAt ?? ""));
		return Number.isFinite(expiresAt) && nowMs > expiresAt + graceMs;
	}

	if (status === "not_initialized") {
		const createdAt = Date.parse(registration.registration_date ?? registration.created_at ?? "");
		return Number.isFinite(createdAt) && nowMs > createdAt + graceMs;
	}

	return false;
}

/** Why the seat was released — recorded so the audit trail explains itself. */
function releaseReason(providerStatus: string): string {
	if (providerStatus === "expired") {
		return "PayGate payment expired and the IEEE grace window elapsed";
	}
	if (providerStatus === "not_initialized") {
		return "PayGate payment was never initialized before the IEEE grace window elapsed";
	}
	return "PayGate payment could not complete";
}

export interface ReconcileOptions {
	/** Grace period after expiry before the seat is released. Default 600s. */
	graceSeconds?: number;
	/**
	 * Probe the provider for a session's authoritative state.
	 *
	 * Returns `null` when the provider cannot be reached or asks us to back off —
	 * in which case the seat is kept and retried next pass. Tests inject this.
	 */
	probeProvider?: (registration: PendingRegistration) => Promise<{
		reachable: boolean;
		providerStatus?: string;
		expiresAt?: string;
	} | null>;
	now?: number;
}

export interface ReconcileResult {
	scanned: number;
	released: number;
	keptForProvider: number;
	skipped: number;
	releasedIds: string[];
}

/**
 * One reconciliation pass.
 *
 * Safe to run concurrently with webhooks: every release re-reads the row inside
 * its transaction and re-checks the release condition, so a payment that
 * confirms mid-pass wins.
 */
export async function reconcileExpiredRegistrations(
	options: ReconcileOptions = {},
): Promise<ReconcileResult> {
	const graceSeconds = options.graceSeconds ?? 600;
	const nowMs = options.now ?? Date.now();

	const pending = await query<PendingRegistration>(
		`SELECT id, event_id, registration_status, payment_status, registration_date,
		        created_at, coupon_code, payment_data
		   FROM registrations
		  WHERE registration_status = 'pending' AND payment_status = 'pending'
		  ORDER BY registration_date ASC`,
	);

	const result: ReconcileResult = {
		scanned: pending.rows.length,
		released: 0,
		keptForProvider: 0,
		skipped: 0,
		releasedIds: [],
	};

	for (const row of pending.rows) {
		let data = asObject(row.payment_data);
		if (data.provider !== PAYGATE_PROVIDER) {
			result.skipped += 1;
			continue;
		}

		// A registration with no provider payment id was never initialised, so the
		// local clock is authoritative and there is nothing to ask the provider.
		let providerAuthoritative = !data.paymentId;

		if (data.paymentId && options.probeProvider) {
			try {
				const probe = await options.probeProvider(row);
				if (probe && probe.reachable) {
					providerAuthoritative = true;
					if (probe.providerStatus) {
						data = { ...data, providerStatus: probe.providerStatus };
						if (probe.expiresAt) data.expiresAt = probe.expiresAt;
					}
				} else {
					providerAuthoritative = false;
				}
			} catch {
				providerAuthoritative = false;
			}
		}

		// Never release a real provider session from stale state.
		if (data.paymentId && !providerAuthoritative) {
			result.keptForProvider += 1;
			continue;
		}

		const candidate = { ...row, payment_data: JSON.stringify(data) };
		if (!shouldReleasePendingRegistration(candidate, nowMs, graceSeconds)) {
			result.skipped += 1;
			continue;
		}

		let released = false;
		let eventId = "";
		let couponCode = "";

		await withTransaction(async () => {
			// Re-read inside the transaction: a webhook may have confirmed it.
			const live = await query<PendingRegistration>(
				`SELECT id, event_id, registration_status, payment_status, registration_date,
				        created_at, coupon_code, payment_data
				   FROM registrations WHERE id = ?`,
				[row.id],
			);
			const current = live.rows[0];
			if (!current) return;

			const liveData = asObject(current.payment_data);
			if (liveData.provider !== PAYGATE_PROVIDER) return;
			if (liveData.paymentId && !providerAuthoritative) return;
			if (!shouldReleasePendingRegistration({ ...current, payment_data: JSON.stringify(liveData) }, nowMs, graceSeconds)) {
				return;
			}

			const reason = releaseReason(String(liveData.providerStatus ?? "not_initialized"));
			const nextData = { ...liveData, releaseReason: reason };

			await query(
				`UPDATE registrations
				    SET payment_status = 'failed', registration_status = 'cancelled',
				        payment_data = ?, updated_at = ?
				  WHERE id = ?`,
				[JSON.stringify(nextData), new Date().toISOString(), current.id],
			);

			await audit({
				actorId: null,
				action: "payment.expiry-release",
				eventId: current.event_id,
				registrationId: current.id,
				entityType: "registration",
				entityId: current.id,
				note: reason,
				before: { registrationStatus: "pending", paymentStatus: "pending" },
				after: { registrationStatus: "cancelled", paymentStatus: "failed" },
			});

			released = true;
			eventId = current.event_id;
			couponCode = current.coupon_code ?? "";
		});

		if (released) {
			result.released += 1;
			result.releasedIds.push(row.id);
			await recomputeEventCounters(eventId);
			if (couponCode) await recomputeCouponUsedCount(couponCode, eventId);
		}
	}

	return result;
}
