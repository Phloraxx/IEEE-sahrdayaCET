import { getPbClient } from "@/lib/pb-client";

export interface AdminRegistrationOperationRow {
  id: string;
  event: string;
  eventTitle?: string;
  user: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  amount: number;
  collectedAmount: number;
  refundedAmount: number;
  paymentMethod: string;
  couponCode: string;
  discountAmount: number;
  ticketId: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  registrationDate: string;
  registrationSource: "self_service" | "admin" | string;
  internalNotes: string;
  provider: string;
  providerStatus: string;
  manualReview: boolean;
  reviewReason: string;
  manualConfirmation: Record<string, unknown> | null;
}

export interface EventFinanceSummary {
  totalRecords: number;
  active: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  checkedIn: number;
  paidCount: number;
  paidAmount: number;
  confirmedPaidAmount: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  failedCount: number;
  notRequiredCount: number;
  refundedCount: number;
  refundedAmount: number;
  manualPaidCount: number;
  manualPaidAmount: number;
  providerPaidCount: number;
  providerPaidAmount: number;
  cancelledPaidCount: number;
  cancelledPaidAmount: number;
  reviewCount: number;
  discountAmount: number;
  adminCreatedCount: number;
  selfServiceCount: number;
  providers: Record<string, { count: number; paidCount: number; amount: number }>;
}

export interface AdminEventOperations {
  event: {
    id: string;
    title: string;
    slug: string;
    date: string;
    endDate: string;
    venue: string;
    status: string;
    price: number;
    paymentProvider: "razorpay" | "kotak" | string;
    registrationOpen: boolean;
    registrationMode: "internal" | "external" | "closed" | string;
    collectIeeeMember: boolean;
    formTemplate: Array<{ id: string; name?: string; label: string; type?: string; required?: boolean; options?: string[] }>;
    checkInEnabled: boolean;
    maxCapacity: number;
    registeredCount: number;
    checkedInCount: number;
    society: string;
    approvalStatus: "draft" | "submitted" | "changes_requested" | "approved" | string;
    approvalNote: string;
    submittedBy: string;
    submittedAt: string;
    approvedBy: string;
    approvedAt: string;
    approvalRevision: number;
    financeApprovalStatus: "not_required" | "pending" | "changes_requested" | "approved" | string;
    financeApprovalNote: string;
    financeApprovedBy: string;
    financeApprovedAt: string;
  };
  summary: EventFinanceSummary;
  recent: AdminRegistrationOperationRow[];
  attention: AdminRegistrationOperationRow[];
  coupons: Array<{
    id: string;
    code: string;
    discountPercent: number;
    maxUses: number;
    usedCount: number;
    expiresAt: string;
    isActive: boolean;
  }>;
  audit: Array<{
    id: string;
    action: string;
    note: string;
    actor: string;
    registration: string;
    created: string;
  }>;
  permissions: Record<string, boolean>;
  financeDisclaimer: string;
}

export interface PaymentDeskSummary {
  paymentCount: number;
  grossCollectedAmount: number;
  refundedAmount: number;
  netCollectedAmount: number;
  razorpayCount: number;
  razorpayCollectedAmount: number;
  paygateCount: number;
  paygateCollectedAmount: number;
  manualCount: number;
  manualCollectedAmount: number;
  legacyCount: number;
  legacyCollectedAmount: number;
  attentionCount: number;
  queuedRefundCount: number;
  failedRefundCount: number;
}

export interface PaymentDeskResponse {
  summary: PaymentDeskSummary;
  financeDisclaimer: string;
}

export async function getAdminEventOperations(eventId: string) {
  return getPbClient().send(
    `/api/admin/events/${encodeURIComponent(eventId)}/operations`,
    {},
  ) as Promise<AdminEventOperations>;
}

export async function getAdminPaymentDesk() {
  return getPbClient().send(
    "/api/admin/payments/summary",
    {},
  ) as Promise<PaymentDeskResponse>;
}

export interface ManualRegistrationInput {
  name: string;
  email: string;
  phone?: string;
  userId?: string;
  couponCode?: string;
  paymentMode: "paid" | "pending" | "waived";
  paymentReference?: string;
  amountOverride?: number;
  capacityOverride?: boolean;
  note?: string;
  formResponses?: Record<string, unknown>;
}

export async function createManualRegistration(
  eventId: string,
  input: ManualRegistrationInput,
) {
  return getPbClient().send(
    `/api/admin/events/${encodeURIComponent(eventId)}/registrations/manual`,
    { method: "POST", body: input },
  ) as Promise<{ registration: AdminRegistrationOperationRow }>;
}

export type RegistrationAdminAction =
  | "check-in"
  | "undo-check-in"
  | "cancel"
  | "confirm-payment"
  | "restore"
  | "mark-refunded"
  | "reopen-manual-payment";

export async function runAdminRegistrationCommand(
  registrationId: string,
  input: {
    action: RegistrationAdminAction;
    note?: string;
    reference?: string;
    capacityOverride?: boolean;
  },
) {
  return getPbClient().send(
    `/api/admin/registrations/${encodeURIComponent(registrationId)}/command`,
    { method: "POST", body: input },
  ) as Promise<{ registration: AdminRegistrationOperationRow }>;
}

export async function recomputeEventOperations(eventId: string) {
  return getPbClient().send(
    `/api/admin/events/${encodeURIComponent(eventId)}/recompute`,
    { method: "POST" },
  ) as Promise<{ success: boolean; event: AdminEventOperations["event"] }>;
}
