import { getPbClient } from "@/lib/pb-client";
import { checkInWorkspaceTicket } from "@/lib/data/workspace.client";
import {
  runAdminRegistrationCommand,
  type RegistrationAdminAction,
} from "@/lib/data/admin-event-operations.client";

export interface AdminRegistration {
  id: string;
  event: string;
  eventId: string;
  eventTitle: string;
  eventSocietyId: string;
  user: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  ticketId: string;
  registrationDate: string;
  createdAt: string;
  registrationSource: string;
  programmeCode: string;
  programme: string;
  semester: string;
  studyYear: number | null;
  ieeeMember: boolean;
  ieeeMemberId: string;
  formResponses: Record<string, unknown> | null;
  paymentStatus?: string;
  amount?: number;
  collectedAmount?: number;
  refundedAmount?: number;
  paymentMethod?: string;
  couponCode?: string;
  discountSource?: string;
  discountAmount?: number;
  paymentData?: Record<string, unknown> | null;
  paymentTicketId?: string;
  provider?: string;
  providerStatus?: string;
  manualReview?: boolean;
  reviewReason?: string;
  manualConfirmation?: Record<string, unknown> | null;
  internalNotes?: string;
  createdBy?: string;
}

export interface AdminRegistrationPage {
  registrations: AdminRegistration[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
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
  registeredFrom?: string;
  registeredTo?: string;
  /**
   * The API decides the projection from the authenticated user's event
   * assignments. This flag only controls whether finance-only filters are
   * sent; callers must set it from their already-known capability scope.
   */
  financeAuthorized?: boolean;
}

function registrationQuery(input: AdminRegistrationFilters): string {
  const query = new URLSearchParams({
    page: String(input.page),
    perPage: String(input.perPage),
  });
  if (input.eventId) query.set("event", input.eventId);
  if (input.status && input.status !== "all") query.set("status", input.status);
  if (input.source && input.source !== "all") query.set("source", input.source);
  if (input.search) query.set("search", input.search);
  if (input.registeredFrom) query.set("registeredFrom", input.registeredFrom);
  if (input.registeredTo) query.set("registeredTo", input.registeredTo);
  if (input.financeAuthorized) {
    if (input.paymentStatus && input.paymentStatus !== "all") {
      query.set("paymentStatus", input.paymentStatus);
    }
    if (input.attentionOnly) query.set("attention", "1");
  }
  return query.toString();
}

export async function listAdminRegistrations(
  input: AdminRegistrationFilters,
): Promise<AdminRegistrationPage> {
  return getPbClient().send(
    `/api/admin/registrations?${registrationQuery(input)}`,
    {},
  ) as Promise<AdminRegistrationPage>;
}

export async function getAdminRegistration(id: string): Promise<{ registration: AdminRegistration }> {
  return getPbClient().send(
    `/api/admin/registrations/${encodeURIComponent(id)}`,
    {},
  ) as Promise<{ registration: AdminRegistration }>;
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
