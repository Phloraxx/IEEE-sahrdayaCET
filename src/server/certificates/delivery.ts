/**
 * Certificate delivery.
 *
 * Ported from `certificate-delivery.pb.js` (109 LOC),
 * `certificate-delivery-helpers.js` (449 LOC) and `mail-delivery.js` (125 LOC).
 *
 * Delivery is performed by the shared mail worker (`src/server/mail`), which
 * applies the same safety policy to tickets, receipts and certificates:
 *
 *   - `disabled`  — nothing may be delivered (the default when unset)
 *   - `allowlist` — only addresses in `MAIL_ALLOWLIST`
 *   - `redirect`  — everything goes to `MAIL_REDIRECT_TO` with a TEST banner
 *   - `live`      — real delivery, only permitted when `DEPLOY_ENV=production`
 *
 * This module owns the certificate pipeline — queueing, batch counters and the
 * admin surface — and hands each row to the worker. A queued row that cannot be
 * delivered keeps its intent and its error; nothing is silently discarded.
 */

import { query, withTransaction } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor, type Capability } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { validEmail } from "@/server/certificates/rules";
import { batchPayload, type BatchRow } from "@/server/certificates/issuance";
import { clean, normalizedMode } from "@/server/mail/policy";
import { smtpStatus } from "@/server/mail/transport.server";
import { runOutboxPass } from "@/server/mail/worker";
import type { OutboxRow } from "@/server/mail/types";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

// ---------------------------------------------------------------------------
// Mail readiness
// ---------------------------------------------------------------------------
//
// The policy itself is shared with tickets and receipts: `src/server/mail/policy.ts`.

export type { MailMode } from "@/server/mail/policy";

/** What the readiness endpoint reports. */
export function mailReadiness() {
	const mode = normalizedMode(process.env.MAIL_DELIVERY_MODE, process.env.DEPLOY_ENV ?? "");
	const smtp = smtpStatus();
	const safetyReady = mode !== "disabled";
	const transportReady = smtp.configured;
	const readyToSend = safetyReady && transportReady;
	return {
		provider: "smtp" as const,
		deliveryMode: mode,
		safetyReady,
		transportReady,
		trackingReady: true,
		trackingMode: "accepted_only" as const,
		readyToQueue: true,
		readyToSend,
		transport: {
			configured: smtp.configured,
			host: smtp.host,
			port: smtp.port,
			secure: smtp.secure,
			from: smtp.from,
		},
		reason: readyToSend ? "" : safetyReady ? "smtp_not_configured" : "delivery_disabled",
		message: readyToSend
			? `Mail is enabled in ${mode} mode through ${smtp.host}.`
			: smtp.configured
				? "SMTP is configured, but MAIL_DELIVERY_MODE blocks delivery; queued rows stay pending."
				: "SMTP is not configured (SMTP_HOST and SMTP_FROM are required). Queued rows stay pending or fail permanently.",
	};
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export type { OutboxRow } from "@/server/mail/types";

async function outboxForCertificate(certificateId: string): Promise<OutboxRow | null> {
	const result = await query<OutboxRow>(
		`SELECT * FROM notification_outbox WHERE kind = 'certificate' AND certificate_id = ?`,
		[certificateId],
	);
	return result.rows[0] ?? null;
}

export interface EnqueueResult {
	record: OutboxRow | null;
	created: boolean;
}

/**
 * Queue one certificate email.
 *
 * Idempotent on `dedupe_key` (`certificate:<id>`): a second call returns the
 * existing row rather than creating a duplicate job.
 */
export async function enqueueCertificate(
	certificate: {
		id: string;
		status: string | null;
		recipient_email_snapshot: string | null;
		registration_id: string | null;
		batch_id: string | null;
	},
	force: boolean,
): Promise<EnqueueResult> {
	if (!certificate?.id) return { record: null, created: false };
	if ((certificate.status ?? "") !== "active") return { record: null, created: false };

	const recipient = clean(certificate.recipient_email_snapshot);
	if (!validEmail(recipient)) return { record: null, created: false };

	const existing = await outboxForCertificate(certificate.id);
	if (existing) {
		// A re-queue of a terminal failure resets the attempts so the retry can run.
		if (force && (existing.status === "failed" || existing.status === "stubbed")) {
			await query(
				`UPDATE notification_outbox
				    SET status = 'pending', attempts = 0, next_attempt_at = ?, last_attempt_at = '',
				        sent_at = '', last_error = '', recipient = ?, updated_at = ?
				  WHERE id = ?`,
				[new Date().toISOString(), recipient, new Date().toISOString(), existing.id],
			);
			const refreshed = await outboxForCertificate(certificate.id);
			return { record: refreshed, created: false };
		}
		return { record: existing, created: false };
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	try {
		await query(
			`INSERT INTO notification_outbox
			   (id, registration_id, kind, status, recipient, dedupe_key, attempts,
			    next_attempt_at, last_attempt_at, sent_at, last_error,
			    certificate_id, certificate_batch_id, created_at, updated_at)
			 VALUES (?, ?, 'certificate', 'pending', ?, ?, 0, ?, '', '', '', ?, ?, ?, ?)`,
			[
				id,
				certificate.registration_id,
				recipient,
				`certificate:${certificate.id}`,
				now,
				certificate.id,
				certificate.batch_id,
				now,
				now,
			],
		);
	} catch {
		// A concurrent enqueue may have won the unique dedupe index.
		const raced = await outboxForCertificate(certificate.id);
		if (raced) return { record: raced, created: false };
		throw new Error("Could not queue certificate email");
	}

	const created = await outboxForCertificate(certificate.id);
	return { record: created, created: true };
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

interface EventScope {
	id: string;
	society_id: string | null;
}

async function loadEvent(id: string): Promise<EventScope | null> {
	const result = await query<EventScope>(`SELECT id, society_id FROM events WHERE id = ?`, [id]);
	return result.rows[0] ?? null;
}

async function requireEventCapability(actor: Actor, capability: Capability, event: EventScope, message: string) {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, capability, { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", message);
	}
}

async function loadBatch(batchId: string): Promise<BatchRow | null> {
	const result = await query<BatchRow>(`SELECT * FROM certificate_batches WHERE id = ?`, [batchId]);
	return result.rows[0] ?? null;
}

async function outboxRows(batchId: string): Promise<OutboxRow[]> {
	const result = await query<OutboxRow>(
		`SELECT * FROM notification_outbox WHERE certificate_batch_id = ?`,
		[batchId],
	);
	return result.rows;
}

/** A failed row is terminal after 8 attempts, matching the PocketBase rule. */
function terminalFailure(row: OutboxRow): boolean {
	return row.status === "failed" && (row.attempts ?? 0) >= 8;
}

/**
 * Recompute a batch's delivery counters from its outbox rows.
 *
 * `stubbed` counts toward `sentCount` because the pipeline completed — nothing
 * failed — but the payload exposes the distinction so nobody mistakes a stub for
 * a delivery.
 */
export async function reconcileBatch(batchId: string): Promise<BatchRow | null> {
	const batch = await loadBatch(batchId);
	if (!batch) return null;

	const rows = await outboxRows(batchId);
	let sent = 0;
	let failed = 0;
	let outstanding = false;

	for (const row of rows) {
		// A stubbed row counts as sent: the pipeline completed and nothing failed.
		// The distinction stays visible in `deliveryPayload`'s per-status breakdown.
		if (row.status === "sent" || row.status === "stubbed") sent += 1;
		if (row.status === "failed") failed += 1;
		if (row.status === "pending" || row.status === "sending" || (row.status === "failed" && !terminalFailure(row))) {
			outstanding = true;
		}
	}

	const status = outstanding ? "sending" : failed > 0 ? "partial_failure" : rows.length ? "sent" : (batch.status ?? "issued");

	await query(
		`UPDATE certificate_batches
		    SET queued_count = ?, sent_count = ?, failed_count = ?, status = ?, updated_at = ?
		  WHERE id = ?`,
		[rows.length, sent, failed, status, new Date().toISOString(), batchId],
	);

	const refreshed = await loadBatch(batchId);
	return refreshed;
}

export async function deliveryPayload(batchId: string) {
	const batch = await loadBatch(batchId);
	if (!batch) fail(404, "BATCH_NOT_FOUND", "Certificate batch not found");

	const rows = await outboxRows(batchId);
	const byStatus: Record<string, number> = {};
	for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

	const recipients = await query<{
		id: string;
		recipient_name_snapshot: string | null;
		recipient_email_snapshot: string | null;
		credential_id: string | null;
		status: string | null;
	}>(
		`SELECT id, recipient_name_snapshot, recipient_email_snapshot, credential_id, status
		   FROM certificates WHERE batch_id = ? ORDER BY credential_id`,
		[batchId],
	);

	const outboxByCertificate = new Map<string, OutboxRow>();
	for (const row of rows) {
		if (row.certificate_id) outboxByCertificate.set(row.certificate_id, row);
	}

	return {
		batch: batchPayload(batch),
		delivery: {
			stubbed: false,
			byStatus,
			readiness: mailReadiness(),
		},
		recipients: recipients.rows.map((row) => {
			const outbox = outboxByCertificate.get(row.id);
			return {
				certificateId: row.id,
				name: row.recipient_name_snapshot ?? "",
				email: row.recipient_email_snapshot ?? "",
				credentialId: row.credential_id ?? "",
				certificateStatus: row.status ?? "active",
				deliveryStatus: outbox?.status ?? "not_queued",
				attempts: outbox?.attempts ?? 0,
				lastError: outbox?.last_error ?? "",
			};
		}),
	};
}

export async function listBatches(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.view", event, "You cannot view certificates for this event");

	const rows = await query<BatchRow>(
		`SELECT * FROM certificate_batches WHERE event_id = ? AND status != 'draft' ORDER BY issued_at DESC`,
		[eventId],
	);

	const batches = [];
	for (const row of rows.rows) {
		const reconciled = await reconcileBatch(row.id);
		batches.push(batchPayload(reconciled ?? row));
	}
	return { batches };
}

export async function getBatchDelivery(actor: Actor, eventId: string, batchId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.view", event, "You cannot view certificates for this event");

	const batch = await loadBatch(batchId);
	if (!batch || batch.event_id !== eventId) fail(404, "BATCH_NOT_FOUND", "Certificate batch not found");

	return deliveryPayload(batchId);
}

export async function mailReadinessForEvent(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(
		actor,
		"certificates.view",
		event,
		"You cannot view certificate mail readiness for this event",
	);
	return mailReadiness();
}

/**
 * Queue every eligible certificate in a batch and deliver (stub) them.
 *
 * Returns `queuedNow: 0` when nothing new was queued, which the caller reports as
 * an idempotent replay rather than an error.
 */
export async function sendBatch(actor: Actor, eventId: string, batchId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.send", event, "You cannot send certificates for this event");

	const batch = await loadBatch(batchId);
	if (!batch || batch.event_id !== eventId) fail(404, "BATCH_NOT_FOUND", "Certificate batch not found");

	const status = batch.status ?? "";
	if (!["issued", "sending", "partial_failure", "sent"].includes(status)) {
		fail(409, "BATCH_NOT_ISSUED", "Only issued certificate batches can be sent");
	}

	const certificates = await query<{
		id: string;
		status: string | null;
		recipient_email_snapshot: string | null;
		registration_id: string | null;
		batch_id: string | null;
	}>(
		`SELECT id, status, recipient_email_snapshot, registration_id, batch_id
		   FROM certificates WHERE batch_id = ?`,
		[batchId],
	);

	let created = 0;
	let eligible = 0;

	await withTransaction(async () => {
		for (const certificate of certificates.rows) {
			if ((certificate.status ?? "") !== "active") continue;
			if (!validEmail(certificate.recipient_email_snapshot)) continue;
			eligible += 1;
			const queued = await enqueueCertificate(certificate, false);
			if (queued.created) created += 1;
		}

		if (eligible > 0 && !batch.issued_at) {
			await query(`UPDATE certificate_batches SET send_started_at = ?, updated_at = ? WHERE id = ?`, [
				new Date().toISOString(),
				new Date().toISOString(),
				batchId,
			]);
		}

	});

	// Deliver a bounded slice in the request so a small batch finishes now; the
	// rest is drained by the one-minute worker. A 131-recipient batch must not
	// hold an HTTP request open against Gmail's relay.
	const pass = await runOutboxPass({ limit: 10 });

	await reconcileBatch(batchId);

	if (!eligible) {
		fail(409, "NO_EMAIL_ELIGIBLE", "This batch has no active credentials with valid email snapshots");
	}

	if (created > 0) {
		await audit({
			actorId: actor.id,
			action: "certificate.batch-send",
			eventId,
			entityType: "certificate_batch",
			entityId: batchId,
			note: `Queued ${created} certificate email(s)`,
		});
	}

	return {
		idempotent: created === 0,
		queuedNow: created,
		deliveredNow: pass.sent,
		delivery: await deliveryPayload(batchId),
	};
}

export async function retryFailed(actor: Actor, eventId: string, batchId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.send", event, "You cannot send certificates for this event");

	const batch = await loadBatch(batchId);
	if (!batch || batch.event_id !== eventId) fail(404, "BATCH_NOT_FOUND", "Certificate batch not found");

	const certificates = await query<{
		id: string;
		status: string | null;
		recipient_email_snapshot: string | null;
		registration_id: string | null;
		batch_id: string | null;
	}>(
		`SELECT id, status, recipient_email_snapshot, registration_id, batch_id
		   FROM certificates WHERE batch_id = ?`,
		[batchId],
	);

	let retried = 0;

	await withTransaction(async () => {
		for (const certificate of certificates.rows) {
			if ((certificate.status ?? "") !== "active") continue;
			if (!validEmail(certificate.recipient_email_snapshot)) continue;
			const existing = await outboxForCertificate(certificate.id);
			if (!existing || (existing.status !== "failed" && existing.status !== "stubbed")) continue;
			await enqueueCertificate(certificate, true);
			retried += 1;
		}
	});

	const pass = await runOutboxPass({ limit: 10 });

	await reconcileBatch(batchId);

	if (!retried) fail(409, "NO_FAILED_DELIVERIES", "There are no failed certificate emails to retry");

	return { retried, deliveredNow: pass.sent, delivery: await deliveryPayload(batchId) };
}

export { getEnv };
