import { getPbClient } from "@/lib/pb-client";

export interface CertificateRegistryRow {
  certificateId: string;
  eventId: string;
  eventTitle: string;
  recipientName: string;
  recipientEmail: string;
  credentialId: string;
  certificateType: string;
  status: "active" | "revoked" | "superseded" | string;
  issuedAt: string;
  issuerName: string;
  batchId: string;
  deliveryStatus: string;
  attempts: number;
  sentAt: string;
  lastError: string;
  verificationUrl: string;
}

export interface CertificateRegistrySummary {
  total: number; active: number; revoked: number; superseded: number;
  emailReady: number; missingEmail: number; accepted: number; failed: number; notQueued: number;
}
export interface CertificateRegistryResponse {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  summary: CertificateRegistrySummary;
  events: Array<{ id: string; title: string }>;
  certificates: CertificateRegistryRow[];
}

export interface CertificateRegistryQuery {
  page?: number;
  perPage?: number;
  search?: string;
  event?: string;
  status?: string;
  type?: string;
  delivery?: string;
}

export async function listCertificateRegistry(query: CertificateRegistryQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value));
  });
  return getPbClient().send(`/api/app/certificates/registry?${params.toString()}`, {}) as Promise<CertificateRegistryResponse>;
}
export async function listAllCertificateRegistry(query: Omit<CertificateRegistryQuery, "page" | "perPage"> = {}) {
  const first = await listCertificateRegistry({ ...query, page: 1, perPage: 200 });
  const rows = [...first.certificates];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await listCertificateRegistry({ ...query, page, perPage: 200 });
    rows.push(...next.certificates);
  }
  return rows;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\t ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function certificateRegistryCsv(rows: CertificateRegistryRow[]) {
  const header = ["Recipient", "Email", "Credential ID", "Event", "Type", "Status", "Issued at", "Issuer", "Delivery", "Attempts", "Verification URL"];
  const body = rows.map((row) => [
    row.recipientName, row.recipientEmail, row.credentialId, row.eventTitle, row.certificateType,
    row.status, row.issuedAt, row.issuerName, row.deliveryStatus, row.attempts, row.verificationUrl,
  ]);
  return [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
