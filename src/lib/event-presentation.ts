export type EventLifecycle = "scheduled" | "completed" | "cancelled";
export type EventAttendanceKind = "offline" | "online" | "hybrid";

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

export function getEventAttendanceKind(venue: string): EventAttendanceKind {
  const normalized = venue.trim();
  if (HYBRID_VENUE_PATTERN.test(normalized)) return "hybrid";
  if (ONLINE_VENUE_PATTERN.test(normalized)) return "online";
  return "offline";
}

export function getSchemaAttendanceMode(venue: string): string {
  const kind = getEventAttendanceKind(venue);
  if (kind === "online") {
    return "https://schema.org/OnlineEventAttendanceMode";
  }
  if (kind === "hybrid") {
    return "https://schema.org/MixedEventAttendanceMode";
  }
  return "https://schema.org/OfflineEventAttendanceMode";
}
