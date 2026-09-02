# 12 — Phase 3 Local Acceptance Evidence

Phase: attendee continuity (`/my-events` + calendar).

Accepted Phase 2 baseline: `8318476fc4ede335c7c6b7131a4420cb15932d72`.

Oracle worktree: `/home/drvij/.chatgpt-ieee-certificate-platform`.

## Implemented surface

- authenticated `GET /api/app/my-events` with `Cache-Control: no-store`;
- one server-owned projection across registrations, event state, attendance, private access and certificates;
- Action Needed / Upcoming / Past attendee sections;
- payment continuation, ticket and receipt actions;
- confirmed-attendee online/hybrid join access;
- legacy and Attendance V2 summaries;
- active certificate links scoped to the attendee registration;
- archived events remain in attendee history but expose no dead public-event/calendar actions;
- stable `/events/:slug/calendar.ics` endpoint;
- Add to Calendar from event detail, ticket and My Events;
- authenticated Navbar entry for My Events.
## Privacy and lifecycle boundaries

- unauthenticated My Events requests are rejected;
- the browser does not query raw registration, attendance-record or certificate collections;
- private join details are returned only for a confirmed registration while the event is still published and not ended;
- attendee projection does not expose registration email/phone or payment ledger internals;
- only active certificates for the selected registration are returned;
- disabled attendance sessions are excluded from attendee attendance totals;
- cancellation/archive history remains visible to the attendee even when the public event route is intentionally unavailable;
- public ICS uses only public event data and never contains attendee-only meeting access.

## Calendar quality

The ICS serializer has stable per-event UIDs, UTC timestamps for timed events, Asia/Kolkata calendar dates for time-TBC events, escaped text fields and UTF-8-aware RFC 5545 line folding at 75 octets.

No new PocketBase migration is required for Phase 3.
## Local validation evidence

Focused Phase 3 gate:

- React Router type generation + TypeScript: green;
- ESLint `src` with zero warnings: green;
- My Events architecture/privacy tests: green;
- calendar serialization tests: green, including UTF-8 line folding;
- PocketBase hook syntax and Python smoke compilation: green;
- `git diff --check`: green.

Full repository gate before checkpointing:

- Vitest: 70 files, 390 passed, 3 expected certificate-renderer skips;
- production client build: green;
- production SSR build: green.

The final exact-head GitHub run remains authoritative for fresh PocketBase, certificate-recipient projection and the five My Events Browser E2E cases.
## Browser acceptance candidate

`tests/e2e/my-events.e2e.ts` covers:

- upcoming hybrid event private Join access;
- attendee Ticket continuity;
- downloadable ICS response;
- authenticated Navbar My Events entry;
- issued certificate visible only through its recipient fixture;
- 390x844 layout without horizontal overflow.

Playwright receives only ephemeral attendee auth tokens and non-secret fixture IDs/titles through `GITHUB_ENV`; it does not use PocketBase superuser credentials or raw collection writes.

## Remaining gates

- exact-head GitHub clean-room CI;
- synthetic staging acceptance before any `dev`/production consideration;
- Phase 4 cancellation/refund/waitlist work remains separate.

No real mail is required or intentionally exercised by Phase 3.
