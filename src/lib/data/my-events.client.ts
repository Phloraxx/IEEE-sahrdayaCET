import { getPbClient } from "@/lib/pb-client";

export interface MyEventCertificate {
  credentialId: string;
  verificationToken: string;
  certificateType: string;
  issuedAt: string;
  status: string;
}

export interface MyEventAttendanceSession {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  present: boolean;
}

export interface MyEventAttendance {
  mode: "legacy" | "sessions";
  checkedIn: boolean;
  checkedInAt: string;
  attendedSessions: number;
  totalSessions: number;
  sessions: MyEventAttendanceSession[];
}
export interface MyEventCancellationRequest {
  id: string;
  kind: string;
  status: string;
  reason: string;
  requestedAt: string;
  decisionAt: string;
  resolutionNote: string;
  resolvedAt: string;
}

export interface MyEventCancellation {
  allowed: boolean;
  mode: "direct" | "refund_request" | "none";
  deadline: string;
  refundPolicy: string;
  request: MyEventCancellationRequest | null;
}

export interface MyEventWaitlistItem {
  event: { id: string; title: string; slug: string; date: string; venue: string; status: string; isArchived: boolean };
  entry: { id: string; status: string; position: number; joinedAt: string; offeredAt: string; offerExpiresAt: string };
}

export interface MyEventItem {
  event: {
    id: string;
    title: string;
    slug: string;
    date: string;
    endDate: string;
    timeTbc: boolean;
    venue: string;
    timezone: string;
    attendanceMode: "onsite" | "online" | "hybrid" | string;
    locationAddress: string;
    bannerUrl: string;
    status: string;
    isArchived: boolean;
    society: { id: string; name: string; slug: string } | null;
  };
  registration: {
    id: string;
    status: string;
    paymentStatus: string;
    amount: number;
    paymentRequired: boolean;
    manualReview: boolean;
    reviewReason: string;
    ticketId: string;
    receiptAvailable: boolean;
    registeredAt: string;
  };
  ended: boolean;
  privateAccess: { virtualJoinUrl: string; joinInstructions: string } | null;
  cancellation: MyEventCancellation;
  attendance: MyEventAttendance;
  certificates: MyEventCertificate[];
}

export interface MyEventsResponse {
  items: MyEventItem[];
  waitlist: MyEventWaitlistItem[];
  summary: {
    total: number;
    actionNeeded: number;
    upcoming: number;
    past: number;
    waitlisted: number;
    offered: number;
  };
}

export async function listMyEvents(): Promise<MyEventsResponse> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to view your events");
  return pb.send("/api/app/my-events", {}) as Promise<MyEventsResponse>;
}

export async function cancelMyRegistration(registrationId: string, reason = "") {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to manage your registration");
  return pb.send(`/api/app/registrations/${encodeURIComponent(registrationId)}/cancel`, {
    method: "POST",
    body: { reason },
  }) as Promise<{ action: "cancelled" | "refund_requested"; request?: MyEventCancellationRequest }>;
}
