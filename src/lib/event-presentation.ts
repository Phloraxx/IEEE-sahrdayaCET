export type EventLifecycle = "scheduled" | "completed" | "cancelled";
export type EventAttendanceKind = "offline" | "online" | "hybrid";
export type EventAttendanceMode = "onsite" | "online" | "hybrid";

export interface EventAttendanceInput {
  attendanceMode?: string | null;
  venue?: string | null;
}

const ONLINE_VENUE_PATTERN =
  /\b(online|virtual|google meet|zoom|microsoft teams|webex|meet\.google\.com)\b/i;
const HYBRID_VENUE_PATTERN = /\b(hybrid|mixed mode|online and offline)\b/i;

export function getEventLifecycle(status: string): EventLifecycle {
  const normalized = status.trim().toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  return "scheduled";
}

export function getSchemaEventStatus(status: string): string {
  const lifecycle = getEventLifecycle(status);
  if (lifecycle === "completed") return "https://schema.org/EventCompleted";
  if (lifecycle === "cancelled") return "https://schema.org/EventCancelled";
  return "https://schema.org/EventScheduled";
}

export function getEventAttendanceMode(input: string | EventAttendanceInput): EventAttendanceMode {
  const explicit = typeof input === "string" ? "" : String(input.attendanceMode || "").trim().toLowerCase();
  if (explicit === "onsite" || explicit === "online" || explicit === "hybrid") return explicit;

  const venue = typeof input === "string" ? input.trim() : String(input.venue || "").trim();
  if (HYBRID_VENUE_PATTERN.test(venue)) return "hybrid";
  if (ONLINE_VENUE_PATTERN.test(venue)) return "online";
  return "onsite";
}

export function getEventAttendanceKind(input: string | EventAttendanceInput): EventAttendanceKind {
  const mode = getEventAttendanceMode(input);
  return mode === "onsite" ? "offline" : mode;
}

export function getSchemaAttendanceMode(input: string | EventAttendanceInput): string {
  const mode = getEventAttendanceMode(input);
  if (mode === "online") {
    return "https://schema.org/OnlineEventAttendanceMode";
  }
  if (mode === "hybrid") {
    return "https://schema.org/MixedEventAttendanceMode";
  }
  return "https://schema.org/OfflineEventAttendanceMode";
}
