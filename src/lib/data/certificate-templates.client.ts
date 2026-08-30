import { getPbClient } from "@/lib/pb-client";

export type CertificateTemplateStatus = "draft" | "published" | "archived";
export type CertificateType =
  | "participation"
  | "completion"
  | "achievement"
  | "appreciation"
  | "volunteer"
  | "speaker";

export interface CertificateTemplateLayout {
  name: {
    x: number;
    y: number;
    maxWidth: number;
    preferredFontSize: number;
    minFontSize: number;
    align: "left" | "center" | "right";
    color: string;
    fontFamily: "noto-sans" | "noto-serif";
  };
  credentialId: {
    x: number;
    y: number;
    fontSize: number;
    align: "left" | "center" | "right";
    color: string;
  };
  qr: {
    enabled?: boolean;
    x: number;
    y: number;
    size: number;
  };
}

export interface CertificateTemplateAsset {
  name: string;
  url: string;
}

export interface CertificatePreflightWarning {
  code: "auto_fit" | "likely_overflow" | "font_coverage_review" | string;
  severity: "medium" | "high" | string;
  name: string;
  message: string;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  scopeType: "event" | "society" | "branch";
  societyId: string;
  eventId: string;
  certificateType: CertificateType;
  version: number;
  status: CertificateTemplateStatus;
  canvasWidth: number;
  canvasHeight: number;
  layout: CertificateTemplateLayout;
  emailSubject: string;
  emailText: string;
  contentHash: string;
  publishedAt: string;
  created: string;
  updated: string;
  preflightWarnings: CertificatePreflightWarning[];
  files: {
    renderBase: CertificateTemplateAsset | null;
  };
}

export interface CertificateTemplateDraftInput {
  layout: CertificateTemplateLayout;
  emailSubject: string;
  emailText: string;
  renderBase?: File | null;
  removeRenderBase?: boolean;
}

export async function listCertificateTemplates(eventId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-templates`,
    {},
  ) as Promise<{ templates: CertificateTemplate[] }>;
}

export async function createCertificateTemplate(
  eventId: string,
  input: { name: string; certificateType: CertificateType },
) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-templates`,
    { method: "POST", body: input },
  ) as Promise<{ template: CertificateTemplate }>;
}

export async function updateCertificateTemplate(
  templateId: string,
  input: CertificateTemplateDraftInput,
) {
  const body = new FormData();
  body.set("layout", JSON.stringify(input.layout));
  body.set("emailSubject", input.emailSubject);
  body.set("emailText", input.emailText);
  if (input.renderBase) body.set("renderBase", input.renderBase);
  if (input.removeRenderBase) body.set("removeRenderBase", "true");
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}`,
    { method: "PATCH", body },
  ) as Promise<{ template: CertificateTemplate }>;
}
export async function publishCertificateTemplate(templateId: string) {
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}/publish`,
    { method: "POST" },
  ) as Promise<{ template: CertificateTemplate }>;
}

export async function sendCertificateTemplateTestEmail(templateId: string) {
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}/test-email`,
    { method: "POST" },
  ) as Promise<{ success: boolean; recipient: string; deliveryMode: string; provider?: string }>;
}

export async function archiveCertificateTemplate(templateId: string) {
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}/archive`,
    { method: "POST" },
  ) as Promise<{ template: CertificateTemplate }>;
}

export async function createCertificateTemplateVersion(templateId: string) {
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}/new-version`,
    { method: "POST" },
  ) as Promise<{ template: CertificateTemplate }>;
}

export async function deleteCertificateTemplate(templateId: string) {
  return getPbClient().send(
    `/api/app/certificate-templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
  ) as Promise<{ success: boolean }>;
}
export async function fetchCertificateTemplateAsset(asset: CertificateTemplateAsset) {
  const pb = getPbClient();
  const headers: HeadersInit = {};
  if (pb.authStore.token) headers.Authorization = pb.authStore.token;
  const response = await fetch(asset.url, { headers });
  if (!response.ok) {
    throw new Error(`Could not load certificate artwork (${response.status})`);
  }
  return response.blob();
}
