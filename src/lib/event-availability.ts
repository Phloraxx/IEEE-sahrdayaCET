import { isPastEvent, type EventLifecycleInput } from "@/lib/event-lifecycle";

export type EventAvailabilityKind =
  | "opening-soon"
  | "open"
  | "filling"
  | "filling-fast"
  | "few-left"
  | "closing-soon"
  | "full"
  | "closed";

export interface EventAvailabilityInput extends EventLifecycleInput {
  maxCapacity?: number | null;
  registeredCount?: number | null;
  waitlistReservedCount?: number | null;
}

export interface EventAvailability {
  kind: EventAvailabilityKind;
  label: string;
}

const HOUR_MS = 60 * 60 * 1000;
const CLOSING_SOON_MS = 24 * HOUR_MS;

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function getEventAvailability(
  event: EventAvailabilityInput,
  now: number = Date.now(),
): EventAvailability {
  const capacity = Math.max(0, Number(event.maxCapacity) || 0);
  const registered = Math.max(0, Number(event.registeredCount) || 0);
  const waitlistReserved = Math.max(0, Number(event.waitlistReservedCount) || 0);
  const occupied = registered + waitlistReserved;
  const start = timestamp(event.registrationStart);
  const deadline = timestamp(event.registrationDeadline);

  if (event.status === "completed" || event.status === "cancelled" || isPastEvent(event, now)) {
    return { kind: "closed", label: "Closed" };
  }

  if (event.registrationMode === "closed") {
    return { kind: "closed", label: "Closed" };
  }

  if (start !== null && start > now) {
    return { kind: "opening-soon", label: "Opening soon" };
  }

  if (deadline !== null && deadline <= now) {
    return { kind: "closed", label: "Closed" };
  }

  if (capacity > 0 && occupied >= capacity) {
    return { kind: "full", label: "Full" };
  }

  const legacyExternal = !event.registrationMode && Boolean(event.externalFormUrl);
  if (event.registrationOpen === false && !legacyExternal) {
    return { kind: "closed", label: "Closed" };
  }

  if (deadline !== null && deadline - now <= CLOSING_SOON_MS) {
    return { kind: "closing-soon", label: "Closing soon" };
  }

  if (capacity <= 0) {
    return { kind: "open", label: "Open" };
  }

  const fillRatio = occupied / capacity;
  if (fillRatio >= 0.9) return { kind: "few-left", label: "Few places left" };
  if (fillRatio >= 0.7) return { kind: "filling-fast", label: "Filling fast" };
  if (fillRatio >= 0.5) return { kind: "filling", label: "Filling" };
  return { kind: "open", label: "Open" };
}
