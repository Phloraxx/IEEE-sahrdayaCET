import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { getField } from "@/lib/safe-get";
import { checkInWorkspaceTicket } from "@/lib/data/workspace.client";
import {
  runAdminRegistrationCommand,
  type RegistrationAdminAction,
} from "@/lib/data/admin-event-operations.client";

function asPaymentData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerLabel(paymentData: Record<string, unknown>, paymentStatus: string) {
  if (paymentData.manualConfirmation || paymentData.provider === "manual") return "manual";
  if (paymentData.provider === "razorpay" || paymentData.provider === "razorpay_live") return "razorpay";
  if (paymentData.provider === "paygate") {
    return String(paymentData.eventPaymentProvider || paymentData.paymentAccount || "paygate");
  }
  return paymentStatus === "not_required" ? "not_required" : "unknown";
}

function mapRegistration(record: Record<string, unknown> & { id: string; expand?: Record<string, unknown> }) {
  const event = record.expand?.event as Record<string, unknown> | undefined;
  const paymentStatus = String(getField(record, "paymentStatus", ""));
  const paymentData = asPaymentData(getField(record, "paymentData", null));
  const registrationStatus = String(getField(record, "registrationStatus", ""));
  const nominalAmount = Number(getField(record, "amount", 0)) || 0;
  const payablePaise = Number(paymentData.payableAmountPaise);
  const payableAmount = Number(paymentData.payableAmount);
  const collectedAmount = Number.isFinite(payablePaise) && payablePaise >= 0
    ? payablePaise / 100
    : Number.isFinite(payableAmount) && payableAmount >= 0 ? payableAmount : nominalAmount;
  const refundedPaise = Number(paymentData.amountRefundedPaise);
  const refundedAmount = Number.isFinite(refundedPaise) && refundedPaise >= 0
    ? refundedPaise / 100
    : paymentStatus === "refunded" ? collectedAmount : 0;
  return {
    id: record.id,
    event: String(getField(record, "event", "")),
    user: String(getField(record, "user", "")),
    userName: getField(record, "userName", ""),
    userEmail: getField(record, "userEmail", ""),
    userPhone: getField(record, "userPhone", ""),
    registrationStatus,
    paymentStatus,
    checkedIn: Boolean(getField(record, "checkedIn", false)),
    checkedInAt: getField<string | null>(record, "checkedInAt", null),
    ticketId: getField(record, "ticketId", ""),
    paymentTicketId: getField(record, "paymentTicketId", ""),
    amount: nominalAmount,
    collectedAmount,
    refundedAmount,
    paymentMethod: String(paymentData.paymentMethod || ""),
    couponCode: getField(record, "couponCode", ""),
    discountAmount: Number(getField(record, "discountAmount", 0)) || 0,
    paymentData,
    provider: providerLabel(paymentData, paymentStatus),
    providerStatus: String(paymentData.providerStatus || ""),
    manualReview: paymentData.manualReview === true ||
      (registrationStatus === "cancelled" && paymentStatus === "paid"),
    reviewReason: String(paymentData.reviewReason || ""),
    manualConfirmation:
      paymentData.manualConfirmation && typeof paymentData.manualConfirmation === "object"
        ? paymentData.manualConfirmation as Record<string, unknown>
        : null,
    formResponses: getField(record, "formResponses", null),
    registrationSource: getField(record, "registrationSource", "self_service"),
    internalNotes: getField(record, "internalNotes", ""),
    createdBy: getField(record, "createdBy", ""),
    registrationDate: String(getField(record, "registrationDate", "") || getField(record, "created", "")),
    createdAt:
      getField(record, "registrationDate", "") ||
      getField(record, "created", ""),
    eventTitle: getField(event, "title", ""),
    eventId: getField(event, "id", getField(record, "event", "")),
    eventSocietyId: getField(event, "society", ""),
  };
}

export interface AdminRegistrationFilters {
  page: number;
  perPage: number;
  eventId?: string;
  status?: string;
  paymentStatus?: string;
  source?: string;
  search?: string;
  attentionOnly?: boolean;
}

export async function listAdminRegistrations(input: AdminRegistrationFilters) {
  const filters: string[] = [];
  if (input.eventId) filters.push(`event = ${escapeFilterValue(input.eventId)}`);
  if (input.status && input.status !== "all") {
    filters.push(`registrationStatus = ${escapeFilterValue(input.status)}`);
  }
  if (input.paymentStatus && input.paymentStatus !== "all") {
    filters.push(`paymentStatus = ${escapeFilterValue(input.paymentStatus)}`);
  }
  if (input.source && input.source !== "all") {
    filters.push(`registrationSource = ${escapeFilterValue(input.source)}`);
  }
  if (input.attentionOnly) {
    const staleCutoff = escapeFilterValue(new Date(Date.now() - 10 * 60_000).toISOString());
    filters.push(
      `((registrationStatus = "cancelled" && paymentStatus = "paid") || (registrationStatus = "pending" && paymentStatus = "pending" && registrationDate < ${staleCutoff}))`,
    );
  }
  if (input.search) {
    const search = escapeFilterValue(input.search);
    filters.push(
      `(userName ~ ${search} || userEmail ~ ${search} || userPhone ~ ${search} || ticketId ~ ${search})`,
    );
  }
  const result = await getPbClient().collection("registrations").getList(input.page, input.perPage, {
    filter: filters.join(" && ") || undefined,
    sort: "-registrationDate",
    expand: "event",
  });
  return {
    registrations: result.items.map((record) => mapRegistration(record as never)),
    total: result.totalItems,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.totalPages > result.page,
  };
}

export async function getAdminRegistration(id: string) {
  const record = await getPbClient().collection("registrations").getOne(id, { expand: "event" });
  return { registration: mapRegistration(record as never) };
}

export async function runRegistrationAdminCommand(
  id: string,
  command: "check-in" | "cancel" | "undo-check-in",
) {
  return runAdminRegistrationCommand(id, { action: command });
}
export async function confirmRegistrationPayment(id: string) {
  return runAdminRegistrationCommand(id, { action: "confirm-payment" });
}

export async function checkInByTicket(ticketId: string, eventId = "") {
  return checkInWorkspaceTicket(ticketId.trim(), eventId);
}

export interface RegistrationNotificationState {
  ticketAvailable: boolean;
  receiptAvailable: boolean;
  notifications: {
    ticket: { status: string; attempts: number; sentAt: string; lastError: string } | null;
    receipt: { status: string; attempts: number; sentAt: string; lastError: string } | null;
  };
}

export async function getRegistrationNotificationState(id: string): Promise<RegistrationNotificationState> {
  const pb = getPbClient();
  return pb.send(`/api/admin/registrations/${encodeURIComponent(id)}/notifications`, {}) as Promise<RegistrationNotificationState>;
}

export async function resendRegistrationNotification(id: string, kind: "ticket" | "receipt") {
  const pb = getPbClient();
  return pb.send(
    `/api/admin/registrations/${encodeURIComponent(id)}/notifications/${kind}/resend`,
    { method: "POST" },
  ) as Promise<{ success: boolean; status: string }>;
}

export type { RegistrationAdminAction };
