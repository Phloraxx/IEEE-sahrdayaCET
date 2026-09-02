import { getPBUrl } from "@/lib/pb.server";
import type { CertificateTemplateLayout } from "@/server/certificates/render.server";

const TOKEN_RE = /^[A-Za-z0-9]{48}$/;
const CREDENTIAL_ID_RE = /^IEEESB-\d{4}-[A-Z]{3,5}-[A-Z0-9]{10}$/;
const RENDER_HEADER = "X-Certificate-Render-Capability";

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

function validToken(token: string) {
  return TOKEN_RE.test(token);
}

function invalidVerification(): CertificateVerification {
  return { status: "INVALID" };
}

function statusValue(value: unknown): CertificateVerificationStatus {
  return value === "ACTIVE" || value === "REVOKED" || value === "SUPERSEDED" ? value : "INVALID";
}

export async function fetchCertificateVerification(token: string): Promise<CertificateVerification> {
  if (!validToken(token)) return invalidVerification();
  let response: Response;
  try {
    response = await fetch(`${getPBUrl()}/api/app/certificates/verify/${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error("Certificate verification service is unavailable", { cause: error });
  }
  if (response.status === 404) return invalidVerification();
  if (!response.ok) throw new Error(`Certificate verification failed with HTTP ${response.status}`);

  const raw = await response.json() as Record<string, unknown>;
  const status = statusValue(raw.status);
  if (status === "INVALID") return invalidVerification();
  return {
    recipientName: String(raw.recipientName || ""),
    event: String(raw.event || ""),
    certificateType: String(raw.certificateType || ""),
    credentialId: String(raw.credentialId || ""),
    issueDate: String(raw.issueDate || ""),
    issuer: String(raw.issuer || ""),
    status,
  };
}

export async function fetchCertificateVerificationById(credentialId: string): Promise<CertificateVerification> {
  const value = credentialId.trim().toUpperCase();
  if (!CREDENTIAL_ID_RE.test(value)) return invalidVerification();
  let response: Response;
  try {
    response = await fetch(`${getPBUrl()}/api/app/certificates/verify-id/${encodeURIComponent(value)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error("Certificate verification service is unavailable", { cause: error });
  }
  if (response.status === 404) return invalidVerification();
  if (!response.ok) throw new Error(`Certificate verification failed with HTTP ${response.status}`);
  const raw = await response.json() as Record<string, unknown>;
  const status = statusValue(raw.status);
  if (status === "INVALID") return invalidVerification();
  return {
    recipientName: String(raw.recipientName || ""), event: String(raw.event || ""),
    certificateType: String(raw.certificateType || ""), credentialId: String(raw.credentialId || ""),
    issueDate: String(raw.issueDate || ""), issuer: String(raw.issuer || ""), status,
  };
}

function renderCapabilityKey() {
  const key = process.env.CERTIFICATE_RENDER_CAPABILITY_KEY?.trim() || "";
  if (key.length < 32) throw new Error("CERTIFICATE_RENDER_CAPABILITY_KEY is required for certificate resources");
  return key;
}

async function renderFetch(token: string, suffix: string) {
  if (!validToken(token)) return null;
  let response: Response;
  try {
    response = await fetch(`${getPBUrl()}/api/app/certificates/render/${encodeURIComponent(token)}/${suffix}`, {
      headers: { [RENDER_HEADER]: renderCapabilityKey() },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error("Certificate rendering service is unavailable", { cause: error });
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Certificate render input failed with HTTP ${response.status}`);
  return response;
}

export async function fetchCertificateRenderData(token: string): Promise<CertificateRenderData | null> {
  const manifestResponse = await renderFetch(token, "manifest");
  if (!manifestResponse) return null;
  const manifest = await manifestResponse.json() as Record<string, unknown>;
  const renderBaseResponse = await renderFetch(token, "render-base");
  if (!renderBaseResponse) return null;

  const canvasWidth = Number(manifest.canvasWidth || 0);
  const canvasHeight = Number(manifest.canvasHeight || 0);
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
    throw new Error("Certificate render manifest has invalid canvas dimensions");
  }

  return {
    recipientName: String(manifest.recipientName || ""),
    credentialId: String(manifest.credentialId || ""),
    canvasWidth,
    canvasHeight,
    layout: manifest.layout as CertificateTemplateLayout,
    renderBase: Buffer.from(await renderBaseResponse.arrayBuffer()),
  };
}
