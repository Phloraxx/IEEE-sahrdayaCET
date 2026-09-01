import { getPbClient } from "@/lib/pb-client";

export interface AttendanceSession {
  id: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  sortOrder: number;
  attendanceEnabled: boolean;
  checkInEnabled: boolean;
  requiredForCertificate: boolean;
  attendanceWeight: number;
  presentCount: number;
}

export interface AttendanceSessionsResponse {
  mode: "legacy" | "sessions";
  sessions: AttendanceSession[];
}

export interface AttendanceSessionInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  venue?: string;
  sortOrder?: number;
  attendanceEnabled?: boolean;
  checkInEnabled?: boolean;
  requiredForCertificate?: boolean;
  attendanceWeight?: number;
}

export interface AttendanceContextEvent {
  id: string;
  title: string;
  date: string;
  endDate: string;
  venue: string;
  status: string;
  checkInEnabled: boolean;
  checkedInCount: number;
  mode: "legacy" | "sessions";
  sessions: AttendanceSession[];
}

export interface AttendanceRecentRow {
  id: string;
  registrationId: string;
  userName: string;
  ticketId: string;
  type: "present" | "entry" | "exit" | "manual_add" | "manual_remove" | string;
  occurredAt: string;
  source: string;
  present: boolean;
  isLatestForRegistration: boolean;
}

export interface AttendanceCheckInResponse {
  success: boolean;
  replayed: boolean;
  message: string;
  registration: {
    id: string;
    userName: string;
    ticketId: string;
    eventId: string;
    eventTitle: string;
    sessionId: string;
    sessionTitle: string;
    occurredAt: string;
  };
  presentCount: number;
}

export interface AttendanceRequestError {
  code: string;
  message: string;
}

export function attendanceRequestError(error: unknown): AttendanceRequestError {
  if (error && typeof error === "object") {
    const response = (error as { response?: { code?: unknown; error?: unknown; message?: unknown } }).response;
    const code = typeof response?.code === "string" ? response.code : "";
    const message = typeof response?.error === "string"
      ? response.error
      : typeof response?.message === "string"
        ? response.message
        : "";
    if (code || message) return { code, message: message || "Attendance request failed" };
  }
  return {
    code: "",
    message: error instanceof Error && error.message ? error.message : "Attendance request failed",
  };
}

export async function listEventAttendanceSessions(eventId: string) {
  return getPbClient().send(`/api/app/events/${encodeURIComponent(eventId)}/attendance/sessions`, {}) as Promise<AttendanceSessionsResponse>;
}

export async function createAttendanceSession(eventId: string, input: AttendanceSessionInput) {
  return getPbClient().send(`/api/app/events/${encodeURIComponent(eventId)}/attendance/sessions`, {
    method: "POST",
    body: input,
  }) as Promise<{ session: AttendanceSession }>;
}

export async function updateAttendanceSession(sessionId: string, input: Partial<AttendanceSessionInput>) {
  return getPbClient().send(`/api/app/event-sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    body: input,
  }) as Promise<{ session: AttendanceSession }>;
}

export async function deleteAttendanceSession(sessionId: string) {
  return getPbClient().send(`/api/app/event-sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  }) as Promise<{ deleted: boolean }>;
}

export async function getAttendanceContext() {
  return getPbClient().send("/api/workspace/attendance/context", {}) as Promise<{ events: AttendanceContextEvent[] }>;
}

export async function getAttendanceSessionState(sessionId: string) {
  return getPbClient().send(`/api/workspace/attendance/sessions/${encodeURIComponent(sessionId)}/state`, {}) as Promise<{
    session: AttendanceSession;
    recent: AttendanceRecentRow[];
  }>;
}

export async function recordSessionAttendance(input: {
  ticketId: string;
  eventId: string;
  sessionId: string;
  idempotencyKey: string;
  deviceId?: string;
}) {
  return getPbClient().send("/api/workspace/attendance/check-in", {
    method: "POST",
    body: input,
  }) as Promise<AttendanceCheckInResponse>;
}

export async function correctSessionAttendance(input: {
  registrationId: string;
  sessionId: string;
  action: "manual_add" | "manual_remove";
  note: string;
  deviceId?: string;
}) {
  return getPbClient().send("/api/workspace/attendance/correct", {
    method: "POST",
    body: input,
  }) as Promise<{
    corrected: boolean;
    recordId: string;
    present: boolean;
    occurredAt: string;
    presentCount: number;
  }>;
}
