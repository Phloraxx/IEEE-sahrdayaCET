# 01 — Lifecycle Architecture

## Design principle

Keep the event lifecycle small and explicit. The event status is `draft`,
`published`, `completed` or `cancelled`, with `isDeleted` representing the
separate archived visibility state. Registration, payment, operations,
attendance and certificates remain independent operational state machines.

### Operational state machines to preserve

- Publication: `draft | published | completed | cancelled`.
- Registration mode: `internal | external | closed` plus open/scheduled/paused/full/closed availability.
- Payments: existing provider/payment attempt and registration payment states.
- Certificates: template/batch/credential lifecycle with Issue and Send separated.

## Canonical projection

`getEventLifecycleSnapshot(event, now)` is the presentation contract that projects these independent states into:

- lifecycle phase;
- event-day state;
- next operator action;
- operational blockers;
- canonical registration availability/mode.

Public pages and organizer surfaces should consume this projection rather than reimplementing date/capacity/window rules.
## Command boundaries

Lifecycle transitions with consequences must remain commands, not generic CRUD:

- Publish / unpublish / complete use the lifecycle route. An authorized
  organizer can publish a complete draft; no organization or finance approval
  gate is required.
- Cancel uses the cancellation transaction and financial reconciliation.
- Archive uses its own command and never rewrites event outcome.
- Registration owns capacity/coupon/ticket/payment reservation invariants.
- Check-in/attendance records are server-authoritative.
- Certificate Issue remains separate from delivery.

## Event completion and archive semantics

Completion requires `now >= effectiveEnd`. Date-only/time-TBC events use the end of their India calendar day unless an explicit end exists.

Archive is historical visibility state, not cancellation. Archive may only apply to completed/cancelled events or unused drafts with no active registrations. Published events must first be completed, cancelled or returned to draft.

## Communication boundary

Business state must never depend on email delivery. Delivery-disabled environments leave notification intents untouched instead of turning them into failed attempts. No event operation should require mail to succeed.

## Security rule

Anything readable from the public `events` collection is public by definition. Attendee-only secrets must live in server-only collections/commands, never behind frontend-only field hiding.
