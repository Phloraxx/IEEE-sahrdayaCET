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
  certificateStatus: "active" | "revoked" | "superseded" | string;
  deliveryStatus: "not_queued" | "missing_email" | "not_active" | "pending" | "sending" | "sent" | "failed" | string;
  attempts: number;
  sentAt: string;
  lastError: string;
  verificationUrl: string;
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
