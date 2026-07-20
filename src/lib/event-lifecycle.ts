export interface EventLifecycleInput {
  status?: string | null;
  date?: string | null;
  endDate?: string | null;
  registrationOpen?: boolean | null;
  registrationStart?: string | null;
  registrationDeadline?: string | null;
  isDeleted?: boolean | null;
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Uses endDate when available, otherwise falls back to the event start date.
 * An event is considered past once its effective end time has elapsed.
 */
export function getEventEndTimestamp(event: EventLifecycleInput): number | null {
  return toTimestamp(event.endDate) ?? toTimestamp(event.date);
}

export function isPublicEvent(event: EventLifecycleInput): boolean {
  if (event.isDeleted) return false;
  return event.status === "published" || event.status === "completed";
}

export function isPastEvent(
  event: EventLifecycleInput,
  now: number = Date.now(),
): boolean {
  if (event.status === "completed") return true;
  const end = getEventEndTimestamp(event);
  return end !== null && end <= now;
}

/**
 * Registration is allowed only for a currently published, non-past event
 * whose registration window is open.
 */
export function canRegisterForEvent(
  event: EventLifecycleInput,
  now: number = Date.now(),
): boolean {
  if (!isPublicEvent(event)) return false;
  if (event.status !== "published") return false;
  if (!event.registrationOpen) return false;
  if (isPastEvent(event, now)) return false;

  const registrationStart = toTimestamp(event.registrationStart);
  if (registrationStart !== null && registrationStart > now) return false;

  const registrationDeadline = toTimestamp(event.registrationDeadline);
  if (registrationDeadline !== null && registrationDeadline < now) return false;

  return true;
}
