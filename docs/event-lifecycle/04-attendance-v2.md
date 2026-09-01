# 04 — Attendance V2

## Problem

`registration.checkedIn` can answer only whether someone arrived once. It cannot reliably represent multi-day events, mandatory sessions, entry/exit, attendance percentages or certificate eligibility.

## Target model

Add `event_sessions` with event, title, start/end, venue, ordering, attendance/check-in enabled flags and certificate requirement/weight metadata.

Add append-only `attendance_records` with event, session/checkpoint, registration, event type, occurrence time, operator, source/device and deduplication metadata.

Recommended attendance event types are initially `present`, `entry`, `exit`, `manual_add` and `manual_remove`; only implement the minimum needed by the UI while preserving audit history.

## Compatibility

Do not delete the existing check-in fields immediately. During migration:

- `checkedIn` remains a legacy/event-arrival projection;
- `checkedInAt` remains the first valid arrival timestamp;
- `checkedInCount` can remain an event-level fast aggregate;
- new qualification logic reads Attendance V2 records when the event uses sessions.

This allows existing tickets/check-in code to keep working while the richer model rolls out.
## Scanner UX

Upgrade `/admin/check-in` into an event-day console:

- assigned event/session selector;
- continuous scanner mode;
- clear success, duplicate, invalid and wrong-event states;
- recent scans and live counts;
- search/manual fallback;
- narrow undo/correction command with audit reason;
- audio/haptic feedback when supported;
- no attendee-list access for check-in-only roles.

## Qualification

Enable certificate audience `attendance_qualified` only after Attendance V2 is authoritative. Qualification must be deterministic, explainable and computed server-side from required sessions/weights.

## Offline mode

Do not build offline conflict reconciliation in the first Attendance V2 release. Offline scanning requires local ticket state, nonce/deduplication strategy, replay safety and conflict semantics; excellent online scanning is preferable to a fragile partial offline implementation.

## Required tests

Fresh-database tests must cover duplicate scans, wrong event/session, cancelled registration, disabled check-in, least privilege, manual correction audit, multi-session qualification and legacy-event compatibility.
