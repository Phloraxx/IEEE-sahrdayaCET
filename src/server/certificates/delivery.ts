/**
 * Certificate delivery.
 *
 * Ported from `certificate-delivery.pb.js` (109 LOC),
 * `certificate-delivery-helpers.js` (449 LOC) and `mail-delivery.js` (125 LOC).
 *
 * **No mail is ever sent by this module.** The PocketBase original called
 * `app.newMailClient().send(...)`; this port records what it *would* have sent
 * and stops. That is deliberate: the staging database holds real student
 * addresses, and a port that can email them is a port that eventually will.
 *
 * The safety policy is still evaluated, because it decides what the record says:
 *
 *   - `disabled`  — nothing may be delivered (the default when unset)
 *   - `allowlist` — only addresses in `MAIL_ALLOWLIST`
 *   - `redirect`  — everything goes to `MAIL_REDIRECT_TO` with a TEST banner
 *   - `live`      — real delivery, only permitted when `DEPLOY_ENV=production`
 *
 * Every attempt lands as a `stubbed` outbox row whose `last_error` records the
 * intended recipient and the policy decision, so the pipeline is exercised
 * end-to-end and an operator can see exactly what would have gone out.
 */

import { query, withTransaction } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor, type Capability } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { validEmail } from "@/server/certificates/rules";
import { batchPayload, type BatchRow } from "@/server/certificates/issuance";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

// ---------------------------------------------------------------------------
// Mail safety policy
// ---------------------------------------------------------------------------

export type MailMode = "disabled" | "allowlist" | "redirect" | "live";

export interface DeliveryResolution {
	allowed: boolean;
	mode: MailMode;
	reason: string;
	recipient?: string;
	originalRecipient?: string;
	deployEnv: string;
}

function clean(value: unknown): string {
	return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
	return clean(value).toLowerCase();
}

export function parseEmailList(raw: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of clean(raw).split(/[;,\s]+/)) {
		const email = normalizeEmail(part);
		if (!email || seen.has(email)) continue;
		seen.add(email);
		out.push(email);
	}
	return out;
}

export function normalizedMode(raw: unknown): MailMode {
	const mode = clean(raw).toLowerCase();
	if (!mode) return "disabled";
	if (mode === "disabled" || mode === "allowlist" || mode === "redirect" || mode === "live") return mode;
	return "disabled";
}

/** Ported from `mail-delivery.js#resolveDelivery`. */
export function resolveDelivery(options: {
	deployEnv?: string;
	mode?: string;
	allowlist?: string;
	redirectTo?: string;
	recipient?: string;
}): DeliveryResolution {
	const deployEnv = clean(options.deployEnv).toLowerCase() || "unknown";
	const recipient = clean(options.recipient);
	const requestedMode = clean(options.mode).toLowerCase();
	const mode = normalizedMode(requestedMode);

	if (!recipient) return { allowed: false, mode, reason: "recipient_missing", deployEnv };
	if (requestedMode && requestedMode !== mode) {
		return { allowed: false, mode, reason: "invalid_mode", deployEnv };
	}
	if (mode === "disabled") return { allowed: false, mode, reason: "delivery_disabled", deployEnv };

	if (mode === "live") {
		// A live send outside production is a configuration error, not a green light.
		if (deployEnv !== "production") {
			return { allowed: false, mode, reason: "live_not_allowed_outside_production", deployEnv };
		}
		return { allowed: true, mode, reason: "", recipient, originalRecipient: recipient, deployEnv };
	}

	if (mode === "allowlist") {
		const allowed = parseEmailList(options.allowlist ?? "");
		if (!allowed.includes(normalizeEmail(recipient))) {
			return { allowed: false, mode, reason: "recipient_not_allowlisted", deployEnv };
		}
		return { allowed: true, mode, reason: "", recipient, originalRecipient: recipient, deployEnv };
	}

	const redirectTo = clean(options.redirectTo);
	if (!redirectTo) return { allowed: false, mode, reason: "redirect_target_missing", deployEnv };
	return { allowed: true, mode, reason: "", recipient: redirectTo, originalRecipient: recipient, deployEnv };
}

function currentResolution(recipient: string): DeliveryResolution {
	return resolveDelivery({
		deployEnv: process.env.DEPLOY_ENV,
		mode: process.env.MAIL_DELIVERY_MODE,
		allowlist: process.env.MAIL_ALLOWLIST,
		redirectTo: process.env.MAIL_REDIRECT_TO,
		recipient,
	});
}

/** What the readiness endpoint reports. */
export function mailReadiness() {
	const mode = normalizedMode(process.env.MAIL_DELIVERY_MODE);
	const deployEnv = clean(process.env.DEPLOY_ENV).toLowerCase() || "unknown";
	// Queueing is always "ready": the pipeline records rather than sends, so a
	// missing SMTP configuration is not a blocker for exercising it.
	return {
		mode,
		deployEnv,
		deliveryStubbed: true,
		readyToQueue: true,
		message:
			"Delivery is stubbed: every certificate email is recorded as a would-have-sent row and nothing is transmitted.",
	};
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export interface OutboxRow {
	id: string;
	registration_id: string | null;
	kind: string;
	status: string;
	recipient: string | null;
	dedupe_key: string | null;
	attempts: number;
	next_attempt_at: string | null;
	last_attempt_at: string | null;
	sent_at: string | null;
	last_error: string | null;
	certificate_id: string | null;
	certificate_batch_id: string | null;
	created_at: string;
	updated_at: string;
}

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

/**
 * "Deliver" one queued row.
 *
 * This is the stub. It evaluates the policy, records the decision, and marks the
 * row `stubbed`. There is no transport call anywhere in this function.
 */
export async function deliverOutboxRow(row: OutboxRow): Promise<OutboxRow> {
	const resolution = currentResolution(row.recipient ?? "");
	const now = new Date().toISOString();

	const note = resolution.allowed
		? `would-have-sent: ${resolution.originalRecipient ?? row.recipient} (policy=${resolution.mode}, deploy=${resolution.deployEnv}; delivery stubbed)`
		: `would-have-sent: ${row.recipient} (policy=${resolution.mode}, blocked=${resolution.reason}; delivery stubbed)`;

	await query(
		`UPDATE notification_outbox
		    SET status = 'stubbed', attempts = attempts + 1, last_attempt_at = ?,
		        next_attempt_at = '', last_error = ?, updated_at = ?
		  WHERE id = ?`,
		[now, note, now, row.id],
	);

	const updated = await query<OutboxRow>(`SELECT * FROM notification_outbox WHERE id = ?`, [row.id]);
	return updated.rows[0] as OutboxRow;
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
			stubbed: true,
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
	const toDeliver: OutboxRow[] = [];

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

		// Deliver (stub) every pending row for this batch.
		const pending = await outboxRows(batchId);
		for (const row of pending) {
			if (row.status === "pending") toDeliver.push(row);
		}
	});

	for (const row of toDeliver) {
		await deliverOutboxRow(row);
	}

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
			note: `Queued ${created} certificate email(s); delivery stubbed, nothing transmitted`,
		});
	}

	return {
		idempotent: created === 0,
		queuedNow: created,
		deliveredNow: toDeliver.length,
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
	const toDeliver: OutboxRow[] = [];

	await withTransaction(async () => {
		for (const certificate of certificates.rows) {
			if ((certificate.status ?? "") !== "active") continue;
			if (!validEmail(certificate.recipient_email_snapshot)) continue;
			const existing = await outboxForCertificate(certificate.id);
			if (!existing || (existing.status !== "failed" && existing.status !== "stubbed")) continue;
			await enqueueCertificate(certificate, true);
			retried += 1;
		}
		const pending = await outboxRows(batchId);
		for (const row of pending) {
			if (row.status === "pending") toDeliver.push(row);
		}
	});

	for (const row of toDeliver) {
		await deliverOutboxRow(row);
	}

	await reconcileBatch(batchId);

	if (!retried) fail(409, "NO_FAILED_DELIVERIES", "There are no failed certificate emails to retry");

	return { retried, delivery: await deliveryPayload(batchId) };
}

export { getEnv };
