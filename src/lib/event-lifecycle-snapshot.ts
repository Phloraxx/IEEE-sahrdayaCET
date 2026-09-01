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
  | "in_review"
  | "approved"
  | "upcoming"
  | "live"
  | "ended"
  | "completed"
  | "cancelled"
  | "archived";

export type EventDayState = "upcoming" | "live" | "ended" | "closed";
export type EventNextAction =
  | "complete_setup"
  | "edit_and_resubmit"
  | "await_approval"
  | "await_finance_approval"
  | "publish"
  | "registration_scheduled"
  | "event_operations"
  | "complete_event"
  | "closeout"
  | "none";

export interface EventLifecycleSnapshotInput extends EventAvailabilityInput {
  approvalStatus?: string | null;
  financeApprovalStatus?: string | null;
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
    const approval = String(event.approvalStatus || "draft");
    if (approval === "submitted" || approval === "changes_requested") return "in_review";
    if (approval === "approved") return "approved";
    return "draft";
  }
  if (day === "live") return "live";
  if (day === "ended") return "ended";
  return "upcoming";
}

function blockersFor(event: EventLifecycleSnapshotInput): string[] {
  const blockers: string[] = [];
  const approval = String(event.approvalStatus || "draft");
  const finance = String(event.financeApprovalStatus || "not_required");
  const paid = Math.max(0, Number(event.price) || 0) > 0;

  if (event.status !== "published" && event.status !== "completed" && event.status !== "cancelled" && !event.isDeleted) {
    if (approval === "changes_requested") blockers.push("Event changes were requested");
    if (approval === "submitted") blockers.push("Event approval is pending");
    if (approval !== "approved" && approval !== "changes_requested" && approval !== "submitted") {
      blockers.push("Event approval is required before publishing");
    }
    if (paid && finance !== "approved") blockers.push("Finance approval is required before publishing");
  }
  return blockers;
}
function nextActionFor(
  phase: EventLifecyclePhase,
  event: EventLifecycleSnapshotInput,
  availability: EventAvailability,
): EventNextAction {
  if (phase === "archived" || phase === "cancelled") return "none";
  if (phase === "completed") return "closeout";
  if (phase === "ended") return "complete_event";
  if (phase === "in_review") {
    return event.approvalStatus === "changes_requested" ? "edit_and_resubmit" : "await_approval";
  }
  if (phase === "draft") return "complete_setup";
  if (phase === "approved") {
    if (Math.max(0, Number(event.price) || 0) > 0 && event.financeApprovalStatus !== "approved") {
      return "await_finance_approval";
    }
    return "publish";
  }
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
    nextAction: nextActionFor(phase, event, availability),
    blockers: blockersFor(event),
    registration: {
      ...availability,
      mode,
      available,
    },
  };
}
