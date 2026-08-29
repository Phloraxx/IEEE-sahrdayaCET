import { getPbClient } from "@/lib/pb-client";

export type CertificateAudienceType = "selected" | "checked_in" | "confirmed" | "attendance_qualified";

export interface CertificateCandidate {
  id: string;
  name: string;
  email: string;
  registrationStatus: string;
  checkedIn: boolean;
}

export interface CertificateAudienceRecipient {
  id: string;
  name: string;
  email: string;
  emailEligible: boolean;
  checkedIn: boolean;
  checkedInAt: string;
}

export interface CertificateAudienceExclusion {
  id: string;
  name: string;
  email: string;
  reason: "cancelled" | "missing_name" | "already_issued" | "not_found" | string;
}

export interface CertificateAudiencePreview {
  template: { id: string; name: string; version: number; certificateType: string; contentHash: string };
  audienceType: CertificateAudienceType;
  audienceConfig: { registrationIds?: string[] };
  audienceFingerprint: string;
  recipientCount: number;
  emailEligibleCount: number;
  missingEmailCount: number;
  recipients: CertificateAudienceRecipient[];
  excluded: CertificateAudienceExclusion[];
}

export interface CertificateBatchResult {
  id: string;
  eventId: string;
  templateId: string;
  audienceType: CertificateAudienceType;
  audienceFingerprint: string;
  status: string;
  recipientCount: number;
  issuedCount: number;
  emailEligibleCount: number;
  missingEmailCount: number;
  issuedAt: string;
  note: string;
}

export interface CertificateSummary {
  id: string;
  registrationId: string;
  recipientName: string;
  recipientEmail: string;
  credentialId: string;
  status: string;
}

export interface CertificateIssueResult {
  idempotent: boolean;
  batch: CertificateBatchResult;
  certificates: CertificateSummary[];
}

export async function listCertificateCandidates(eventId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificates/candidates`,
    {},
  ) as Promise<{ candidates: CertificateCandidate[] }>;
}

export async function previewCertificateAudience(
  eventId: string,
  input: { templateId: string; audienceType: CertificateAudienceType; audienceConfig?: { registrationIds?: string[] } },
) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificates/audience/preview`,
    { method: "POST", body: input },
  ) as Promise<CertificateAudiencePreview>;
}

export async function issueCertificates(
  eventId: string,
  input: {
    templateId: string;
    audienceType: CertificateAudienceType;
    audienceConfig?: { registrationIds?: string[] };
    audienceFingerprint: string;
    note?: string;
  },
) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificates/issue`,
    { method: "POST", body: input },
  ) as Promise<CertificateIssueResult>;
}
