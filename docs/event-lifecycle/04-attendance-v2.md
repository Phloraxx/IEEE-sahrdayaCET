# 04 — Attendance V2

## Status

Phase 2 implementation is complete locally on `feature/certificate-platform` and is awaiting exact-head GitHub CI before it can be considered accepted for staging.

The first release is deliberately compatibility-first: an event with no sessions keeps the existing single check-in flow; creating the first attendance session switches that event to the session-aware command path.

## Why V2 exists

`registration.checkedIn` answers only whether someone arrived once. It cannot safely represent multi-day events, mandatory sessions, corrections, attendance percentages or later certificate eligibility.

Attendance V2 therefore separates three concepts:

- the registration is the attendee's event entitlement;
- an `event_session` is one attendance checkpoint/session inside the event;
- `attendance_records` are append-only facts describing what happened at that session.

## Authoritative model

`event_sessions` stores event, title, start/end, venue, ordering, attendance/check-in enablement and future certificate requirement/weight metadata.

`attendance_records` stores event, session, registration, event type, occurrence time, operator, source/device, request idempotency key and correction note.

Both collections have all raw PocketBase API rules closed. State changes occur only through capability-scoped command routes.

The current event types are `present`, `entry`, `exit`, `manual_add` and `manual_remove`. The UI writes `present` for normal scans and `manual_add`/`manual_remove` for corrections; the broader enum leaves room for later entry/exit semantics without rewriting history.

## Compatibility contract

Do not remove the legacy check-in fields in this phase:

- `checkedIn` is a first-arrival compatibility projection;
- `checkedInAt` is server-owned and remains the first valid arrival timestamp;
- `checkedInCount` remains an event-level fast aggregate;
- a manual removal from one session does not erase the historical fact that the person arrived at the event.

For session-enabled events, legacy Check in / Undo commands fail closed with `SESSION_REQUIRED` or `USE_ATTENDANCE_V2`. Sessionless events keep the old audited one-time check-in behavior unchanged.

## Scanner command invariants

The scanner selects an assigned event before ticket lookup. This prevents an unauthorized operator from using ticket IDs as an event-existence oracle.

A session scan requires:

- `checkin.manage` for the selected event;
- a published event with event-level check-in enabled;
- a confirmed registration belonging to that event;
- an attendance-enabled, scanner-enabled session belonging to that event;
- a non-empty client-generated idempotency key.

The server repeats the mutable state checks inside the write transaction. A retry with the same idempotency key returns the original successful record; a different request against an already-present attendee returns `ALREADY_PRESENT`.

## Corrections and audit

Attendance history is never edited in place. A correction appends `manual_remove` or `manual_add` with a mandatory reason.

Scan writes, corrections, and session create/edit/delete operations use transactions so the domain mutation and audit entry commit together or neither commits.

A session with any attendance history cannot be deleted. Before certificate closeout, its schedule/weight/requirement metadata can still be edited and every edit is audited. Once attendance qualification is locked, session configuration and manual corrections are frozen until an organizer explicitly reopens qualification.

## Event-day UX

`/admin/check-in` is now an event-day console rather than a one-shot verifier:

- assigned event selector;
- explicit session selector;
- URL-deep-link from the event Attendance tab;
- continuous QR camera mode;
- manual ticket-ID fallback without attendee search;
- success, duplicate, wrong-event/session and failure states;
- live present count and recent session scans;
- append-only correction/restore with a mandatory reason;
- haptic and best-effort audio feedback;
- `aria-live` scan feedback;
- check-in-only roles never receive the attendee register.

Native `BarcodeDetector` is used when available. Unsupported browsers retain manual ticket entry rather than introducing a second scanner dependency in this phase.

## Organizer UX

The event workspace has an Attendance tab. Before sessions exist it explicitly says that legacy single check-in remains active. Organizers can create/edit sessions and open the correctly scoped scanner.

Once sessions exist, per-attendee legacy Check in / Undo controls disappear from the attendee register so two operational models cannot compete in the UI.

## Certificate qualification

Phase 5B makes `requiredForCertificate` certificate-authoritative only after a completed event is explicitly locked. The server snapshots the session IDs, titles, schedule, attendance-enabled state, requirement flags and weights under a monotonic qualification version.

The deterministic rule is intentionally conservative: a registration must still be confirmed and must be present at **every** session marked `requiredForCertificate`. `attendanceWeight` is frozen and included in qualification explanation, but it does not create an implicit percentage threshold.

`attendance_qualified` fails closed while qualification is unlocked. Reopening permits audited post-event corrections and session-rule changes, immediately disables the audience, and requires a new lock version before review/issuance. The qualification version is part of the certificate audience fingerprint, so a stale review cannot survive reopen/re-lock.

Eligibility never derives from the legacy first-arrival `checkedIn` flag. When a completed-event correction adds the attendee's first real session attendance, the legacy projection may be populated only because append-only attendance evidence already exists, and its timestamp comes from the earliest credited attendance record.

## Deliberate non-goals in Phase 2

- No offline scan queue or conflict reconciliation.
- No vTools/L31 reporting.
- No automatic attendance-qualified certificates.
- No attendee-list access for check-in-only staff.
- No requirement that session timestamps be mechanically bounded to the event's top-level start/end; organizers may schedule multi-day/checkpoint details, but closeout must flag anomalous session timing before eligibility is finalized.

## Validation requirements

The Phase 2 gate covers raw CRUD denial, least privilege, wrong event/session, missing idempotency key, idempotent replay, duplicate scans, inactive events, cancelled/non-confirmed registrations, session-level enablement, append-only corrections, immutable history, transactional audit, legacy projection and sessionless-event compatibility.
