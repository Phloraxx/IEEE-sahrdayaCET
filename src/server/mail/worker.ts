/**
 * Outbox worker.
 *
 * Claims a small batch of due rows, sends them, and records the outcome. It runs
 * as a separate process (`scripts/send-notifications.ts`) on a one-minute timer,
 * exactly like PocketBase's cron did, so a slow SMTP relay can never hold a web
 * request open.
 *
 * Claiming uses a conditional `UPDATE`: the row is moved to `sending` only if it
 * is still in the state the scan saw. Two overlapping passes cannot send the same
 * email twice, and a crashed pass leaves a 10-minute lease rather than a row
 * stuck forever.
 */

import { query } from "@/lib/db.server";
import { currentResolution } from "./policy";
import { sendClaimedRow } from "./send";
import type { OutboxRow } from "./types";

export interface OutboxPassResult {
	at: string;
	scanned: number;
	sent: number;
	failed: number;
	blocked: number;
	skipped: number;
	errors: string[];
}

const MAX_ATTEMPTS = 8;
const LEASE_MINUTES = 10;

export async function runOutboxPass(options: { limit?: number } = {}): Promise<OutboxPassResult> {
	const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)));
	const now = Date.now();
	const nowIso = new Date(now).toISOString();
	const leaseCutoff = new Date(now - LEASE_MINUTES * 60 * 1000).toISOString();

	const due = await query<OutboxRow>(
		`SELECT * FROM notification_outbox
		  WHERE status = 'pending'
		     OR (status = 'failed' AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at = '' OR next_attempt_at <= ?))
		     OR (status = 'sending' AND (last_attempt_at IS NULL OR last_attempt_at = '' OR last_attempt_at <= ?))
		  ORDER BY created_at ASC
		  LIMIT ?`,
		[MAX_ATTEMPTS, nowIso, leaseCutoff, limit],
	);

	const result: OutboxPassResult = {
		at: nowIso,
		scanned: due.rows.length,
		sent: 0,
		failed: 0,
		blocked: 0,
		skipped: 0,
		errors: [],
	};

	for (const row of due.rows) {
		// A blocked intent must not spend attempts: staging and disabled
		// environments leave real intents untouched until they are allowed.
		if (!currentResolution(row.recipient ?? "").allowed) {
			result.blocked += 1;
			continue;
		}

		const claim = await query<{ id: string }>(
			`UPDATE notification_outbox
			    SET status = 'sending', attempts = attempts + 1, last_attempt_at = ?, updated_at = ?
			  WHERE id = ? AND status = ?
			  RETURNING id`,
			[nowIso, nowIso, row.id, row.status],
		);
		if (!claim.rows.length) {
			result.skipped += 1;
			continue;
		}

		const claimed = await query<OutboxRow>(`SELECT * FROM notification_outbox WHERE id = ?`, [row.id]);
		const current = claimed.rows[0];
		if (!current) {
			result.skipped += 1;
			continue;
		}

		const outcome = await sendClaimedRow(current);
		if (outcome.status === "sent") result.sent += 1;
		else if (outcome.status === "blocked") result.blocked += 1;
		else {
			result.failed += 1;
			if (outcome.error) result.errors.push(`${row.id}: ${outcome.error}`);
		}
	}

	return result;
}
