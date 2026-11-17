/**
 * Certificate verification and rendering for the public pages.
 *
 * This module used to call PocketBase over HTTP. It now calls the certificate
 * service in-process, which is both faster and the last step in removing the
 * PocketBase dependency from the app entirely.
 *
 * The public contract is unchanged: an unknown token is `INVALID`, never an
 * error, and a render request without the capability key is a hard failure
 * rather than a silent empty page.
 */

import {
	renderBase,
	renderManifest,
	verifyByCredentialId,
	verifyByToken,
} from "@/server/certificates/public";
import { CREDENTIAL_ID_RE, TOKEN_RE } from "@/server/certificates/rules";
import type { CertificateTemplateLayout } from "@/server/certificates/render.server";

export type CertificateVerificationStatus = "ACTIVE" | "REVOKED" | "SUPERSEDED" | "INVALID";

export interface CertificateVerification {
	recipientName?: string;
	event?: string;
	certificateType?: string;
	credentialId?: string;
	issueDate?: string;
	issuer?: string;
	status: CertificateVerificationStatus;
}

export interface CertificateRenderData {
	recipientName: string;
	credentialId: string;
	canvasWidth: number;
	canvasHeight: number;
	layout: CertificateTemplateLayout;
	renderBase: Buffer;
}

const RENDER_HEADER = "x-certificate-render-capability";

function invalidVerification(): CertificateVerification {
	return { status: "INVALID" };
}

function statusValue(value: unknown): CertificateVerificationStatus {
	return value === "ACTIVE" || value === "REVOKED" || value === "SUPERSEDED" ? value : "INVALID";
}

function toVerification(payload: {
	recipientName?: string;
	event?: string;
	certificateType?: string;
	credentialId?: string;
	issueDate?: string;
	issuer?: string;
	status?: string;
}): CertificateVerification {
	const status = statusValue(payload.status);
	if (status === "INVALID") return invalidVerification();
	return {
		recipientName: payload.recipientName ?? "",
		event: payload.event ?? "",
		certificateType: payload.certificateType ?? "",
		credentialId: payload.credentialId ?? "",
		issueDate: payload.issueDate ?? "",
		issuer: payload.issuer ?? "",
		status,
	};
}

export async function fetchCertificateVerification(token: string): Promise<CertificateVerification> {
	if (!TOKEN_RE.test(token)) return invalidVerification();
	try {
		return toVerification(await verifyByToken(token));
	} catch {
		// A malformed or unknown token is INVALID, not an outage.
		return invalidVerification();
	}
}

export async function fetchCertificateVerificationById(
	credentialId: string,
): Promise<CertificateVerification> {
	const value = credentialId.trim().toUpperCase();
	if (!CREDENTIAL_ID_RE.test(value)) return invalidVerification();
	try {
		return toVerification(await verifyByCredentialId(value));
	} catch {
		return invalidVerification();
	}
}

function renderCapabilityKey(): string {
	const key = process.env.CERTIFICATE_RENDER_CAPABILITY_KEY?.trim() || "";
	if (key.length < 32) {
		throw new Error("CERTIFICATE_RENDER_CAPABILITY_KEY is required for certificate resources");
	}
	return key;
}

/**
 * A synthetic request carrying the render capability.
 *
 * The service takes a `Request` because it is normally reached through a route;
 * calling it in-process still has to present the same second factor.
 */
function renderRequest(token: string): Request {
	return new Request(`http://internal/api/certificates/render/${encodeURIComponent(token)}/manifest`, {
		headers: { [RENDER_HEADER]: renderCapabilityKey() },
	});
}

export async function fetchCertificateRenderData(token: string): Promise<CertificateRenderData | null> {
	if (!TOKEN_RE.test(token)) return null;

	const request = renderRequest(token);

	let manifest: Awaited<ReturnType<typeof renderManifest>>;
	try {
		manifest = await renderManifest(request, token);
	} catch {
		return null;
	}

	const canvasWidth = Number(manifest.canvasWidth || 0);
	const canvasHeight = Number(manifest.canvasHeight || 0);
	if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
		throw new Error("Certificate render manifest has invalid canvas dimensions");
	}

	let base: Awaited<ReturnType<typeof renderBase>>;
	try {
		base = await renderBase(request, token);
	} catch {
		return null;
	}

	return {
		recipientName: manifest.recipientName,
		credentialId: manifest.credentialId,
		canvasWidth,
		canvasHeight,
		layout: manifest.layout as unknown as CertificateTemplateLayout,
		renderBase: base.body,
	};
}
