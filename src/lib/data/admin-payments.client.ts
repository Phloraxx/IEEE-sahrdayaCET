import type { RecordModel } from "pocketbase";
import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";

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

function rupees(paise: unknown): number {
  const value = Number(paise);
  return Number.isFinite(value) && value > 0 ? value / 100 : 0;
}

export async function listAdminPayments(input: { page?: number; perPage?: number; search?: string; attentionOnly?: boolean } = {}) {
  const pb = getPbClient();
  const filters: string[] = [];
  if (input.search?.trim()) {
    const value = escapeFilterValue(input.search.trim());
    filters.push(`(providerOrderId ~ ${value} || capturedPaymentId ~ ${value} || registration.userName ~ ${value} || registration.userEmail ~ ${value} || registration.userPhone ~ ${value} || registration.ticketId ~ ${value} || event.title ~ ${value})`);
  }
  if (input.attentionOnly) filters.push(`(manualReview = true || status = 'partially_refunded')`);
  const result = await pb.collection("payments").getList(input.page ?? 1, Math.min(input.perPage ?? 40, 100), {
    filter: filters.join(" && ") || undefined,
    sort: "-created",
    expand: "registration,event",
  });
  return {
    payments: result.items.map((record) => {
      const registration = record.expand?.registration as RecordModel | undefined;
      const event = record.expand?.event as RecordModel | undefined;
      return {
        id: record.id,
        registrationId: String(record.registration || ""),
        eventId: String(record.event || ""),
        attendeeName: String(registration?.userName || ""),
        attendeeEmail: String(registration?.userEmail || ""),
        eventTitle: String(event?.title || ""),
        provider: String(record.provider || "unknown"),
        status: String(record.status || "unknown"),
        registrationStatus: String(registration?.registrationStatus || ""),
        paymentStatus: String(registration?.paymentStatus || ""),
        feeAmount: rupees(record.finalFeePaise),
        collectedAmount: rupees(record.collectedPaise),
        refundedAmount: rupees(record.refundedPaise),
        paymentMethod: String(record.paymentMethod || ""),
        providerOrderId: String(record.providerOrderId || ""),
        capturedPaymentId: String(record.capturedPaymentId || ""),
        manualReview: Boolean(record.manualReview),
        reviewReason: String(record.reviewReason || ""),
        createdAt: String(record.created || ""),
        capturedAt: String(record.capturedAt || ""),
      } satisfies AdminPaymentLedgerRow;
    }),
    total: result.totalItems,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.totalPages > result.page,
  };
}
