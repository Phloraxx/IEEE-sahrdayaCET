/**
 * Send one claimed outbox row.
 *
 * The row has already been moved to `sending` and had its attempt counted by the
 * worker, so this module only decides the final status:
 *
 *   sent    — the relay accepted the message
 *   failed  — a real error, retried with backoff until 8 attempts, or terminal
 *             immediately when the cause cannot change (no transport, no such
 *             registration, revoked credential, event over)
 *   pending — the safety policy blocked it, so nothing was attempted
 *
 * Anything that leaves this function in `failed` is visible in the admin outbox
 * panel with the exact error, which is the only place a silently dropped email
 * could hide.
 */

import { query } from "@/lib/db.server";
import { MailDeliveryBlockedError, currentResolution, prepare } from "./policy";
import { renderOutboxRow } from "./render";
import { PermanentMailError, type OutboxRow } from "./types";
import { fromAddress, getTransport, smtpSettings } from "./transport.server";

export type SendStatus = "sent" | "failed" | "blocked";

export interface SendOutcome {
	status: SendStatus;
	/** Safe for logs and the outbox row: never contains credentials. */
	error?: string;
	permanent?: boolean;
}

/** Backoff after a failed attempt, in seconds. Matches the PocketBase rule. */
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 10_800, 21_600];
const MAX_ATTEMPTS = 8;

function nextRetryIso(attempts: number): string {
	const index = Math.max(0, Math.min(RETRY_DELAYS_SECONDS.length - 1, attempts - 1));
	const delay = RETRY_DELAYS_SECONDS[index] ?? 60;
	return new Date(Date.now() + delay * 1000).toISOString();
}

async function markFailed(
	row: OutboxRow,
	code: string,
	message: string,
	permanent: boolean,
): Promise<SendOutcome> {
	const now = new Date().toISOString();
	const terminal = permanent || row.attempts >= MAX_ATTEMPTS;
	const error = `${code}: ${message}`.slice(0, 2000);
	await query(
		`UPDATE notification_outbox
		    SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = ?
		  WHERE id = ?`,
		[terminal ? "" : nextRetryIso(row.attempts), error, now, row.id],
	);
	return { status: "failed", error, permanent: terminal };
}

export async function sendClaimedRow(row: OutboxRow): Promise<SendOutcome> {
	const now = new Date().toISOString();
	const resolution = currentResolution(row.recipient ?? "");

	if (!resolution.allowed) {
		// The worker checks policy before claiming, so this only happens when the
		// environment changed mid-pass. Return the attempt, keep the intent.
		await query(
			`UPDATE notification_outbox
			    SET status = 'pending', attempts = MAX(attempts - 1, 0), last_attempt_at = '',
			        last_error = ?, updated_at = ?
			  WHERE id = ?`,
			[`blocked: ${resolution.reason}`, now, row.id],
		);
		return { status: "blocked", error: resolution.reason };
	}

	// A missing transport is a configuration error, not a transient one: retrying
	// every minute would only bury the signal.
	if (!smtpSettings()) {
		return markFailed(
			row,
			"SMTP_NOT_CONFIGURED",
			"SMTP_HOST and SMTP_FROM must be set before mail can be delivered",
			true,
		);
	}

	let rendered;
	try {
		rendered = await renderOutboxRow(row);
	} catch (error) {
		if (error instanceof PermanentMailError) {
			return markFailed(row, error.code, error.message, true);
		}
		const message = error instanceof Error ? error.message : String(error);
		return markFailed(row, "RENDER_FAILED", message, false);
	}

	let prepared;
	try {
		prepared = prepare(row.recipient ?? "", rendered.template);
	} catch (error) {
		if (error instanceof MailDeliveryBlockedError) {
			await query(
				`UPDATE notification_outbox
				    SET status = 'pending', attempts = MAX(attempts - 1, 0), last_attempt_at = '',
				        last_error = ?, updated_at = ?
				  WHERE id = ?`,
				[`blocked: ${error.reason}`, now, row.id],
			);
			return { status: "blocked", error: error.reason };
		}
		const message = error instanceof Error ? error.message : String(error);
		return markFailed(row, "PREPARE_FAILED", message, false);
	}

	try {
		await getTransport().sendMail({
			from: fromAddress(),
			to: prepared.recipient,
			subject: prepared.subject,
			html: prepared.html,
			text: prepared.text,
			attachments: rendered.attachments.map((attachment) => ({
				filename: attachment.filename,
				content: attachment.content,
				contentType: attachment.contentType,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return markFailed(row, "SMTP_SEND_FAILED", message, false);
	}

	await query(
		`UPDATE notification_outbox
		    SET status = 'sent', sent_at = ?, last_error = '', next_attempt_at = '', updated_at = ?
		  WHERE id = ?`,
		[now, now, row.id],
	);
	return { status: "sent" };
}
