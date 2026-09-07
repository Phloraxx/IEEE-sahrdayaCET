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

Implementation contract:
- only completed, non-archived events can lock or reopen qualification;
- lock snapshots certificate-authoritative session IDs, schedule, attendance enablement, `requiredForCertificate`, and `attendanceWeight` under a monotonic version;
- qualification requires a confirmed registration to be present at every certificate-required session;
- weights are explanatory/future-reporting metadata only, not an implicit percentage rule;
- session edits/deletes and attendance corrections fail closed while locked;
- reopening preserves the prior snapshot/version for audit, allows append-only corrections again, and disables `attendance_qualified` until the next lock;
- certificate audience fingerprints include qualification version/metadata so stale reviewed audiences fail after reopen/re-lock;
- if a completed event has at least one session already marked certificate-required, unlocked qualification is an archive blocker; events with no certificate-required sessions are unaffected.

Do not infer eligibility from the legacy first-arrival `checkedIn` projection. Existing issued certificates remain immutable snapshots; reopening attendance does not silently revoke credentials.
## Slice 5C — Feedback

Optional and isolated from operational readiness:
- lightweight authenticated attendee feedback in My Events;
- one response per registration;
- aggregate organizer summary only after a minimum safe response threshold if anonymity is desired;
- no email prompt is required.

Feedback must never block archive or certificate issuance.

## Slice 5D — Final closeout / archive

Implementation contract:
- the existing server-owned blocker list remains the only source of `readyToArchive`; certificate work does not become a new gate;
- Closeout projects aggregate certificate progress for the event: template publication, issuance batches, issued/active credential records, and SMTP handoff counts;
- Certificate progress is read-only and never changes `readyToArchive`;
- mail progress means SMTP handoff/acceptance only and must not be presented as guaranteed inbox delivery;
- the final archive action remains on the Closeout surface and still re-checks the same closeout contract transactionally;
- archive keeps audit, finance ledger, attendance history, certificate templates/batches/credentials, and attendee history intact; it only retires the event from active operations.

Slice 5C feedback remains optional and is not required for lifecycle completion or production promotion.

## Acceptance

Each slice must pass:
- focused unit/architecture tests;
- lint, typecheck and PocketBase runtime syntax;
- full unit suite and production build;
- fresh PocketBase clean-room backend regression;
- Browser E2E for the visible lifecycle contract;
- exact-head PR CI, post-merge CI and staging SHA verification.

Production remains out of scope until the whole lifecycle programme is explicitly promoted.
