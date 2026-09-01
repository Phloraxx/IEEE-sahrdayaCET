# 11 — Phase 2 Local Acceptance Evidence

Phase: Attendance V2.

Feature baseline before Phase 2: `49877d898ae39ca20388145305063046dcc9e045`.

Oracle worktree: `/home/drvij/.chatgpt-ieee-certificate-platform`.

## Implemented surface

- additive `202609010002_attendance_v2.js` migration;
- server-owned event sessions;
- append-only attendance ledger;
- scoped/idempotent session scan command;
- append-only manual correction command;
- transactional mutation + audit semantics;
- compatibility guards for legacy check-in;
- event Attendance workspace tab;
- continuous session-aware scanner console;
- live counts/recent scans and correction UX;
- legacy event path preserved;
- certificate qualification still disabled.

## Fresh-schema evidence

A new PocketBase 0.39.9 database was booted from the dirty Phase 2 candidate and inspected after WAL checkpointing:

- `PRAGMA integrity_check = ok`;
- 38 tables;
- `event_sessions` exists with the expected session/config fields;
- `attendance_records` exists with event/session/registration/type/operator/source/idempotency fields;
- `202609010002_attendance_v2.js` appears exactly once in `_migrations`.

Both new collections expose `null` list/view/create/update/delete rules.

## Focused test evidence

Final focused gate after command hardening:

- 4 test files green;
- 20/20 tests passed;
- includes Attendance V2 helper/architecture, legacy check-in invariants and event location/private-access architecture.

## Fresh authenticated backend evidence

The full `tests/backend/pocketbase_smoke.py` suite passed against a brand-new isolated PocketBase candidate.

Attendance-specific assertions cover:

- raw CRUD closure;
- check-in-only least privilege;
- scoped context with no attendee register;
- legacy command refusal after sessions exist;
- missing idempotency key;
- wrong event/session;
- idempotent replay and duplicate rejection;
- legacy first-arrival projection;
- append-only remove/add correction;
- required correction reason;
- recent-scan current-state projection;
- used-session deletion refusal;
- raw attendance mutation refusal;
- audit presence;
- scanning refusal after event unpublish;
- untouched sessionless legacy check-in fixtures.

The smoke environment used localhost fake provider endpoints and an `example.test` redirect sink with no SMTP configuration. No real email could be delivered.

## Full repository gate

The final post-hardening repository gate is green:

- ESLint: zero warnings;
- React Router type generation + TypeScript: green;
- Vitest: 68 files, 382 passed, 3 expected renderer skips;
- production client build: green;
- production SSR build: green;
- PocketBase hook/migration syntax checks: green;
- `git diff --check`: green.

This gate was rerun after mandatory scan idempotency, transactional session/correction auditing, transaction-time state revalidation, scanner accessibility/error-state hardening, and the organizer-parent cache invalidation needed when the first session enables Attendance V2.

## Browser acceptance candidate

`tests/e2e/attendance-v2.e2e.ts` now covers the session-aware browser lifecycle:

- organizer creates the first attendance session from a sessionless event;
- the event workspace switches from legacy to session mode and removes legacy Check in/Undo controls;
- scanner deep-link preserves event/session selection;
- manual scan records attendance and updates the present count;
- correction requires a reason and appends removal history;
- restore appends attendance again;
- duplicate scan renders the explicit Already recorded state;
- 390x844 scanner view has no horizontal overflow.

The clean-room backend smoke exports only non-secret browser fixture identifiers through `GITHUB_ENV`. Playwright does not authenticate as a PocketBase superuser or write raw collections. Exact-head GitHub CI remains the authoritative browser acceptance gate.

## Boundaries carried forward

- `attendance_qualified` is still disabled.
- Offline scanning is not implemented.
- Session requirement/weight/schedule metadata remains editable and audited until Phase 5 introduces closeout locking/snapshots.
- Session timestamps are not mechanically constrained to the top-level event window; closeout should flag anomalies rather than making the Phase 2 editor too rigid for multi-day events.
- Staging acceptance and merge to `dev` remain pending.
- `main`/production is completely out of scope for this phase checkpoint.
