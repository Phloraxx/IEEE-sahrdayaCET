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

Status: accepted on exact feature head `49877d898ae39ca20388145305063046dcc9e045`; GitHub CI #934 passed validation, container builds, authenticated clean-room backend and Browser E2E.

- Explicit `timezone`, `attendanceMode`, `locationAddress`.
- Legacy deterministic backfill.
- Private `event_private_details` with all raw rules closed.
- Organizer command access via `events.edit`.
- Confirmed-attendee join-details endpoint.
- Public SSR/JSON-LD cannot contain private meeting access.
- Event editor separates public supporting link from private attendee access.

## Phase 2 — Attendance V2

Status: accepted on exact feature head `8318476fc4ede335c7c6b7131a4420cb15932d72`; GitHub CI #936 passed validation, container builds, authenticated clean-room backend and Attendance V2 Browser E2E. Staging acceptance remains pending.

- Server-owned `event_sessions` plus append-only `attendance_records`.
- Sessionless events retain legacy one-time check-in.
- Session-enabled events use explicit, idempotent session commands.
- Legacy arrival projection preserved for compatibility.
- Continuous scoped scanner, live counts, recent scans and audited corrections.
- Organizer Attendance tab and session management.
- `attendance_qualified` remains disabled until Phase 5 closeout.
## Phase 3 — attendee continuity

Status: implementation complete locally on top of accepted Phase 2; exact-head GitHub CI and staging acceptance pending.

- Authenticated `/my-events` server projection.
- Stable ticket/payment/receipt/join-access actions.
- ICS / Add to Calendar from event, ticket and My Events.
- Attendance and certificate state in attendee history.
- Archived event records remain in attendee history without dead public links.

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
