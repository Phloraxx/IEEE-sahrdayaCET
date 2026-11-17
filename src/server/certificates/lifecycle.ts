/**
 * Certificate revocation and supersession.
 *
 * Ported from `certificate-lifecycle.pb.js` (157 LOC) and
 * `certificate-lifecycle-helpers.js` (178 LOC).
 *
 * Revoking is idempotent and never deletes: a credential keeps its row so a
 * verification link can report REVOKED rather than 404. Superseding issues a
 * replacement credential and marks the original SUPERSEDED, linking the pair.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { credentialId, sha256, stableStringify, verificationToken } from "@/server/certificates/rules";
import type { CertificateRow } from "@/server/certificates/public";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function clean(value: unknown): string {
	return String(value ?? "").trim();
}

interface EventRow {
	id: string;
	title: string | null;
	date: string | null;
	society_id: string | null;
}

async function loadEvent(id: string): Promise<EventRow | null> {
	const result = await query<EventRow>(`SELECT id, title, date, society_id FROM events WHERE id = ?`, [id]);
	return result.rows[0] ?? null;
}

async function requireRevoke(actor: Actor, event: EventRow): Promise<void> {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "certificates.revoke", { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot revoke or replace certificates for this event");
	}
}

async function loadCertificate(id: string): Promise<CertificateRow | null> {
	const result = await query<CertificateRow>(`SELECT * FROM certificates WHERE id = ?`, [id]);
	return result.rows[0] ?? null;
}

function siteUrl(): string {
	return clean(process.env.SITE_URL || "https://ieeesahrdaya.com").replace(/\/+$/, "") || "https://ieeesahrdaya.com";
}

export function credentialPayload(row: CertificateRow) {
	return {
		certificateId: row.id,
		eventId: row.event_id,
		registrationId: row.registration_id,
		batchId: row.batch_id,
		templateId: row.template_id,
		certificateType: row.certificate_type ?? "",
		recipientName: row.recipient_name_snapshot ?? "",
		recipientEmail: row.recipient_email_snapshot ?? "",
		credentialId: row.credential_id ?? "",
		status: row.status ?? "active",
		issuedAt: row.issued_at ?? "",
		revokedAt: row.revoked_at ?? "",
		revocationReason: row.revocation_reason ?? "",
		supersedesId: row.supersedes ?? "",
		supersededById: row.superseded_by ?? "",
		metadataVersion: row.metadata_version ?? 1,
		verificationUrl: `${siteUrl()}/c/${encodeURIComponent(row.verification_token ?? "")}`,
	};
}

/** A reason shorter than 5 characters is not a reason. */
function requireReason(input: unknown): string {
	const value = clean(input).slice(0, 4000);
	if (value.length < 5) fail(400, "REASON_REQUIRED", "A revocation reason of at least 5 characters is required");
	return value;
}

async function cancelUnsentDelivery(certificateId: string, message: string): Promise<void> {
	const row = await query<{ id: string; status: string }>(
		`SELECT id, status FROM notification_outbox WHERE kind = 'certificate' AND certificate_id = ?`,
		[certificateId],
	);
	const existing = row.rows[0];
	if (!existing || existing.status === "sent") return;
	await query(
		`UPDATE notification_outbox
		    SET status = 'failed', attempts = 8, next_attempt_at = '', last_error = ?, updated_at = ?
		  WHERE id = ?`,
		[clean(message).slice(0, 3900), new Date().toISOString(), existing.id],
	);
}

export async function revokeCertificate(
	actor: Actor,
	eventId: string,
	certificateId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireRevoke(actor, event);

	const certificate = await loadCertificate(certificateId);
	if (!certificate || certificate.event_id !== eventId) {
		fail(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
	}

	// Idempotent: revoking twice is a 200 with the same credential.
	if (certificate.status === "revoked") {
		return { idempotent: true, certificate: credentialPayload(certificate) };
	}

	const reason = requireReason(input.reason);
	const now = new Date().toISOString();

	await withTransaction(async () => {
		await query(
			`UPDATE certificates
			    SET status = 'revoked', revoked_at = ?, revoked_by = ?, revocation_reason = ?, updated_at = ?
			  WHERE id = ?`,
			[now, actor.id, reason, now, certificateId],
		);
		await cancelUnsentDelivery(certificateId, `Certificate revoked: ${reason}`);
		await audit({
			actorId: actor.id,
			action: "certificate.revoke",
			eventId,
			entityType: "certificate",
			entityId: certificateId,
			note: reason,
			before: { status: certificate.status },
			after: { status: "revoked" },
		});
	});

	const updated = await loadCertificate(certificateId);
	return { idempotent: false, certificate: credentialPayload(updated as CertificateRow) };
}

export async function supersedeCertificate(
	actor: Actor,
	eventId: string,
	certificateId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireRevoke(actor, event);

	const certificate = await loadCertificate(certificateId);
	if (!certificate || certificate.event_id !== eventId) {
		fail(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
	}

	// Already replaced: return the replacement rather than issuing a second one.
	if (certificate.superseded_by) {
		const existing = await loadCertificate(certificate.superseded_by);
		if (existing) {
			return { idempotent: true, certificate: credentialPayload(existing) };
		}
	}

	if (certificate.status === "revoked") {
		fail(409, "CERTIFICATE_REVOKED", "A revoked certificate cannot be superseded; issue a new batch instead");
	}

	const reason = requireReason(input.reason);

	// The replacement template must be published, belong to this event, and carry
	// the same certificate type — otherwise the credential would change meaning.
	const requestedTemplateId = clean(input.templateId);
	let template: { id: string; render_base: string | null; certificate_type: string | null } | null = null;
	if (requestedTemplateId) {
		const found = await query<{ id: string; render_base: string | null; certificate_type: string | null }>(
			`SELECT id, render_base, certificate_type FROM certificate_templates
			  WHERE id = ? AND event_id = ? AND status = 'published'`,
			[requestedTemplateId, eventId],
		);
		template = found.rows[0] ?? null;
		if (!template || !template.render_base || template.certificate_type !== certificate.certificate_type) {
			fail(400, "REPLACEMENT_TEMPLATE_INVALID", "Choose a published template of the same certificate type");
		}
	} else {
		const current = await query<{ id: string; render_base: string | null; certificate_type: string | null }>(
			`SELECT id, render_base, certificate_type FROM certificate_templates WHERE id = ?`,
			[certificate.template_id],
		);
		template = current.rows[0] ?? null;
		if (!template || !template.render_base) {
			fail(400, "REPLACEMENT_TEMPLATE_INVALID", "The current template cannot render a replacement");
		}
	}

	const issuedAt = new Date().toISOString();
	const newCertificateId = crypto.randomUUID();
	const newBatchId = crypto.randomUUID();
	const recipientName = certificate.recipient_name_snapshot ?? "";
	const recipientEmail = certificate.recipient_email_snapshot ?? "";
	const certificateType = certificate.certificate_type ?? "participation";

	const audienceFingerprint = sha256(
		stableStringify({
			kind: "certificate-supersede",
			certificateId: certificate.id,
			templateId: template.id,
			recipientName,
			recipientEmail,
		}),
	);
	const idempotencyKey = sha256(`certificate-supersede:${certificate.id}`);

	await withTransaction(async () => {
		await query(
			`INSERT INTO certificate_batches
			   (id, event_id, template_id, audience_type, audience_config, audience_fingerprint,
			    audience_snapshot, idempotency_key, status, recipient_count, issued_count,
			    email_eligible_count, queued_count, sent_count, failed_count, missing_email_count,
			    created_by, issued_by, issued_at, note, created_at, updated_at)
			 VALUES (?, ?, ?, 'selected', ?, ?, ?, ?, 'issued', 1, 1, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
			[
				newBatchId,
				eventId,
				template.id,
				JSON.stringify({ registrationIds: [certificate.registration_id] }),
				audienceFingerprint,
				JSON.stringify({ recipients: [{ id: certificate.registration_id, name: recipientName, email: recipientEmail }], excluded: [] }),
				idempotencyKey,
				recipientEmail ? 1 : 0,
				recipientEmail ? 0 : 1,
				actor.id,
				actor.id,
				issuedAt,
				`Replacement for ${certificate.credential_id ?? ""}: ${reason}`.slice(0, 4000),
				issuedAt,
				issuedAt,
			],
		);

		await query(
			`INSERT INTO certificates
			   (id, event_id, registration_id, batch_id, template_id, certificate_type,
			    credential_id, verification_token, recipient_name_snapshot,
			    recipient_email_snapshot, event_title_snapshot, issuer_name_snapshot,
			    issued_at, status, metadata_version, supersedes, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
			[
				newCertificateId,
				eventId,
				certificate.registration_id,
				newBatchId,
				template.id,
				certificateType,
				credentialId(event.date, certificateType, issuedAt),
				verificationToken(),
				recipientName,
				recipientEmail,
				certificate.event_title_snapshot,
				certificate.issuer_name_snapshot,
				issuedAt,
				certificate.id,
				issuedAt,
				issuedAt,
			],
		);

		await query(
			`UPDATE certificates SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ?`,
			[newCertificateId, issuedAt, certificate.id],
		);

		await cancelUnsentDelivery(certificate.id, `Certificate superseded by ${newCertificateId}`);

		await audit({
			actorId: actor.id,
			action: "certificate.supersede",
			eventId,
			entityType: "certificate",
			entityId: certificate.id,
			note: reason,
			before: { status: certificate.status },
			after: { status: "superseded", replacementId: newCertificateId },
		});
	});

	const created = await loadCertificate(newCertificateId);
	return { idempotent: false, certificate: credentialPayload(created as CertificateRow) };
}
