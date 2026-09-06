import { getPbClient } from "@/lib/pb-client";

export interface AdminPaymentLedgerRow {
  id: string;
  registrationId: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  provider: string;
  status: string;
  registrationStatus: string;
  paymentStatus: string;
  feeAmount: number;
  collectedAmount: number;
  refundedAmount: number;
  paymentMethod: string;
  providerOrderId: string;
  capturedPaymentId: string;
  manualReview: boolean;
  reviewReason: string;
  createdAt: string;
  capturedAt: string;
}

export interface AdminPaymentLedgerPage {
  payments: AdminPaymentLedgerRow[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export async function listAdminPayments(input: { page?: number; perPage?: number; search?: string; attentionOnly?: boolean } = {}) {
  const params = new URLSearchParams({
    page: String(input.page ?? 1),
    perPage: String(Math.min(input.perPage ?? 40, 100)),
  });
  if (input.search?.trim()) params.set("search", input.search.trim());
  if (input.attentionOnly) params.set("attention", "1");
  return getPbClient().send(
    `/api/admin/payments?${params.toString()}`,
    {},
  ) as Promise<AdminPaymentLedgerPage>;
}
