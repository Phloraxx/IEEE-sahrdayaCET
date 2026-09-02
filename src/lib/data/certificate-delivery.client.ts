import { getPbClient } from "@/lib/pb-client";

export interface CertificateDeliveryBatch {
  id: string;
  eventId: string;
  templateId: string;
  audienceType: string;
  status: "issued" | "sending" | "sent" | "partial_failure" | string;
  recipientCount: number;
  issuedCount: number;
  emailEligibleCount: number;
  missingEmailCount: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  issuedAt: string;
  sendStartedAt: string;
  completedAt: string;
  note: string;
}

export interface CertificateDeliveryRow {
  certificateId: string;
  recipientName: string;
  recipientEmail: string;
  credentialId: string;
  certificateType: string;
  templateId: string;
  certificateStatus: "active" | "revoked" | "superseded" | string;
  revokedAt: string;
  revocationReason: string;
  supersedesId: string;
  supersededById: string;
  deliveryStatus: "not_queued" | "missing_email" | "not_active" | "pending" | "sending" | "sent" | "failed" | string;
  attempts: number;
  sentAt: string;
  lastError: string;
  verificationUrl: string;
}

export interface CertificateMailReadiness {
  provider: "smtp";
  deliveryMode: "disabled" | "allowlist" | "redirect" | "live" | string;
  safetyReady: boolean;
  transportReady: boolean;
  trackingReady: boolean;
  trackingMode: "accepted_only";
  readyToQueue: boolean;
  reason: string;
  message: string;
}

export async function getCertificateMailReadiness(eventId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-mail/readiness`,
    {},
  ) as Promise<CertificateMailReadiness>;
}

export interface CertificateDeliverySnapshot {
  batch: CertificateDeliveryBatch;
  certificates: CertificateDeliveryRow[];
}

export async function listCertificateBatches(eventId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-batches`,
    {},
  ) as Promise<{ batches: CertificateDeliveryBatch[] }>;
}

export async function getCertificateDelivery(eventId: string, batchId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-batches/${encodeURIComponent(batchId)}/delivery`,
    {},
  ) as Promise<CertificateDeliverySnapshot>;
}

export async function sendCertificateBatch(eventId: string, batchId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-batches/${encodeURIComponent(batchId)}/send`,
    { method: "POST" },
  ) as Promise<{ idempotent: boolean; queuedNow: number; delivery: CertificateDeliverySnapshot }>;
}

export async function retryFailedCertificateBatch(eventId: string, batchId: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificate-batches/${encodeURIComponent(batchId)}/retry-failed`,
    { method: "POST" },
  ) as Promise<{ retried: number; delivery: CertificateDeliverySnapshot }>;
}

export interface CertificateLifecycleCredential {
  certificateId: string;
  eventId: string;
  registrationId: string;
  batchId: string;
  templateId: string;
  certificateType: string;
  recipientName: string;
  recipientEmail: string;
  credentialId: string;
  status: "active" | "revoked" | "superseded" | string;
  issuedAt: string;
  revokedAt: string;
  revocationReason: string;
  supersedesId: string;
  supersededById: string;
  metadataVersion: number;
  verificationUrl: string;
}

export async function revokeCertificate(eventId: string, certificateId: string, reason: string) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificates/${encodeURIComponent(certificateId)}/revoke`,
    { method: "POST", body: { reason } },
  ) as Promise<{ idempotent: boolean; certificate: CertificateLifecycleCredential }>;
}

export async function supersedeCertificate(
  eventId: string,
  certificateId: string,
  input: { reason: string; recipientName: string; recipientEmail: string; templateId?: string },
) {
  return getPbClient().send(
    `/api/app/events/${encodeURIComponent(eventId)}/certificates/${encodeURIComponent(certificateId)}/supersede`,
    { method: "POST", body: input },
  ) as Promise<{
    idempotent: boolean;
    superseded: CertificateLifecycleCredential;
    replacement: CertificateLifecycleCredential;
    replacementBatchId: string;
  }>;
}
