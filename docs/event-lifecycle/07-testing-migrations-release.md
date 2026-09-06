# 07 — Testing, Migrations and Release

## Testing layers

Every schema/authorization change must survive a fresh PocketBase database. Backend tests own authorization, transaction and state-transition invariants; unit architecture tests guard cross-layer contracts; browser E2E proves user-visible lifecycle continuity.

## Required lifecycle E2E

Build one synthetic browser journey covering organizer draft/setup/publish,
attendee registration/payment or free confirmation, ticket, event-day
check-in/attendance, completion, closeout and certificate verification.

The test must use fake/disabled communication transports. It must never send real mail.

## Migration rules

- `pb_migrations` remains the only schema/rule/index source of truth.
- Additive migrations first; destructive cleanup only after compatibility period.
- Backfill legacy attendance/location values deterministically.
- New private collections default to closed API rules.
- Preserve production row/state semantics during migration rehearsals.

## Release stages

1. Focused unit/architecture tests and typecheck.
2. Fresh PocketBase image/database boot and metadata/integrity inspection.
3. GitHub clean-room backend smoke on the exact commit.
4. Full CI/container/browser gates.
5. `dev` staging deployment only after exact-SHA green CI.
6. Synthetic staging acceptance with snapshot/restore and zero residue for schema-bearing work.
7. Production remains a separate explicitly authorized release.
## Safety gates

No real event mail is sent during development/staging acceptance. A communication safety block must not mutate business state or exhaust retry attempts.

Private online access requires tests for raw collection denial, organizer scope, unregistered attendee denial, confirmed attendee access and audit redaction.

Attendance V2 requires concurrency/idempotency tests, legacy compatibility and least-privilege scanner roles before it can drive certificate eligibility.

Waitlist/cancellation requires race tests around final seat, duplicate offer/claim, expiry and payment callbacks.

## Production database rehearsal

Before a production migration-bearing release, take a consistent copy/backup and boot the exact candidate against that copy in isolation. Check integrity, migration ledger and preservation of existing application-row counts/critical states. Never rehearse by pointing a candidate directly at the production volume.
