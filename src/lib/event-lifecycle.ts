import { getAppDayBounds } from '@/lib/dates';

export type EventRegistrationMode = "internal" | "external" | "closed";

export interface EventLifecycleInput {
  status?: string | null;
  date?: string | null;
  endDate?: string | null;
  timeTbc?: boolean | null;
  registrationOpen?: boolean | null;
  registrationMode?: string | null;
  externalFormUrl?: string | null;
  registrationStart?: string | null;
  registrationDeadline?: string | null;
  isDeleted?: boolean | null;
  isArchived?: boolean | null;
  checkInEnabled?: boolean | null;
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getEventEndTimestamp(event: EventLifecycleInput): number | null {
  const explicitEnd = toTimestamp(event.endDate);
  if (explicitEnd !== null) return explicitEnd;
  const start = toTimestamp(event.date);
  if (start === null) return null;
  if (!event.timeTbc) return start;
  return Date.parse(getAppDayBounds(new Date(start)).endIso);
}

export function getRegistrationMode(event: EventLifecycleInput): EventRegistrationMode {
  if (event.registrationMode === "internal" || event.registrationMode === "external" || event.registrationMode === "closed") return event.registrationMode;
  if (event.externalFormUrl) return "external";
  return event.registrationOpen ? "internal" : "closed";
}

export function isPublicEvent(event: EventLifecycleInput): boolean {
  if (event.isDeleted) return false;
  return event.status === "published" || event.status === "completed";
}

export function isPastEvent(event: EventLifecycleInput, now: number = Date.now()): boolean {
  if (event.status === "completed") return true;
  const end = getEventEndTimestamp(event);
  return end !== null && end <= now;
}
export type TicketCheckInState =
  | "eligible"
  | "cancelled"
  | "past"
  | "unpublished"
  | "unconfirmed"
  | "disabled";

function ticketCheckInHasEnded(event: EventLifecycleInput, now: number): boolean {
  const explicitEnd = toTimestamp(event.endDate);
  if (explicitEnd !== null) return explicitEnd <= now;
  if (!event.timeTbc) return false;
  const start = toTimestamp(event.date);
  if (start === null) return false;
  return Date.parse(getAppDayBounds(new Date(start)).endIso) <= now;
}

export function getTicketCheckInState(
  registrationStatus: string | null | undefined,
  event: EventLifecycleInput | null | undefined,
  now: number = Date.now(),
): TicketCheckInState {
  if (registrationStatus === "cancelled") return "cancelled";
  if (!event || event.isDeleted || event.isArchived) return "unpublished";
  if (event.status === "completed") return "past";
  if (event.status !== "published") return "unpublished";
  if (ticketCheckInHasEnded(event, now)) return "past";
  if (registrationStatus !== "confirmed") return "unconfirmed";
  if (event.checkInEnabled === false) return "disabled";
  return "eligible";
}


export function canRegisterForEvent(event: EventLifecycleInput, now: number = Date.now()): boolean {
  if (!isPublicEvent(event) || event.status !== "published") return false;
  const mode = getRegistrationMode(event);
  const legacyExternal = !event.registrationMode && Boolean(event.externalFormUrl);
  if (mode === "closed" || (event.registrationOpen === false && !legacyExternal) || isPastEvent(event, now)) return false;
  const registrationStart = toTimestamp(event.registrationStart);
  if (registrationStart !== null && registrationStart > now) return false;
  const registrationDeadline = toTimestamp(event.registrationDeadline);
  if (registrationDeadline !== null && registrationDeadline <= now) return false;
  return true;
}

export function canUseInternalRegistration(event: EventLifecycleInput, now: number = Date.now()): boolean {
  return getRegistrationMode(event) === "internal" && canRegisterForEvent(event, now);
}

export function canUseExternalRegistration(event: EventLifecycleInput, now: number = Date.now()): boolean {
  return getRegistrationMode(event) === "external" && canRegisterForEvent(event, now);
}
