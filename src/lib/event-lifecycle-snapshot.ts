import {
  getRegistrationMode,
  isPastEvent,
  type EventLifecycleInput,
  type EventRegistrationMode,
} from "@/lib/event-lifecycle";
import {
  getEventAvailability,
  type EventAvailability,
  type EventAvailabilityInput,
} from "@/lib/event-availability";

export type EventLifecyclePhase =
  | "draft"
  | "upcoming"
  | "live"
  | "ended"
  | "completed"
  | "cancelled"
  | "archived";

export type EventDayState = "upcoming" | "live" | "ended" | "closed";
export type EventNextAction =
  | "complete_setup"
  | "publish"
  | "registration_scheduled"
  | "event_operations"
  | "complete_event"
  | "closeout"
  | "none";

export interface EventLifecycleSnapshotInput extends EventAvailabilityInput {
  price?: number | null;
}

export interface EventLifecycleSnapshot {
  phase: EventLifecyclePhase;
  eventDay: EventDayState;
  nextAction: EventNextAction;
  blockers: string[];
  registration: EventAvailability & {
    mode: EventRegistrationMode;
    available: boolean;
  };
}
const OPEN_KINDS = new Set([
  "open",
  "filling",
  "filling-fast",
  "few-left",
  "closing-soon",
]);

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function eventDayState(event: EventLifecycleInput, now: number): EventDayState {
  if (event.isDeleted || event.status === "cancelled" || event.status === "completed") {
    return "closed";
  }
  if (isPastEvent(event, now)) return "ended";
  const start = timestamp(event.date);
  if (start !== null && start <= now) return "live";
  return "upcoming";
}

function phaseFor(event: EventLifecycleSnapshotInput, day: EventDayState): EventLifecyclePhase {
  if (event.isDeleted) return "archived";
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "completed") return "completed";
  if (event.status !== "published") {
    return "draft";
  }
  if (day === "live") return "live";
  if (day === "ended") return "ended";
  return "upcoming";
}

function blockersFor(): string[] {
  return [];
}
function nextActionFor(
  phase: EventLifecyclePhase,
  availability: EventAvailability,
): EventNextAction {
  if (phase === "archived" || phase === "cancelled") return "none";
  if (phase === "completed") return "closeout";
  if (phase === "ended") return "complete_event";
  if (phase === "draft") return "complete_setup";
  if (availability.kind === "opening-soon") return "registration_scheduled";
  return "event_operations";
}

export function getEventLifecycleSnapshot(
  event: EventLifecycleSnapshotInput,
  now: number = Date.now(),
): EventLifecycleSnapshot {
  const availability = getEventAvailability(event, now);
  const mode = getRegistrationMode(event);
  const day = eventDayState(event, now);
  const phase = phaseFor(event, day);
  const available =
    event.status === "published" &&
    !event.isDeleted &&
    mode !== "closed" &&
    OPEN_KINDS.has(availability.kind);

  return {
    phase,
    eventDay: day,
    nextAction: nextActionFor(phase, availability),
    blockers: blockersFor(),
    registration: {
      ...availability,
      mode,
      available,
    },
  };
}
