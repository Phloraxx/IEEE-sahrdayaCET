# Phase 5 — Closeout Implementation Plan

## Goal

Turn an ended/completed event into an explicit closeout workflow instead of leaving organizers to infer readiness from unrelated tabs.

Closeout must answer:

1. What still needs reconciliation?
2. What is evidence only, not a blocker?
3. Is the event safe to archive now?

The server owns this decision. The UI renders the same contract that the archive command enforces.

## Slice 5A — Closeout readiness

Implement first because it is read-mostly, low migration risk, and establishes the invariant future Phase 5 work can extend.

Server projection:
- event lifecycle state and archive eligibility;
- active waitlist rows/reservations;
- unresolved attendee refund requests;
- payment/manual-review exceptions;
- pending paid registrations that still need reconciliation;
- session-attendance evidence and schedule anomalies;
- human-readable blockers/warnings and `readyToArchive`.
Archive enforcement:
- archive remains allowed only for existing archive-eligible lifecycle states;
- unresolved financial/refund/waitlist blockers return a 409 closeout error;
- attendance schedule anomalies are warnings in 5A, not archive blockers;
- completed-event attendee history remains intact.

Organizer UI:
- show closeout only for ended/completed/cancelled lifecycle contexts;
- lead with Ready / Needs attention, not raw status codes;
- link blocker rows to Attendance or Payments;
- keep certificates as an independent task;
- do not imply mail delivery is enabled.

## Slice 5B — Attendance reconciliation lock

After 5A is accepted:
- freeze certificate-authoritative session requirement/weight metadata at closeout;
- define deterministic qualification and explainability;
- implement `attendance_qualified` server-side;
- preserve append-only corrections with an explicit reopened/locked policy.

Do not infer eligibility from the legacy first-arrival `checkedIn` projection.
## Slice 5C — Feedback

Optional and isolated from operational readiness:
- lightweight authenticated attendee feedback in My Events;
- one response per registration;
- aggregate organizer summary only after a minimum safe response threshold if anonymity is desired;
- no email prompt is required.

Feedback must never block archive or certificate issuance.

## Slice 5D — Final closeout / archive

- show certificate/template/issuance progress as an independent task;
- require all blocking reconciliation items to be zero;
- provide final archive action from the closeout surface;
- retain audit, finance ledger, attendance history, certificates and attendee history after archive.

## Acceptance

Each slice must pass:
- focused unit/architecture tests;
- lint, typecheck and PocketBase runtime syntax;
- full unit suite and production build;
- fresh PocketBase clean-room backend regression;
- Browser E2E for the visible lifecycle contract;
- exact-head PR CI, post-merge CI and staging SHA verification.

Production remains out of scope until the whole lifecycle programme is explicitly promoted.
