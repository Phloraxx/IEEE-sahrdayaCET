import { getPbClient } from "@/lib/pb-client";

export interface RegistrationPaymentSession {
  registrationId: string;
  registrationStatus: string;
  paymentStatus: string;
  amount: number;
  ticketId: string;
  paymentTicketId: string;
  provider: string;
  providerStatus: string;
  paymentId: string;
  requestedAmountPaise: number;
  payableAmountPaise: number;
  payableAmount: string;
  createdAt: string;
  expiresAt: string;
  paidAt: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayKeyId: string;
  providerDisplayName: string;
  manualReview: boolean;
  reviewReason: string;
  providerReachable: boolean;
  attendeeEmail: string;
  attendeePhone: string;
  event: {
    id: string;
    title: string;
    date: string;
    endDate: string;
    venue: string;
    bannerUrl: string;
  } | null;
}

function normalizePaymentSession(value: unknown): RegistrationPaymentSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payment service returned an invalid response");
  }
  const raw = value as Record<string, unknown>;
  return {
    registrationId: String(raw.registrationId || ""),
    registrationStatus: String(raw.registrationStatus || ""),
    paymentStatus: String(raw.paymentStatus || ""),
    amount: Number(raw.amount) || 0,
    ticketId: String(raw.ticketId || ""),
    paymentTicketId: String(raw.paymentTicketId || ""),
    provider: String(raw.provider || ""),
    providerStatus: String(raw.providerStatus || "not_initialized"),
    paymentId: String(raw.paymentId || ""),
    requestedAmountPaise: Number(raw.requestedAmountPaise) || 0,
    payableAmountPaise: Number(raw.payableAmountPaise) || 0,
    payableAmount: String(raw.payableAmount || ""),
    createdAt: String(raw.createdAt || ""),
    expiresAt: String(raw.expiresAt || ""),
    paidAt: String(raw.paidAt || ""),
    razorpayOrderId: String(raw.razorpayOrderId || ""),
    razorpayPaymentId: String(raw.razorpayPaymentId || ""),
    razorpayKeyId: String(raw.razorpayKeyId || ""),
    providerDisplayName: String(raw.providerDisplayName || ""),
    manualReview: raw.manualReview === true,
    reviewReason: String(raw.reviewReason || ""),
    providerReachable: raw.providerReachable !== false,
    attendeeEmail: String(raw.attendeeEmail || ""),
    attendeePhone: String(raw.attendeePhone || ""),
    event: raw.event && typeof raw.event === "object" && !Array.isArray(raw.event)
      ? {
          id: String((raw.event as Record<string, unknown>).id || ""),
          title: String((raw.event as Record<string, unknown>).title || ""),
          date: String((raw.event as Record<string, unknown>).date || ""),
          endDate: String((raw.event as Record<string, unknown>).endDate || ""),
          venue: String((raw.event as Record<string, unknown>).venue || ""),
          bannerUrl: String((raw.event as Record<string, unknown>).bannerUrl || ""),
        }
      : null,
  };
}

export async function createOrResumePayment(
  registrationId: string,
): Promise<RegistrationPaymentSession> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to continue payment");
  const response = await pb.send(
    `/api/app/registrations/${encodeURIComponent(registrationId)}/payment`,
    { method: "POST" },
  );
  return normalizePaymentSession(response);
}

export async function getPaymentSession(
  registrationId: string,
): Promise<RegistrationPaymentSession> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to view this payment");
  const response = await pb.send(
    `/api/app/registrations/${encodeURIComponent(registrationId)}/payment`,
    { method: "GET" },
  );
  return normalizePaymentSession(response);
}

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function verifyRazorpayPayment(
  registrationId: string,
  checkout: RazorpayCheckoutResponse,
): Promise<RegistrationPaymentSession> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to verify this payment");
  const response = await pb.send(
    `/api/app/registrations/${encodeURIComponent(registrationId)}/payment/razorpay-verify`,
    { method: "POST", body: checkout },
  );
  return normalizePaymentSession(response);
}
