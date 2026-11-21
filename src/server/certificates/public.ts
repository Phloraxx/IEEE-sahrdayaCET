/**
 * Public certificate verification and rendering.
 *
 * Ported from `certificate-public.pb.js` (53 LOC) and
 * `certificate-public-helpers.js` (92 LOC).
 *
 * Two surfaces with different gates:
 *
 *   - **verify** is genuinely public. A 48-char token or a credential id is the
 *     capability; anything that does not match the pattern is a 404 with no
 *     detail, so the endpoint cannot be used to probe for existence.
 *   - **render** needs a second factor: an `X-Certificate-Render-Capability`
 *     header matching `CERTIFICATE_RENDER_CAPABILITY_KEY` (>= 32 chars). The
 *     token alone is not enough, because the render base is the un-watermarked
 *     artwork and a leaked link should not hand it out.
 */

import { join, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { query } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";
import { WorkspaceError } from "@/server/workspace/service";
import {
	CREDENTIAL_ID_RE,
	TOKEN_RE,
	objectValue,
	publicStatus,
} from "@/server/certificates/rules";

const RENDER_HEADER = "x-certificate-render-capability";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

export interface CertificateRow {
	id: string;
	event_id: string;
	/** Exactly one of registration_id / volunteer_id is set. */
	registration_id: string | null;
	volunteer_id: string | null;
	batch_id: string;
	template_id: string;
	certificate_type: string | null;
	credential_id: string | null;
	verification_token: string | null;
	recipient_name_snapshot: string | null;
	recipient_email_snapshot: string | null;
	event_title_snapshot: string | null;
	issuer_name_snapshot: string | null;
	issued_at: string | null;
	status: string | null;
	revoked_at: string | null;
	revocation_reason: string | null;
	supersedes: string | null;
	superseded_by: string | null;
	metadata_version: number;
}

async function byToken(token: string): Promise<CertificateRow | null> {
	if (!TOKEN_RE.test(token)) return null;
	const result = await query<CertificateRow>(
		`SELECT * FROM certificates WHERE verification_token = ?`,
		[token],
	);
	return result.rows[0] ?? null;
}

async function byCredentialId(credentialId: string): Promise<CertificateRow | null> {
	const value = credentialId.trim().toUpperCase();
	if (!CREDENTIAL_ID_RE.test(value)) return null;
	const result = await query<CertificateRow>(`SELECT * FROM certificates WHERE credential_id = ?`, [value]);
	return result.rows[0] ?? null;
}

export function verificationPayload(row: CertificateRow) {
	return {
		recipientName: row.recipient_name_snapshot ?? "",
		event: row.event_title_snapshot ?? "",
		certificateType: row.certificate_type ?? "",
		credentialId: row.credential_id ?? "",
		issueDate: row.issued_at ?? "",
		issuer: row.issuer_name_snapshot ?? "IEEE Sahrdaya Student Branch",
		status: publicStatus(row.status),
	};
}

export async function verifyByToken(token: string) {
	const row = await byToken(token);
	if (!row) fail(404, "INVALID", "INVALID");
	return verificationPayload(row);
}

export async function verifyByCredentialId(credentialId: string) {
	const row = await byCredentialId(credentialId);
	if (!row) fail(404, "INVALID", "INVALID");
	return verificationPayload(row);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function requireRenderCapability(request: Request): void {
	const configured = String(process.env.CERTIFICATE_RENDER_CAPABILITY_KEY ?? "").trim();
	if (configured.length < 32) {
		fail(503, "RENDER_CAPABILITY_UNCONFIGURED", "Certificate rendering is unavailable");
	}
	const supplied = request.headers.get(RENDER_HEADER) ?? "";
	// Constant-time-ish comparison: length check first, then a full scan.
	if (supplied.length !== configured.length) {
		fail(403, "RENDER_CAPABILITY_REQUIRED", "Certificate render capability required");
	}
	let mismatch = 0;
	for (let i = 0; i < configured.length; i += 1) {
		mismatch |= configured.charCodeAt(i) ^ supplied.charCodeAt(i);
	}
	if (mismatch !== 0) {
		fail(403, "RENDER_CAPABILITY_REQUIRED", "Certificate render capability required");
	}
}

interface RenderContext {
	certificate: CertificateRow;
	template: { id: string; render_base: string | null; canvas_width: number; canvas_height: number; layout: string | null; content_hash: string | null };
}

async function renderContext(request: Request, token: string): Promise<RenderContext> {
	requireRenderCapability(request);

	const certificate = await byToken(token);
	if (!certificate) fail(404, "INVALID", "INVALID");

	const template = await query<RenderContext["template"]>(
		`SELECT id, render_base, canvas_width, canvas_height, layout, content_hash
		   FROM certificate_templates WHERE id = ?`,
		[certificate.template_id],
	);
	const row = template.rows[0];
	if (!row || !row.render_base) {
		fail(409, "RENDER_INPUT_UNAVAILABLE", "Certificate render input is unavailable");
	}
	return { certificate, template: row };
}

export async function renderManifest(request: Request, token: string) {
	const ctx = await renderContext(request, token);
	return {
		recipientName: ctx.certificate.recipient_name_snapshot ?? "",
		credentialId: ctx.certificate.credential_id ?? "",
		canvasWidth: ctx.template.canvas_width ?? 0,
		canvasHeight: ctx.template.canvas_height ?? 0,
		layout: objectValue(ctx.template.layout),
		templateContentHash: ctx.template.content_hash ?? "",
	};
}

export async function renderBase(request: Request, token: string) {
	const ctx = await renderContext(request, token);
	const filename = ctx.template.render_base as string;

	const uploadsDir = resolve(getEnv().UPLOADS_DIR);
	const templateDir = resolve(join(uploadsDir, "certificate_templates", ctx.template.id));
	const filePath = resolve(join(templateDir, filename));
	if (filePath !== templateDir && !filePath.startsWith(templateDir + sep)) {
		fail(404, "RENDER_INPUT_UNAVAILABLE", "Certificate render input is unavailable");
	}

	let body: Buffer;
	try {
		body = await readFile(filePath);
	} catch {
		fail(404, "RENDER_INPUT_UNAVAILABLE", "Certificate render input is unavailable");
	}

	return {
		body,
		contentType: /\.webp$/i.test(filename) ? "image/webp" : "image/png",
	};
}
