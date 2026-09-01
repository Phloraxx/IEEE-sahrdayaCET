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
  attendance: MyEventAttendance;
  certificates: MyEventCertificate[];
}

export interface MyEventsResponse {
  items: MyEventItem[];
  summary: {
    total: number;
    actionNeeded: number;
    upcoming: number;
    past: number;
  };
}

export async function listMyEvents(): Promise<MyEventsResponse> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to view your events");
  return pb.send("/api/app/my-events", {}) as Promise<MyEventsResponse>;
}
