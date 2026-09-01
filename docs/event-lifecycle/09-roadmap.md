# 09 — Implementation Roadmap

## Phase 0 — lifecycle correctness

Status: implemented and locally accepted.

- Canonical registration deadline/open/capacity projection.
- Event detail CTA consumes lifecycle projection.
- Completion uses effective event end.
- Archive separated from cancellation.
- Direct soft-delete blocked.
- Delivery-disabled mail worker stops before claiming jobs.

## Phase 1 — explicit event place/access model

Status: implementation reconstructed on Oracle; focused tests and fresh-schema boot green; GitHub authenticated clean-room pending.

- Explicit `timezone`, `attendanceMode`, `locationAddress`.
- Legacy deterministic backfill.
- Private `event_private_details` with all raw rules closed.
- Organizer command access via `events.edit`.
- Confirmed-attendee join-details endpoint.
- Public SSR/JSON-LD cannot contain private meeting access.
- Event editor separates public supporting link from private attendee access.

## Phase 2 — Attendance V2

Next schema-bearing phase: sessions + append-only attendance records + upgraded scanner, with legacy check-in projection preserved.
## Phase 3 — attendee continuity

- `/my-events`.
- Stable ticket/payment/receipt/join-access actions.
- ICS / Add to Calendar.
- Attendance and certificate state on past-event cards.

## Phase 4 — capacity/self-service

- Waitlist lifecycle and seat offers.
- Free self-cancellation policy.
- Paid refund-request queue.
- Race/idempotency tests around seat release and callbacks.

## Phase 5 — closeout

- Ended-event closeout workspace.
- Attendance reconciliation/corrections.
- Payment/refund exceptions.
- Optional lightweight feedback.
- Certificate eligibility from Attendance V2.
- Archive readiness.

## Phase 6 — code quality and end-to-end contract

Refactor large event/payment surfaces into feature modules without changing business state machines, then add the single full browser lifecycle E2E.

Each phase must pass focused tests, full typecheck, fresh PocketBase, GitHub clean-room CI and staging acceptance before production consideration.
