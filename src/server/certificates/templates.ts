/**
 * Certificate templates.
 *
 * Ported from `certificate-templates.pb.js` (191 LOC) and
 * `certificate-template-helpers.js` (193 LOC).
 *
 * The security-critical piece is `resolveAsset`. Three file columns
 * (`sourceBackground`, `sourceSignatures`, `renderBase`) hold artwork that is
 * never public: it is the un-rendered source of a credential. Every read goes
 * through four checks — session, event capability, field allow-list, and a
 * filename pinned to the row — and any failure is a 404, never a 403, so a probe
 * cannot learn whether a template exists.
 */

import { join, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { query, withTransaction } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";
import { audit } from "@/server/audit";
import { hasEventCapability, type Actor, type Capability } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import {
	CERTIFICATE_TYPES,
	objectValue,
	publicationErrors,
	stableStringify,
	sha256,
	templateNameWarnings,
	validateLayout,
} from "@/server/certificates/rules";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

function clip(value: unknown, max: number): string {
	return String(value ?? "").trim().slice(0, max);
}

/** The file columns a template may serve, and whether they hold one or many. */
const ASSET_FIELDS = {
	sourceBackground: { multi: false },
	renderBase: { multi: false },
	sourceSignatures: { multi: true },
} as const;

type AssetField = keyof typeof ASSET_FIELDS;

export interface TemplateRow {
	id: string;
	name: string | null;
	scope_type: string | null;
	society_id: string | null;
	event_id: string | null;
	certificate_type: string | null;
	version: number;
	status: string | null;
	source_background: string | null;
	source_signatures: string | null;
	render_base: string | null;
	canvas_width: number;
	canvas_height: number;
	layout: string | null;
	email_subject: string | null;
	email_html: string | null;
	email_text: string | null;
	created_by: string | null;
	published_by: string | null;
	published_at: string | null;
	content_hash: string | null;
	created_at: string;
	updated_at: string;
}

export async function loadTemplate(id: string): Promise<TemplateRow | null> {
	const result = await query<TemplateRow>(`SELECT * FROM certificate_templates WHERE id = ?`, [id]);
	return result.rows[0] ?? null;
}

interface EventScope {
	id: string;
	society_id: string | null;
	date: string | null;
	title: string | null;
}

async function loadEvent(id: string): Promise<EventScope | null> {
	const result = await query<EventScope>(`SELECT id, society_id, date, title FROM events WHERE id = ?`, [id]);
	return result.rows[0] ?? null;
}

async function requireEventCapability(
	actor: Actor,
	capability: Capability,
	event: EventScope,
): Promise<void> {
	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, capability, { id: event.id, societyId: event.society_id }, assignments)) {
		fail(403, "FORBIDDEN", "You cannot manage this certificate template");
	}
}

/** Parse the `sourceSignatures` JSON array column. */
export function signatureNames(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

/** The client-facing projection. Only `renderBase` is advertised. */
export function templatePayload(row: TemplateRow): Record<string, unknown> {
	const layout = objectValue(row.layout);
	return {
		id: row.id,
		name: row.name ?? "",
		scopeType: row.scope_type ?? "event",
		societyId: row.society_id ?? "",
		eventId: row.event_id ?? "",
		certificateType: row.certificate_type ?? "participation",
		version: row.version ?? 1,
		status: row.status ?? "draft",
		canvasWidth: row.canvas_width ?? 0,
		canvasHeight: row.canvas_height ?? 0,
		layout,
		emailSubject: row.email_subject ?? "",
		emailText: row.email_text ?? "",
		contentHash: row.content_hash ?? "",
		publishedAt: row.published_at ?? "",
		created: row.created_at,
		updated: row.updated_at,
		preflightWarnings: templateNameWarnings(layout, row.canvas_width ?? 0),
		files: {
			renderBase: row.render_base
				? { name: row.render_base, url: assetUrl(row.id, "renderBase", row.render_base) }
				: null,
		},
	};
}

export function assetUrl(templateId: string, field: AssetField, filename: string): string {
	return `/api/certificate-templates/${templateId}/assets/${field}/${encodeURIComponent(filename)}`;
}

// ---------------------------------------------------------------------------
// Protected asset serving
// ---------------------------------------------------------------------------

export interface AssetResult {
	body: Buffer;
	contentType: string;
}

/**
 * Resolve a template asset, or refuse.
 *
 * The order matters: capability is checked before the filename, so an
 * unauthorised caller cannot use the 404/403 distinction to enumerate filenames.
 */
export async function resolveAsset(
	actor: Actor | null,
	templateId: string,
	field: string,
	filename: string,
): Promise<AssetResult> {
	if (!actor) fail(401, "AUTHENTICATION_REQUIRED", "Authentication required");

	const template = await loadTemplate(templateId);
	if (!template) fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");

	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");

	const assignments = await loadAssignments(actor.id);
	if (!hasEventCapability(actor, "certificates.view", { id: event.id, societyId: event.society_id }, assignments)) {
		// Deliberately 404: a 403 would confirm the template exists.
		fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");
	}

	if (!(field in ASSET_FIELDS)) fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");
	const assetField = field as AssetField;
	if (!filename) fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");

	// The filename must be the one stored on this row — the storage directory is
	// flat, so a guessed name would otherwise read another template's artwork.
	const stored =
		assetField === "sourceBackground"
			? template.source_background
			: assetField === "renderBase"
				? template.render_base
				: null;
	const allowed =
		assetField === "sourceSignatures"
			? signatureNames(template.source_signatures).includes(filename)
			: stored === filename;
	if (!allowed) fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");

	const uploadsDir = resolve(getEnv().UPLOADS_DIR);
	const filePath = resolve(join(uploadsDir, "certificate_templates", template.id, filename));
	// Path containment: the resolved path must sit inside this template's folder.
	const templateDir = resolve(join(uploadsDir, "certificate_templates", template.id));
	if (filePath !== templateDir && !filePath.startsWith(templateDir + sep)) {
		fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");
	}

	let body: Buffer;
	try {
		body = await readFile(filePath);
	} catch {
		fail(404, "ASSET_NOT_FOUND", "Certificate template asset not found");
	}

	const contentType = /\.png$/i.test(filename)
		? "image/png"
		: /\.jpe?g$/i.test(filename)
			? "image/jpeg"
			: /\.webp$/i.test(filename)
				? "image/webp"
				: "application/octet-stream";

	return { body, contentType };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listEventTemplates(actor: Actor, eventId: string) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.view", event);

	const rows = await query<TemplateRow>(
		`SELECT * FROM certificate_templates
		  WHERE scope_type = 'event' AND event_id = ?
		  ORDER BY version DESC, created_at DESC`,
		[eventId],
	);
	return { templates: rows.rows.map(templatePayload) };
}

export async function getTemplate(actor: Actor, templateId: string) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.view", event);
	return { template: templatePayload(template) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function defaultLayout(): Record<string, unknown> {
	return {
		name: {
			x: 0.5,
			y: 0.47,
			maxWidth: 0.5,
			preferredFontSize: 118,
			minFontSize: 48,
			align: "center",
			color: "#0B243D",
			fontFamily: "noto-sans",
		},
		credentialId: { x: 0.08, y: 0.92, fontSize: 28, align: "left", color: "#0B243D" },
		qr: { enabled: false, x: 0.86, y: 0.76, size: 0.11 },
	};
}

const DEFAULT_EMAIL_SUBJECT = "Your certificate | {{eventTitle}}";
const DEFAULT_EMAIL_TEXT =
	"Hi {{firstName}},\n\nThank you for being part of {{eventTitle}}.\n\nView and verify your certificate: {{verificationUrl}}\nCredential ID: {{credentialId}}\n\nIEEE Sahrdaya Student Branch";

async function nextVersion(eventId: string, name: string): Promise<number> {
	const result = await query<{ version: number }>(
		`SELECT version FROM certificate_templates WHERE event_id = ? AND name = ?
		  ORDER BY version DESC LIMIT 1`,
		[eventId, name],
	);
	return (result.rows[0]?.version ?? 0) + 1;
}

export async function createTemplate(
	actor: Actor,
	eventId: string,
	input: Record<string, unknown>,
) {
	const event = await loadEvent(eventId);
	if (!event) fail(404, "EVENT_NOT_FOUND", "Event not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	const name = clip(input.name, 180);
	const certificateType = clip(input.certificateType || "participation", 40);
	if (name.length < 3) fail(400, "NAME_REQUIRED", "Template name must be at least 3 characters");
	if (!(CERTIFICATE_TYPES as readonly string[]).includes(certificateType)) {
		fail(400, "INVALID_CERTIFICATE_TYPE", "Invalid certificate type");
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const version = await nextVersion(eventId, name);

	await withTransaction(async () => {
		await query(
			`INSERT INTO certificate_templates
			   (id, name, scope_type, society_id, event_id, certificate_type, version, status,
			    canvas_width, canvas_height, layout, email_subject, email_text, email_html,
			    created_by, created_at, updated_at)
			 VALUES (?, ?, 'event', ?, ?, ?, ?, 'draft', 0, 0, ?, ?, ?, '', ?, ?, ?)`,
			[
				id,
				name,
				event.society_id ?? null,
				eventId,
				certificateType,
				version,
				JSON.stringify(defaultLayout()),
				DEFAULT_EMAIL_SUBJECT,
				DEFAULT_EMAIL_TEXT,
				actor.id,
				now,
				now,
			],
		);
		await audit({
			actorId: actor.id,
			action: "certificate.template-create",
			eventId,
			entityType: "certificate_template",
			entityId: id,
			after: { name, certificateType, version },
		});
	});

	const created = await loadTemplate(id);
	return { template: templatePayload(created as TemplateRow) };
}

export async function updateTemplate(
	actor: Actor,
	templateId: string,
	input: Record<string, unknown>,
) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	// A published template is immutable: issued credentials point at its hash.
	if (template.status !== "draft") {
		fail(409, "TEMPLATE_IMMUTABLE", "Published certificate templates cannot be edited");
	}

	const nextLayout = Object.hasOwn(input, "layout") ? objectValue(input.layout) : objectValue(template.layout);
	const emailSubject =
		input.emailSubject === undefined ? (template.email_subject ?? "") : clip(input.emailSubject, 240);
	const emailText =
		input.emailText === undefined ? (template.email_text ?? "") : String(input.emailText ?? "").slice(0, 50_000);

	await withTransaction(async () => {
		await query(
			`UPDATE certificate_templates
			    SET layout = ?, email_subject = ?, email_text = ?, email_html = '', updated_at = ?
			  WHERE id = ?`,
			[JSON.stringify(nextLayout), emailSubject, emailText, new Date().toISOString(), templateId],
		);
		await audit({
			actorId: actor.id,
			action: "certificate.template-update",
			eventId: event.id,
			entityType: "certificate_template",
			entityId: templateId,
			before: { emailSubject: template.email_subject },
			after: { emailSubject },
		});
	});

	const updated = await loadTemplate(templateId);
	return { template: templatePayload(updated as TemplateRow) };
}

/** The content hash covers everything a credential depends on. */
function publishHash(row: TemplateRow): string {
	return sha256(
		stableStringify({
			name: row.name ?? "",
			scopeType: row.scope_type ?? "",
			society: row.society_id ?? "",
			event: row.event_id ?? "",
			certificateType: row.certificate_type ?? "",
			version: row.version ?? 0,
			sourceBackground: row.source_background ?? "",
			sourceSignatures: signatureNames(row.source_signatures),
			renderBase: row.render_base ?? "",
			canvasWidth: row.canvas_width ?? 0,
			canvasHeight: row.canvas_height ?? 0,
			layout: objectValue(row.layout),
			emailSubject: row.email_subject ?? "",
			emailText: row.email_text ?? "",
			emailHtml: row.email_html ?? "",
			contentHash: "",
			publishedBy: "",
			publishedAt: "",
		}),
	);
}

export async function publishTemplate(actor: Actor, templateId: string) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	if (template.status !== "draft") {
		fail(409, "TEMPLATE_NOT_DRAFT", "Only draft templates can be published");
	}

	const errors = publicationErrors({
		renderBase: template.render_base ?? "",
		canvasWidth: template.canvas_width,
		canvasHeight: template.canvas_height,
		layout: objectValue(template.layout),
		emailSubject: template.email_subject ?? "",
		emailText: template.email_text ?? "",
	});
	if (errors.length) {
		throw new WorkspaceError(422, "TEMPLATE_NOT_READY", `Template is not ready to publish: ${errors.join("; ")}`);
	}

	const now = new Date().toISOString();
	const hash = publishHash(template);

	await withTransaction(async () => {
		await query(
			`UPDATE certificate_templates
			    SET status = 'published', published_by = ?, published_at = ?, content_hash = ?, updated_at = ?
			  WHERE id = ?`,
			[actor.id, now, hash, now, templateId],
		);
		await audit({
			actorId: actor.id,
			action: "certificate.template-publish",
			eventId: event.id,
			entityType: "certificate_template",
			entityId: templateId,
			after: { status: "published", contentHash: hash },
		});
	});

	const updated = await loadTemplate(templateId);
	return { template: templatePayload(updated as TemplateRow) };
}

export async function archiveTemplate(actor: Actor, templateId: string) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	if (template.status !== "published") {
		fail(409, "TEMPLATE_NOT_PUBLISHED", "Only published templates can be archived");
	}

	await withTransaction(async () => {
		await query(`UPDATE certificate_templates SET status = 'archived', updated_at = ? WHERE id = ?`, [
			new Date().toISOString(),
			templateId,
		]);
		await audit({
			actorId: actor.id,
			action: "certificate.template-archive",
			eventId: event.id,
			entityType: "certificate_template",
			entityId: templateId,
			before: { status: "published" },
			after: { status: "archived" },
		});
	});

	const updated = await loadTemplate(templateId);
	return { template: templatePayload(updated as TemplateRow) };
}

export async function newTemplateVersion(actor: Actor, templateId: string) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	if (template.status !== "published" && template.status !== "archived") {
		fail(409, "TEMPLATE_NOT_VERSIONED", "Publish this draft before creating another version");
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const version = await nextVersion(template.event_id ?? "", template.name ?? "Certificate");

	await withTransaction(async () => {
		await query(
			`INSERT INTO certificate_templates
			   (id, name, scope_type, society_id, event_id, certificate_type, version, status,
			    source_background, source_signatures, render_base, canvas_width, canvas_height,
			    layout, email_subject, email_text, email_html, created_by, created_at, updated_at)
			 VALUES (?, ?, 'event', ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
			[
				id,
				template.name ?? "Certificate",
				template.society_id,
				template.event_id,
				template.certificate_type,
				version,
				template.source_background,
				template.source_signatures,
				template.render_base,
				template.canvas_width,
				template.canvas_height,
				template.layout,
				template.email_subject,
				template.email_text,
				actor.id,
				now,
				now,
			],
		);
		await audit({
			actorId: actor.id,
			action: "certificate.template-version-create",
			eventId: event.id,
			entityType: "certificate_template",
			entityId: id,
			note: `Created from template ${templateId}`,
			after: { version },
		});
	});

	const created = await loadTemplate(id);
	return { template: templatePayload(created as TemplateRow) };
}

export async function deleteTemplate(actor: Actor, templateId: string) {
	const template = await loadTemplate(templateId);
	if (!template) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	const event = template.event_id ? await loadEvent(template.event_id) : null;
	if (!event) fail(404, "TEMPLATE_NOT_FOUND", "Certificate template not found");
	await requireEventCapability(actor, "certificates.manage_templates", event);

	if (template.status !== "draft") {
		fail(409, "TEMPLATE_IMMUTABLE", "Published or archived templates cannot be deleted");
	}

	await withTransaction(async () => {
		await query(`DELETE FROM certificate_templates WHERE id = ?`, [templateId]);
		await audit({
			actorId: actor.id,
			action: "certificate.template-delete",
			eventId: event.id,
			entityType: "certificate_template",
			entityId: templateId,
			before: { name: template.name, status: template.status },
		});
	});

	return { success: true };
}

export { validateLayout };
