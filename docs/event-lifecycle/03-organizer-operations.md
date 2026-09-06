# 03 — Organizer Operations

## Organizer mental model

The event workspace should answer three questions without reading raw status fields:

1. Where is this event in its lifecycle?
2. What blocks the next transition?
3. What is the next safe action?

Use the canonical lifecycle snapshot to render a lifecycle bar and next-action
callout. Read financial exceptions from the finance operations projection, not
from event publication state.

## Setup and readiness

Keep draft creation short: title, host society, schedule, attendance mode and physical venue when applicable. Everything else belongs in the event editor.

Add a readiness checklist before publish. Classify checks as blocking, strong
warning or optional improvement. Candidate checks include description/artwork,
valid schedule, registration window, capacity, fee/payment setup, contact,
event lead and check-in readiness.

## Location model

New events explicitly store `timezone`, `attendanceMode` and optional public `locationAddress`. The current product defaults to `Asia/Kolkata` rather than forcing a redundant timezone choice for every organizer.

Online/hybrid join URL and instructions live in `event_private_details`; organizers edit them through a protected command route. Rotating a private meeting link should not require unpublishing the public event.
## Event-day workspace

The event workspace should shift emphasis as the date approaches: attendee counts, payment exceptions, assigned staff, check-in readiness, session selection and live attendance counts become primary.

Do not expose the full attendee register to check-in-only staff. Continue capability + event-scope authorization.

## Closeout

After effective end, the workspace enters closeout rather than simply disappearing into history. Planned closeout tasks:

- reconcile unresolved payments/refunds;
- reconcile attendance/session records;
- resolve duplicate/manual attendance corrections;
- review feedback summary when enabled;
- issue certificates when configured;
- archive only when operations are settled.

There is no vTools/L31 reporting task in closeout.

## Code organization

Break the large event workspace/editor into lifecycle-oriented feature modules instead of expanding monolithic route files. Keep data commands in `src/lib/data` and invariant enforcement in PocketBase hooks/migrations.
