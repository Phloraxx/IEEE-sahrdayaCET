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

Status: implemented and accepted. The original exact-head acceptance was `8318476fc4ede335c7c6b7131a4420cb15932d72`; later lifecycle releases preserved the same Attendance V2 invariants through clean-room CI and staging. Phase 5B now supplies the certificate-authoritative qualification lock.

- Server-owned `event_sessions` plus append-only `attendance_records`.
- Sessionless events retain legacy one-time check-in.
- Session-enabled events use explicit, idempotent session commands.
- Legacy arrival projection preserved for compatibility.
- Continuous scoped scanner, live counts, recent scans and audited corrections.
- Organizer Attendance tab and session management.
- `attendance_qualified` is available only after a completed event explicitly locks Phase 5B attendance qualification; legacy first-arrival `checkedIn` never determines eligibility.
## Phase 3 — attendee continuity

Status: implemented and accepted. The original exact-head acceptance was `22c8356c62022db2a193d709100c5babac52b3b9`; subsequent lifecycle releases keep the My Events/calendar contract covered by clean-room Browser E2E and staging.

- Authenticated `/my-events` server projection.
- Stable ticket/payment/receipt/join-access actions.
- ICS / Add to Calendar from event, ticket and My Events.
- Attendance and certificate state in attendee history.
- Archived event records remain in attendee history without dead public links.

## Phase 4 — capacity/self-service

Status: implemented and accepted. Waitlist reservation, self-cancellation, paid refund-request separation and finance reconciliation are covered by current clean-room backend/browser regression and are present on staging.

- Private FIFO waitlist lifecycle with capacity-reserving offers and expiry.
- Free/unpaid self-cancellation with transactional seat release.
- Paid cancellation creates an attendee refund request; it never moves money automatically.
- Finance accept/decline remains separate from provider/manual refund truth.
- Public availability, registration, admin walk-ins and restores all honor reserved offers.
- My Events and event/registration pages expose waiting, offer and cancellation states.
- Clean-room fixtures cover reservation stealing, FIFO expiry and refund reconciliation.

## Phase 5 — closeout

Status: implemented and staging-accepted through merged `dev` `8c0f895a858e6f59d82b0294e358d793f92c5711`. Phase 5C attendee feedback is optional and is not required for lifecycle completion or production promotion.

- Server-owned ended/completed-event closeout readiness and archive enforcement.
- Append-only attendance reconciliation with explicit qualification lock/reopen versions.
- Payment/refund exception blockers with finance-detail redaction for non-finance roles.
- Deterministic `attendance_qualified` certificate audiences from required session evidence.
- Read-only certificate/template/issuance and SMTP-handoff progress on Closeout.
- Final archive action preserves attendee, attendance, finance, audit and certificate history.

## Phase 6 — code quality and end-to-end contract

Status: the release contract is in place. Major event/payment/certificate responsibility refactors have already landed, and exact-head CI now runs an integrated clean-room backend plus Browser E2E suite across setup, attendance, attendee continuity, waitlist/refunds, payments, certificates and closeout.

A single giant browser test is deliberately not added: the existing integrated scenario suite gives better failure isolation while exercising the same cross-feature contract in one fresh backend environment. Continue responsibility refactors only when a concrete boundary or defect justifies them; do not split files solely to reduce line counts.

Every lifecycle change must still pass focused tests, full typecheck/build, fresh PocketBase clean-room regression, exact-head GitHub CI and staging acceptance before production consideration.
