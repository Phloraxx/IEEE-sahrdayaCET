/**
 * Payment-expiry reconciliation.
 *
 * Ported from the `paygate-registration-expiry` cron in `paygate.pb.js`, and
 * completed: the pass now *reads each pending reservation's provider state*
 * instead of trusting a webhook that may never arrive.
 *
 * The rule that matters: **a webhook is an optimisation, not a correctness
 * dependency.** A registration whose payment window closes must not sit pending
 * forever just because no webhook arrived. This pass is the independent path:
 *
 *   - it confirms a reservation the provider already reports as `paid` (a lost
 *     webhook is recovered here, through the same transition the webhook uses);
 *   - it releases a seat the provider reports as `expired`/`cancelled`/`late`
 *     once the IEEE grace window has elapsed;
 *   - it releases a reservation that never reached the provider at all
 *     (`not_initialized`) after the same grace window.
 *
 * The counter-rules matter just as much:
 *
 *   - **never release a real provider session from stale local knowledge.** If
 *     PayGate is unreachable, times out, rate-limits or answers something
 *     contradictory, the seat stays pending and the next pass retries. Releasing
 *     on a transient error would drop an on-time bank credit whose SMS landed
 *     near the expiry boundary.
 *   - **never ask the provider about every row on every tick.** Rows are only
 *     polled once they are worth polling (near or past their local expiry), at
 *     a bounded rate, with jitter so a burst of reservations does not become a
 *     burst of provider reads.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { recomputeEventCounters, recomputeCouponUsedCount } from "@/server/registration/waitlist";
import {
	PAYGATE_PROVIDER,
	deploymentNamespace,
	eventTypeForStatus,
	getConfig,
	readProviderPayment,
	type ProviderPayment,
	type ProviderRead,
} from "@/server/payments/paygate";
import {
	releaseReasonFor,
	shouldReleasePendingRegistration,
} from "@/server/payments/expiry";
import { applyProviderPaymentToRegistration } from "@/server/payments/apply";

export { shouldReleasePendingRegistration };

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

/** How many provider reads one pass may start. */
export const DEFAULT_PROVIDER_POLL_LIMIT = 20;
/** Minimum gap between two reads of the same payment. */
export const DEFAULT_PROVIDER_POLL_INTERVAL_MS = 30_000;
/** A pass may spend this long starting reads; the rest wait for the next minute. */
export const DEFAULT_PROVIDER_POLL_BUDGET_MS = 15_000;

/**
 * Is this row worth a provider read yet?
 *
 * A reservation is polled once its local expiry (or, if the provider never made
 * a session, its grace window) is close — so a healthy checkout that resolves
 * by webhook costs no provider call at all. Rows already past their expiry are
 * exactly the ones a lost webhook strands, so they are always due (subject only
 * to the per-payment interval).
 */
export function isProviderPollDue(input: {
	paymentData: Record<string, unknown>;
	nowMs: number;
	graceSeconds: number;
	intervalMs?: number;
}): boolean {
	// Only a *provider read* stamps `providerPolledAt`; `lastSyncedAt` also
	// moves when a session is created and must not delay the first read.
	const lastSynced = Date.parse(String(input.paymentData.providerPolledAt ?? ""));
	if (
		Number.isFinite(lastSynced) &&
		input.nowMs - lastSynced < (input.intervalMs ?? DEFAULT_PROVIDER_POLL_INTERVAL_MS)
	) {
		return false;
	}
	const expiresAt = Date.parse(String(input.paymentData.expiresAt ?? ""));
	if (Number.isFinite(expiresAt)) {
		return input.nowMs >= expiresAt - 2 * input.graceSeconds * 1000;
	}
	// No expiry recorded: the provider owns the answer, so always ask.
	return true;
}

export type ProviderProbe = (registration: PendingRegistration) => Promise<ProviderRead>;

/**
 * The read the scheduler uses. Bounded in time, validated against the
 * registration's amount and identity, and never throws.
 */
export function providerProbe(fetchImpl: typeof fetch = fetch): ProviderProbe {
	return async (registration) => {
		const data = asObject(registration.payment_data);
		return readProviderPayment(
			String(data.paymentId ?? ""),
			{ registrationId: registration.id, environment: deploymentNamespace() },
			fetchImpl,
			getConfig(),
		);
	};
}

export interface ReconcileOptions {
	/** Grace period after expiry before the seat is released. Default 600s. */
	graceSeconds?: number;
	/**
	 * Read a session's authoritative state.
	 *
	 * Returns a `ProviderRead`; `unavailable` keeps the seat and retries next
	 * pass. Defaults to the real bounded HTTP read. Tests inject this.
	 */
	probeProvider?: ProviderProbe;
	/** Diagnostic alias for `probeProvider`; must not return `ok` without a payment. */
	inspectProvider?: ProviderProbe;
	now?: number;
	/** Provider reads this pass may start. Default 20. */
	pollLimit?: number;
	/** Minimum gap between two reads of one payment. Default 30s. */
	pollIntervalMs?: number;
	/** Injectable jitter in [0,1); tests pin it. Default Math.random. */
	random?: () => number;
	/** Wall-clock budget for starting new provider reads. Default 15s. */
	pollBudgetMs?: number;
}

export interface ReconcileResult {
	scanned: number;
	released: number;
	confirmed: number;
	keptForProvider: number;
	/** Reads skipped because the provider status read is switched off. */
	readsDisabled: number;
	polled: number;
	skipped: number;
	releasedIds: string[];
	confirmedIds: string[];
}

/**
 * One reconciliation pass.
 *
 * Safe to run concurrently with webhooks and user refreshes: every confirmation
 * and release goes through a transaction that re-reads the row and re-checks the
 * condition, so whoever commits first wins and the others become no-ops.
 */
export async function reconcileExpiredRegistrations(
	options: ReconcileOptions = {},
): Promise<ReconcileResult> {
	const config = getConfig();
	const graceSeconds = options.graceSeconds ?? config.registrationGraceSeconds;
	const nowMs = options.now ?? Date.now();
	const nowIso = new Date(nowMs).toISOString();
	const startedAt = Date.now();
	const pollLimit = Math.max(1, Math.floor(options.pollLimit ?? DEFAULT_PROVIDER_POLL_LIMIT));
	const pollBudgetMs = Math.max(1_000, options.pollBudgetMs ?? DEFAULT_PROVIDER_POLL_BUDGET_MS);
	const intervalMs = options.pollIntervalMs ?? DEFAULT_PROVIDER_POLL_INTERVAL_MS;
	const random = options.random ?? Math.random;
	const probe =
		options.probeProvider ?? options.inspectProvider ?? providerProbe();

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
		confirmed: 0,
		keptForProvider: 0,
		readsDisabled: 0,
		polled: 0,
		skipped: 0,
		releasedIds: [],
		confirmedIds: [],
	};

	for (const row of pending.rows) {
		// One tick must stay short: stop opening new reads after `pollBudgetMs`.
		if (Date.now() - startedAt > pollBudgetMs) break;

		const data = asObject(row.payment_data);
		if (data.provider !== PAYGATE_PROVIDER) {
			result.skipped += 1;
			continue;
		}

		let current: Record<string, unknown> = data;

		// A reservation that never reached the provider has no session to ask
		// about: the local clock is authoritative, after grace.
		if (data.paymentId) {
			const due = isProviderPollDue({ paymentData: data, nowMs, graceSeconds, intervalMs });
			if (!due || result.polled >= pollLimit) {
				result.skipped += 1;
				continue;
			}

			// Spread reads so one pass never opens a hundred sockets at once.
			const jitterMs = Math.floor(random() * 100) + result.polled;
			if (jitterMs > 0) await new Promise((resolve) => setTimeout(resolve, jitterMs));

			result.polled += 1;
			let read: ProviderRead;
			try {
				read = await probe(row);
			} catch {
				read = { kind: "unavailable", reason: "probe_failed" };
			}

			if (read.kind === "ok") {
				const applied = await applyProviderPaymentToRegistration({
					registrationId: row.id,
					payment: read.payment,
					eventType: eventTypeForStatus(read.payment.status),
					eventId: "",
				});
				if (applied.action === "confirm") {
					result.confirmed += 1;
					result.confirmedIds.push(row.id);
					continue;
				}
				if (applied.missing) continue;
				if (applied.retry) {
					result.keptForProvider += 1;
					continue;
				}
				current = {
					...current,
					providerStatus: read.payment.status,
					providerPolledAt: nowIso,
				};
				if (read.payment.expiresAt) current.expiresAt = read.payment.expiresAt;
			} else {
				// Read off, 404, 401/403 scope, 429, timeout or a contradictory
				// body: none of these is an answer, so none may end a reservation.
				// The seat is held and the next pass asks again.
				if (read.kind === "disabled") result.readsDisabled += 1;
				result.keptForProvider += 1;
				continue;
			}
		}

		const candidate = { ...row, payment_data: JSON.stringify(current) };
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
			const currentRow = live.rows[0];
			if (!currentRow) return;

			const liveData = asObject(currentRow.payment_data);
			if (liveData.provider !== PAYGATE_PROVIDER) return;
			// A session that appeared since the scan is the provider's to settle.
			if (String(liveData.paymentId ?? "") && !data.paymentId) return;
			if (String(liveData.paymentId ?? "") !== String(data.paymentId ?? "")) return;

			const merged = { ...liveData, ...current };
			if (!shouldReleasePendingRegistration({ ...currentRow, payment_data: JSON.stringify(merged) }, nowMs, graceSeconds)) {
				return;
			}

			const reason = releaseReasonFor(String(merged.providerStatus ?? "not_initialized"));
			const nextData = { ...merged, releaseReason: reason, lastSyncedAt: nowIso };

			// The conditional WHERE is the lock: if a webhook confirmed the row
			// while this pass was deciding, the transaction sees it here and
			// releases nothing. SQLite has already taken the write lock.
			await query(
				`UPDATE registrations
				    SET payment_status = 'failed', registration_status = 'cancelled',
				        payment_data = ?, updated_at = ?
				  WHERE id = ? AND registration_status = 'pending' AND payment_status = 'pending'`,
				[JSON.stringify(nextData), nowIso, currentRow.id],
			);

			await audit({
				actorId: null,
				action: "payment.expiry-release",
				eventId: currentRow.event_id,
				registrationId: currentRow.id,
				entityType: "registration",
				entityId: currentRow.id,
				note: reason,
				before: { registrationStatus: "pending", paymentStatus: "pending" },
				after: { registrationStatus: "cancelled", paymentStatus: "failed" },
			});

			released = true;
			eventId = currentRow.event_id;
			couponCode = currentRow.coupon_code ?? "";
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

export type { ProviderPayment };
