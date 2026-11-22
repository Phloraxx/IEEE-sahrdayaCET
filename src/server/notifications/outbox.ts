/**
 * Notification outbox write path.
 *
 * Ported from `notification-helpers.js#enqueue` and `enqueueForRegistration`.
 *
 * The PocketBase hooks enqueued a `ticket` email when a registration became
 * confirmed, and a `receipt` email when it became paid. Those calls were absent
 * from the port, so nothing was ever queued. This restores them.
 *
 * Rows are deduped on `<registrationId>:<kind>`, so a webhook replay or a
 * reconciliation pass that re-confirms the same registration does not create a
 * second job.
 *
 * Delivery itself is stubbed (see `certificates/delivery.ts`): rows are recorded
 * and never transmitted.
 */

import { query } from "@/lib/db.server";

export type NotificationKind = "ticket" | "receipt" | "certificate";

export interface EnqueueInput {
	registrationId: string;
	registrationStatus: string;
	paymentStatus: string;
	ticketId: string | null;
	userEmail: string | null;
	finalFeePaise: number;
}

async function findOutbox(registrationId: string, kind: NotificationKind) {
	const result = await query<{ id: string; status: string }>(
		`SELECT id, status FROM notification_outbox WHERE registration_id = ? AND kind = ?`,
		[registrationId, kind],
	);
	return result.rows[0] ?? null;
}

/**
 * Queue one notification.
 *
 * Returns the row id, or null when the registration does not qualify — the same
 * conditions the hook applied, so a cancelled or unpaid registration never gets
 * a ticket email.
 */
export async function enqueue(
	input: EnqueueInput,
	kind: NotificationKind,
	force = false,
): Promise<string | null> {
	if (kind === "ticket") {
		if (input.registrationStatus !== "confirmed" || !input.ticketId) return null;
	}
	if (kind === "receipt") {
		// A refunded registration keeps its receipt; an unpaid one has none.
		const settled = input.paymentStatus === "paid" || input.paymentStatus === "refunded";
		if (!settled || input.finalFeePaise <= 0 || !input.ticketId) return null;
	}

	const recipient = String(input.userEmail ?? "").trim();
	if (!recipient) return null;

	const existing = await findOutbox(input.registrationId, kind);
	if (existing) {
		if (force) {
			await query(
				`UPDATE notification_outbox
				    SET status = 'pending', next_attempt_at = ?, last_error = '', recipient = ?, updated_at = ?
				  WHERE id = ?`,
				[new Date().toISOString(), recipient, new Date().toISOString(), existing.id],
			);
		}
		return existing.id;
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	try {
		await query(
			`INSERT INTO notification_outbox
			   (id, registration_id, kind, status, recipient, dedupe_key, attempts,
			    next_attempt_at, last_attempt_at, sent_at, last_error, created_at, updated_at)
			 VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, '', '', '', ?, ?)`,
			[id, input.registrationId, kind, recipient, `${input.registrationId}:${kind}`, now, now, now],
		);
	} catch {
		// A concurrent enqueue may have won the unique dedupe index.
		const raced = await findOutbox(input.registrationId, kind);
		return raced?.id ?? null;
	}
	return id;
}

/**
 * Queue everything a registration is now eligible for.
 *
 * Called after a payment confirms and after a registration is created, matching
 * where the PocketBase hooks called it.
 */
export async function enqueueForRegistration(registrationId: string): Promise<{ ticket: string | null; receipt: string | null }> {
	const result = await query<{
		id: string;
		registration_status: string;
		payment_status: string;
		ticket_id: string | null;
		user_email: string | null;
		final_fee_paise: number;
	}>(
		`SELECT id, registration_status, payment_status, ticket_id, user_email, final_fee_paise
		   FROM registrations WHERE id = ?`,
		[registrationId],
	);
	const row = result.rows[0];
	if (!row) return { ticket: null, receipt: null };

	const input: EnqueueInput = {
		registrationId: row.id,
		registrationStatus: row.registration_status,
		paymentStatus: row.payment_status,
		ticketId: row.ticket_id,
		userEmail: row.user_email,
		finalFeePaise: row.final_fee_paise ?? 0,
	};

	const ticket = await enqueue(input, "ticket");
	const receipt = await enqueue(input, "receipt");
	return { ticket, receipt };
}

// ---------------------------------------------------------------------------
// Admin read/resend surface — port of `registration-notifications.pb.js`
// ---------------------------------------------------------------------------

export interface NotificationSnapshot {
	ticket: { status: string; attempts: number; sentAt: string; lastError: string } | null;
	receipt: { status: string; attempts: number; sentAt: string; lastError: string } | null;
}

/** The last ticket/receipt row for a registration, as the admin panel shows it. */
export async function notificationSnapshot(registrationId: string): Promise<NotificationSnapshot> {
	const result = await query<{
		kind: string;
		status: string;
		attempts: number;
		sent_at: string | null;
		last_error: string | null;
	}>(
		`SELECT kind, status, attempts, sent_at, last_error
		   FROM notification_outbox WHERE registration_id = ?`,
		[registrationId],
	);
	const snapshot: NotificationSnapshot = { ticket: null, receipt: null };
	for (const row of result.rows) {
		if (row.kind !== "ticket" && row.kind !== "receipt") continue;
		snapshot[row.kind] = {
			status: row.status || "pending",
			attempts: Number(row.attempts) || 0,
			sentAt: row.sent_at ?? "",
			lastError: row.last_error ?? "",
		};
	}
	return snapshot;
}
