/**
 * Certificate issuance.
 *
 * Ported from `certificate-issuance.pb.js` (196 LOC) and
 * `certificate-issuance-helpers.js` (332 LOC).
 *
 * The load-bearing idea is the **audience fingerprint**. A preview computes a
 * hash over the exact recipient set; issuance requires the caller to echo that
 * hash back. If anything moved in between — a cancellation, a check-in, a
 * template edit — the hash no longer matches and issuance is refused with
 * `AUDIENCE_CHANGED` rather than issuing against a set nobody reviewed.
 */

import { query, withTransaction } from "@/lib/db.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import {
	audienceInputErrors,
	credentialId,
	fingerprint,
	issueKey,
	nameRenderWarnings,
	normalizeAudienceConfig,
	objectValue,
	validEmail,
	verificationToken,
} from "@/server/certificates/rules";
import type { TemplateRow } from "@/server/certificates/templates";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

interface EventRow {
	id: string;
	title: string | null;
	date: string | null;
	society_id: string | null;
	attendance_qualification_locked: number;
	attendance_qualification_version: number;
	attendance_qualification_locked_at: string | null;
}

async function loadEvent(id: string): Promise<EventRow | null> {
	const result = await query<EventRow>(
		`SELECT id, title, date, society_id, attendance_qualification_locked,
		        attendance_qualification_version, attendance_qualification_locked_at
		   FROM events WHERE id = ?`,
		[id],
	);
	return result.rows[0] ?? null;
}

async function requireIssue(actor: Actor, event: EventRow): Promise<void> {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "certificates.issue", { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot issue certificates for this event");
	}
}

export async function publishedTemplate(
	eventId: string,
	templateId: string,
): Promise<TemplateRow | null> {
	const result = await query<TemplateRow>(
		`SELECT * FROM certificate_templates WHERE id = ? AND event_id = ? AND status = 'published'`,
		[templateId, eventId],
	);
	return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Attendance qualification
// ---------------------------------------------------------------------------

interface QualificationStatus {
	locked: boolean;
	version: number;
	requiredSessionCount: number;
	lockedAt: string;
}

/**
 * The qualification state for an event.
 *
 * "Locked" means the organizer froze the attendance result, so the audience can
 * no longer shift underneath a batch. Required sessions are the ones flagged
 * `required_for_certificate`.
 */
export async function qualificationStatus(eventId: string): Promise<QualificationStatus> {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");

	const required = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM event_sessions WHERE event_id = ? AND required_for_certificate = 1`,
		[eventId],
	);

	return {
		locked: event.attendance_qualification_locked === 1,
		version: event.attendance_qualification_version ?? 0,
		requiredSessionCount: required.rows[0]?.count ?? 0,
		lockedAt: event.attendance_qualification_locked_at ?? "",
	};
}

interface QualificationResult {
	qualified: boolean;
	attendedRequired: number;
	requiredSessionCount: number;
}

/**
 * Did this registration attend every required session?
 *
 * State is the fold of the attendance history (phase 5), so a removal followed
 * by a re-add counts as present.
 */
async function registrationQualification(
	eventId: string,
	registrationId: string,
): Promise<QualificationResult> {
	const required = await query<{ id: string }>(
		`SELECT id FROM event_sessions WHERE event_id = ? AND required_for_certificate = 1`,
		[eventId],
	);
	if (!required.rows.length) {
		return { qualified: false, attendedRequired: 0, requiredSessionCount: 0 };
	}

	const rows = await query<{ session_id: string; type: string }>(
		`SELECT session_id, type FROM attendance_records
		  WHERE event_id = ? AND registration_id = ?
		  ORDER BY occurred_at ASC, created_at ASC, id ASC`,
		[eventId, registrationId],
	);

	const state = new Map<string, boolean>();
	for (const row of rows.rows) {
		const current = state.get(row.session_id) === true;
		const next =
			row.type === "present" || row.type === "entry" || row.type === "manual_add"
				? true
				: row.type === "manual_remove"
					? false
					: current;
		state.set(row.session_id, next);
	}

	let attendedRequired = 0;
	for (const session of required.rows) {
		if (state.get(session.id) === true) attendedRequired += 1;
	}

	return {
		qualified: attendedRequired === required.rows.length,
		attendedRequired,
		requiredSessionCount: required.rows.length,
	};
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

interface RegistrationRow {
	id: string;
	user_name: string | null;
	user_email: string | null;
	registration_status: string;
	checked_in: number;
	checked_in_at: string | null;
}

interface VolunteerRow {
	id: string;
	name: string | null;
	email: string | null;
	role: string | null;
	active: number;
}

export interface AudienceRecipient {
	id: string;
	name: string;
	email: string;
	/**
	 * Which table `id` points at. A certificate is attributable to exactly one
	 * of a registration or a volunteer; the audience carries the choice through
	 * to issuance so the right column is written.
	 */
	source: "registration" | "volunteer";
	emailEligible: boolean;
	checkedIn: boolean;
	checkedInAt: string;
	qualification: QualificationResult | null;
}

export interface AudienceExcluded {
	id: string;
	name: string;
	email: string;
	reason: string;
	qualification?: QualificationResult;
}

export interface BuiltAudience {
	audienceType: string;
	audienceConfig: Record<string, unknown>;
	qualification: Record<string, unknown> | null;
	fingerprint: string;
	recipients: AudienceRecipient[];
	excluded: AudienceExcluded[];
	recipientCount: number;
	emailEligibleCount: number;
	missingEmailCount: number;
	renderWarnings: Array<Record<string, unknown>>;
}

interface BuildInput {
	eventId: string;
	template: TemplateRow;
	certificateType: string;
	audienceType: string;
	audienceConfig: unknown;
}

export async function buildAudience(input: BuildInput): Promise<BuiltAudience> {
	const config = normalizeAudienceConfig(input.audienceType, input.audienceConfig);
	const errors = audienceInputErrors(input.audienceType, config);
	if (errors.length) fail(400, "INVALID_AUDIENCE", errors.join(". "));

	let qualificationMeta: Record<string, unknown> | null = null;
	if (input.audienceType === "attendance_qualified") {
		const status = await qualificationStatus(input.eventId);
		if (!status.locked || !status.requiredSessionCount) {
			fail(
				409,
				"ATTENDANCE_QUALIFICATION_UNLOCKED",
				"Lock attendance qualification after reconciling required sessions before using this audience",
			);
		}
		qualificationMeta = {
			version: status.version,
			rule: "all_required_sessions",
			requiredSessionCount: status.requiredSessionCount,
			lockedAt: status.lockedAt,
		};
	}

	const selected = new Set<string>(
		Array.isArray(config.registrationIds) ? (config.registrationIds as string[]) : [],
	);
	const selectedVolunteers = new Set<string>(
		Array.isArray(config.volunteerIds) ? (config.volunteerIds as string[]) : [],
	);
	const volunteerMode = input.audienceType === "selected" && selectedVolunteers.size > 0;

	const recipients: AudienceRecipient[] = [];
	const excluded: AudienceExcluded[] = [];
	const seen = new Set<string>();

	if (volunteerMode) {
		const volunteers = await query<VolunteerRow>(
			`SELECT id, name, email, role, active FROM event_volunteers WHERE event_id = ?`,
			[input.eventId],
		);
		const issued = await query<{ volunteer_id: string }>(
			`SELECT volunteer_id FROM certificates
			  WHERE event_id = ? AND certificate_type = ? AND status = 'active'
			    AND volunteer_id IS NOT NULL`,
			[input.eventId, input.certificateType],
		);
		const issuedTo = new Set(issued.rows.map((row) => row.volunteer_id));

		for (const volunteer of volunteers.rows) {
			if (!selectedVolunteers.has(volunteer.id)) continue;
			seen.add(volunteer.id);
			const name = String(volunteer.name ?? "").trim();
			const email = String(volunteer.email ?? "").trim();
			const reason =
				volunteer.active !== 1
					? "inactive"
					: !name
						? "missing_name"
						: issuedTo.has(volunteer.id)
							? "already_issued"
							: "";
			if (reason) {
				excluded.push({ id: volunteer.id, name, email, reason });
				continue;
			}
			recipients.push({
				id: volunteer.id,
				name,
				email,
				source: "volunteer",
				emailEligible: validEmail(email),
				checkedIn: false,
				checkedInAt: "",
				qualification: null,
			});
		}
	} else {
		const registrations = await query<RegistrationRow>(
			`SELECT id, user_name, user_email, registration_status, checked_in, checked_in_at
			   FROM registrations WHERE event_id = ?`,
			[input.eventId],
		);

		const active = await query<{ registration_id: string }>(
			`SELECT registration_id FROM certificates
			  WHERE event_id = ? AND certificate_type = ? AND status = 'active'`,
			[input.eventId, input.certificateType],
		);
		const activeSet = new Set(active.rows.map((row) => row.registration_id));

		for (const registration of registrations.rows) {
			const row = {
				id: registration.id,
				name: String(registration.user_name ?? "").trim(),
				email: String(registration.user_email ?? "").trim(),
				registrationStatus: registration.registration_status,
				checkedIn: registration.checked_in === 1,
				checkedInAt: registration.checked_in_at ?? "",
			};
			seen.add(row.id);

			let qualification: QualificationResult | null = null;

			if (input.audienceType === "attendance_qualified") {
				if (row.registrationStatus !== "confirmed") continue;
				qualification = await registrationQualification(input.eventId, row.id);
				if (!qualification.qualified) {
					excluded.push({ ...row, reason: "attendance_not_qualified", qualification });
					continue;
				}
			} else {
				const candidate =
					input.audienceType === "selected"
						? selected.has(row.id)
						: input.audienceType === "checked_in"
							? row.checkedIn
							: input.audienceType === "confirmed"
								? row.registrationStatus === "confirmed"
								: false;
				if (!candidate) continue;
			}

			// Exclusion order matters: a cancelled registration is reported as
			// cancelled even if it also lacks a name.
			const reason =
				row.registrationStatus === "cancelled"
					? "cancelled"
					: !row.name
						? "missing_name"
						: activeSet.has(row.id)
							? "already_issued"
							: "";
			if (reason) {
				excluded.push({ id: row.id, name: row.name, email: row.email, reason });
				continue;
			}

			recipients.push({
				...row,
				source: "registration",
				emailEligible: validEmail(row.email),
				qualification,
			});
		}
	}

	if (input.audienceType === "selected") {
		const selectedIds = volunteerMode ? selectedVolunteers : selected;
		for (const id of selectedIds) {
			if (!seen.has(id)) excluded.push({ id, name: "", email: "", reason: "not_found" });
		}
	}

	recipients.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	excluded.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

	const audienceFingerprint = fingerprint({
		eventId: input.eventId,
		templateId: input.template.id,
		templateContentHash: input.template.content_hash ?? "",
		certificateType: input.certificateType,
		audienceType: input.audienceType,
		audienceConfig: config,
		qualification: qualificationMeta,
		recipients: recipients.map((row) => ({
			id: row.id,
			source: row.source,
			name: row.name,
			email: row.email,
		})),
	});

	const emailEligibleCount = recipients.filter((row) => row.emailEligible).length;

	const renderWarnings: Array<Record<string, unknown>> = [];
	const layout = objectValue(input.template.layout);
	const canvasWidth = input.template.canvas_width ?? 0;
	for (const row of recipients) {
		for (const warning of nameRenderWarnings(row.name, layout, canvasWidth)) {
			renderWarnings.push({
				registrationId: row.id,
				name: row.name,
				code: warning.code,
				severity: warning.severity,
				message: warning.message,
			});
		}
	}

	return {
		audienceType: input.audienceType,
		audienceConfig: config,
		qualification: qualificationMeta,
		fingerprint: audienceFingerprint,
		recipients,
		excluded,
		recipientCount: recipients.length,
		emailEligibleCount,
		missingEmailCount: recipients.length - emailEligibleCount,
		renderWarnings,
	};
}

export function previewPayload(audience: BuiltAudience, template: TemplateRow) {
	return {
		template: {
			id: template.id,
			name: template.name ?? "",
			version: template.version ?? 1,
			certificateType: template.certificate_type ?? "",
			contentHash: template.content_hash ?? "",
		},
		audienceType: audience.audienceType,
		audienceConfig: audience.audienceConfig,
		audienceFingerprint: audience.fingerprint,
		qualification: audience.qualification,
		recipientCount: audience.recipientCount,
		emailEligibleCount: audience.emailEligibleCount,
		missingEmailCount: audience.missingEmailCount,
		renderWarnings: audience.renderWarnings,
		recipients: audience.recipients,
		excluded: audience.excluded,
	};
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCandidates(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireIssue(actor, event);

	const rows = await query<RegistrationRow>(
		`SELECT id, user_name, user_email, registration_status, checked_in, checked_in_at
		   FROM registrations WHERE event_id = ?`,
		[eventId],
	);

	const candidates = rows.rows
		.map((row) => ({
			id: row.id,
			name: String(row.user_name ?? "").trim(),
			email: String(row.user_email ?? "").trim(),
			registrationStatus: row.registration_status,
			checkedIn: row.checked_in === 1,
		}))
		.sort((a, b) => {
			const an = a.name.toLowerCase();
			const bn = b.name.toLowerCase();
			if (an < bn) return -1;
			if (an > bn) return 1;
			return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		});

	// Volunteers are a separate audience: they worked the event without a
	// registration, so they cannot appear in `candidates` or be keyed by a
	// registration id.
	const volunteerRows = await query<VolunteerRow>(
		`SELECT id, name, email, role, active FROM event_volunteers WHERE event_id = ?`,
		[eventId],
	);
	const volunteers = volunteerRows.rows
		.map((row) => ({
			id: row.id,
			name: String(row.name ?? "").trim(),
			email: String(row.email ?? "").trim(),
			role: String(row.role ?? "").trim(),
			active: row.active === 1,
		}))
		.sort((a, b) => {
			const an = a.name.toLowerCase();
			const bn = b.name.toLowerCase();
			if (an < bn) return -1;
			if (an > bn) return 1;
			return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		});

	return { candidates, volunteers };
}

export async function previewAudience(actor: Actor, eventId: string, input: Record<string, unknown>) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireIssue(actor, event);

	const template = await publishedTemplate(eventId, String(input.templateId ?? ""));
	if (!template) fail(400, "PUBLISHED_TEMPLATE_REQUIRED", "Choose a published certificate template");

	const audience = await buildAudience({
		eventId,
		template,
		certificateType: template.certificate_type ?? "",
		audienceType: String(input.audienceType ?? ""),
		audienceConfig: input.audienceConfig ?? {},
	});

	return previewPayload(audience, template);
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export interface BatchRow {
	id: string;
	event_id: string;
	template_id: string;
	audience_type: string | null;
	audience_config: string | null;
	audience_fingerprint: string | null;
	status: string | null;
	recipient_count: number;
	issued_count: number;
	email_eligible_count: number;
	queued_count: number;
	sent_count: number;
	failed_count: number;
	missing_email_count: number;
	issued_at: string | null;
	note: string | null;
	idempotency_key: string | null;
}

export function batchPayload(batch: BatchRow): Record<string, unknown> {
	return {
		id: batch.id,
		eventId: batch.event_id,
		templateId: batch.template_id,
		audienceType: batch.audience_type ?? "",
		audienceConfig: objectValue(batch.audience_config),
		audienceFingerprint: batch.audience_fingerprint ?? "",
		status: batch.status ?? "",
		recipientCount: batch.recipient_count ?? 0,
		issuedCount: batch.issued_count ?? 0,
		emailEligibleCount: batch.email_eligible_count ?? 0,
		missingEmailCount: batch.missing_email_count ?? 0,
		issuedAt: batch.issued_at ?? "",
		note: batch.note ?? "",
	};
}

async function existingBatch(idempotencyKey: string): Promise<BatchRow | null> {
	const result = await query<BatchRow>(
		`SELECT * FROM certificate_batches WHERE idempotency_key = ? ORDER BY created_at DESC LIMIT 1`,
		[idempotencyKey],
	);
	return result.rows[0] ?? null;
}

async function certificateSummaries(batchId: string) {
	const rows = await query<{
		id: string;
		registration_id: string | null;
		volunteer_id: string | null;
		recipient_name_snapshot: string | null;
		recipient_email_snapshot: string | null;
		credential_id: string | null;
		status: string | null;
	}>(
		`SELECT id, registration_id, volunteer_id, recipient_name_snapshot, recipient_email_snapshot, credential_id, status
		   FROM certificates WHERE batch_id = ? ORDER BY credential_id`,
		[batchId],
	);
	return rows.rows.map((row) => ({
		id: row.id,
		registrationId: row.registration_id,
		volunteerId: row.volunteer_id,
		recipientName: row.recipient_name_snapshot ?? "",
		recipientEmail: row.recipient_email_snapshot ?? "",
		credentialId: row.credential_id ?? "",
		status: row.status ?? "active",
	}));
}

async function issuerName(actorId: string): Promise<string> {
	const result = await query<{ name: string | null; display_name: string | null }>(
		`SELECT name, display_name FROM users WHERE id = ?`,
		[actorId],
	);
	const name = result.rows[0]?.name ?? result.rows[0]?.display_name ?? "";
	return name.trim() || "IEEE Sahrdaya Student Branch";
}

export async function issueCertificates(
	actor: Actor,
	eventId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireIssue(actor, event);

	const template = await publishedTemplate(eventId, String(input.templateId ?? ""));
	if (!template) fail(400, "PUBLISHED_TEMPLATE_REQUIRED", "Choose a published certificate template");

	const audienceType = String(input.audienceType ?? "");
	const config = normalizeAudienceConfig(audienceType, input.audienceConfig ?? {});
	const reviewedFingerprint = String(input.audienceFingerprint ?? "");
	if (!reviewedFingerprint) {
		fail(400, "AUDIENCE_REVIEW_REQUIRED", "Review the audience before issuing certificates");
	}

	const key = issueKey({
		eventId,
		templateId: template.id,
		audienceType,
		audienceConfig: config,
		audienceFingerprint: reviewedFingerprint,
	});

	// Idempotency first: a retried request must return the original batch.
	const prior = await existingBatch(key);
	if (prior) {
		return {
			idempotent: true,
			batch: batchPayload(prior),
			certificates: await certificateSummaries(prior.id),
		};
	}

	const issuedAt = new Date().toISOString();
	const issuer = await issuerName(actor.id);
	const batchId = crypto.randomUUID();

	try {
		await withTransaction(async () => {
			const raced = await existingBatch(key);
			if (raced) {
				throw new WorkspaceError(409, "IDEMPOTENT_REPLAY", raced.id);
			}

			const liveTemplate = await publishedTemplate(eventId, template.id);
			if (!liveTemplate) fail(409, "PUBLISHED_TEMPLATE_REQUIRED", "The selected template is no longer published");

			const audience = await buildAudience({
				eventId,
				template: liveTemplate,
				certificateType: liveTemplate.certificate_type ?? "",
				audienceType,
				audienceConfig: config,
			});

			// The audience must still be the one the operator reviewed.
			if (audience.fingerprint !== reviewedFingerprint) {
				fail(409, "AUDIENCE_CHANGED", "The audience changed after review. Review it again before issuing.");
			}
			if (!audience.recipientCount) fail(400, "EMPTY_AUDIENCE", "No eligible recipients remain in this audience");

			await query(
				`INSERT INTO certificate_batches
				   (id, event_id, template_id, audience_type, audience_config, audience_fingerprint,
				    audience_snapshot, idempotency_key, status, recipient_count, issued_count,
				    email_eligible_count, queued_count, sent_count, failed_count, missing_email_count,
				    created_by, issued_by, issued_at, note, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
				[
					batchId,
					eventId,
					liveTemplate.id,
					audienceType,
					JSON.stringify(audience.audienceConfig),
					audience.fingerprint,
					JSON.stringify({ recipients: audience.recipients, excluded: audience.excluded }),
					key,
					audience.recipientCount,
					audience.recipientCount,
					audience.emailEligibleCount,
					audience.missingEmailCount,
					actor.id,
					actor.id,
					issuedAt,
					String(input.note ?? "").trim().slice(0, 4000),
					issuedAt,
					issuedAt,
				],
			);

			const certificateType = liveTemplate.certificate_type ?? "participation";
			const eventTitle = event.title ?? "IEEE Sahrdaya event";

			for (const recipient of audience.recipients) {
				const isVolunteer = recipient.source === "volunteer";
				await query(
					`INSERT INTO certificates
					   (id, event_id, registration_id, volunteer_id, batch_id, template_id, certificate_type,
					    credential_id, verification_token, recipient_name_snapshot,
					    recipient_email_snapshot, event_title_snapshot, issuer_name_snapshot,
					    issued_at, status, metadata_version, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
					[
						crypto.randomUUID(),
						eventId,
						isVolunteer ? null : recipient.id,
						isVolunteer ? recipient.id : null,
						batchId,
						liveTemplate.id,
						certificateType,
						credentialId(event.date, certificateType, issuedAt),
						verificationToken(),
						recipient.name,
						recipient.email,
						eventTitle,
						issuer,
						issuedAt,
						issuedAt,
						issuedAt,
					],
				);
			}

			await audit({
				actorId: actor.id,
				action: "certificate.batch-issue",
				eventId,
				entityType: "certificate_batch",
				entityId: batchId,
				note: String(input.note ?? "").trim().slice(0, 4000),
				after: { recipientCount: audience.recipientCount, audienceType },
			});
		});
	} catch (error) {
		// A concurrent request may have won the race; return its batch.
		if (error instanceof WorkspaceError && error.code === "IDEMPOTENT_REPLAY") {
			const recovered = await existingBatch(key);
			if (recovered) {
				return {
					idempotent: true,
					batch: batchPayload(recovered),
					certificates: await certificateSummaries(recovered.id),
				};
			}
		}
		throw error;
	}

	const batch = await query<BatchRow>(`SELECT * FROM certificate_batches WHERE id = ?`, [batchId]);
	return {
		idempotent: false,
		batch: batchPayload(batch.rows[0] as BatchRow),
		certificates: await certificateSummaries(batchId),
	};
}
