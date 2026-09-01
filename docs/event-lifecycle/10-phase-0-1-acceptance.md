# 10 — Phase 0/1 Acceptance Evidence

Baseline branch: `feature/certificate-platform` from committed SHA `cb2d66b053bbde6ce2136f0297689d508a264991`.

Oracle recovery worktree: `/home/drvij/.chatgpt-ieee-certificate-platform`.

## Phase 0

Recovered after the Mac worktree became unavailable and validated independently on Oracle.

Evidence:
- focused lifecycle/availability/archive/mail/time/public/permission gate: 58/58 green before Phase 1;
- React Router type generation green;
- TypeScript `--noEmit` green with certificate dependency set;
- `git diff --check` green;
- PocketBase hook syntax checks green;
- fresh PocketBase image booted successfully.

The authenticated local smoke cannot create its disposable superuser through Desktop Commander because that command is blocked by the remote execution safety layer. This is not bypassed; GitHub CI remains the authoritative authenticated clean-room gate.

## Phase 1 focused gate

After location/private-access implementation:
- 10 focused test files / 65 tests green;
- React Router type generation green;
- full TypeScript green;
- Python backend smoke compilation green;
- `git diff --check` green.

## Phase 1 fresh-schema proof

Exact dirty candidate was built into a new PocketBase 0.39.9 image and booted with a new empty database on an isolated loopback port.

Stopped-database inspection showed:
- `PRAGMA integrity_check = ok`;
- 43 migrations total;
- `202609010001_event_location_model.js` applied exactly once;
- `events` contains `timezone`, `attendanceMode`, `locationAddress`;
- `event_private_details` contains `event`, `virtualJoinUrl`, `joinInstructions`;
- `event_private_details` list/view/create/update/delete rules are all `null` (server-only).

Temporary test container/database artifacts were removed after inspection.

## Exact-head GitHub acceptance

Phase 0/1 was checkpointed and the PocketBase helper-runtime defect found by the first clean-room attempt was fixed in `49877d898ae39ca20388145305063046dcc9e045`.

GitHub CI #934 / run `33477816138` then passed on that exact head:

- PR lint;
- lint, typecheck, full unit suite and production build;
- web and PocketBase container builds;
- authenticated fresh-PocketBase backend invariants;
- certificate/payment lifecycle suites;
- Browser E2E.

Phase 1 is therefore accepted for the feature branch. Staging remains a separate synthetic/reversible gate before any merge/deployment decision.

No mail was sent, no certificate was issued, and neither `dev` nor `main` was moved during this implementation work.

## Full local repository gate

After updating the historical venue assertion for explicit online attendance:

- ESLint completed with zero warnings;
- Vitest: 65 files green, 370 passed, 3 expected certificate-renderer skips;
- production client build green;
- production SSR build green;
- React Router type generation and TypeScript remain green;
- `git diff --check` remains clean.

The full test run found one stale test that assumed every event must have a physical venue. It was updated to assert the new invariant: venue is required for on-site/hybrid events and intentionally empty for online events.
