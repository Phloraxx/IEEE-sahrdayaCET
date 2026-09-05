# IEEE Sahrdaya Event Lifecycle Programme

This directory is the implementation plan for turning the existing event, registration, payment, check-in and certificate features into one coherent event operating system.

## Product boundary

The target lifecycle is:

`Draft → readiness → approval → publish → registration → payment → attendee self-service → event-day operations → attendance → closeout → certificates → archive`

The system is for IEEE Sahrdaya Student Branch operations. It is **not** intended to become a generic commercial ticketing platform.

IEEE vTools/L31 reporting is explicitly out of scope. Completed events may later expose internal summaries, exports and archival records, but this programme does not add vTools submission or reporting workflows.

## Documents

1. `01-lifecycle-architecture.md` — domain/state architecture and invariants.
2. `02-attendee-experience.md` — public journey and future My Events area.
3. `03-organizer-operations.md` — setup, readiness, event workspace and closeout.
4. `04-attendance-v2.md` — session/checkpoint attendance architecture.
5. `05-waitlist-cancellations-refunds.md` — capacity release and attendee self-service.
6. `06-ui-ux-system.md` — interaction, mobile and accessibility rules.
7. `07-testing-migrations-release.md` — clean-room, E2E and rollout gates.
8. `08-research-decisions.md` — external patterns adopted/rejected.
9. `09-roadmap.md` — implementation order and dependencies.
10. `10-phase-0-1-acceptance.md` — Phase 0/1 implementation and exact-head CI evidence.
11. `11-phase-2-local-acceptance.md` — Attendance V2 local/fresh-backend evidence plus exact-head CI acceptance.
12. `12-phase-3-local-acceptance.md` — My Events/calendar local evidence; exact-head Phase 3 CI is recorded in the roadmap.
13. `13-phase-4-local-acceptance.md` — waitlist/cancellation/refund-request architecture, local gates and pending clean-room CI.
14. `14-event-audience-pricing-requirements.md` — audience eligibility, academic normalization, IEEE-member pricing, requirements, private attendee links, ticket hub, migration/testing gates and phased implementation checklist.
15. `15-phase-5-closeout-implementation-plan.md` — closeout readiness, archive gating, attendance qualification and feedback rollout plan.
