# 13 — Phase 4 Local Acceptance Evidence

Phase: capacity, attendee cancellation and refund-request self-service.

Accepted Phase 3 baseline: `22c8356c62022db2a193d709100c5babac52b3b9`.

Oracle worktree: `/home/drvij/.chatgpt-ieee-certificate-platform`.

## Data model

Migration `202609010003_attendee_cancellation_waitlist.js` adds event policy fields plus two server-owned collections:

- `event_waitlist`;
- `registration_cancellation_requests`.

All raw application CRUD rules for both collections are closed.
## Waitlist invariants

- Waiting order is FIFO by `joinedAt,id`.
- An unexpired offer reserves one real event seat.
- Direct registration, manual registration and restore commands include active offers in capacity checks.
- The attendee who owns an offer may consume that reserved slot through the normal registration command.
- Expired or voluntarily released offers advance the queue.
- Cancelled/completed events retire active waitlist entries immediately; the cron is a repair/reconciliation path as well.
- Disabling waitlisting or removing finite capacity retires active entries; temporary registration pauses preserve them.

PocketBase rejected partial `WHERE status IN (...)` indexes. The final schema uses a server-owned `activeKey` with supported unique `activeKey != ""` indexes, cleared on terminal states, plus command transactions. This preserves history while enforcing one active entry/request under races.
## Cancellation and refund boundaries

- Free/unpaid attendee cancellation is transactional and releases capacity.
- Paid attendee cancellation creates an `open` refund request and leaves the paid registration intact.
- Finance may accept or decline the attendee request with an audit note.
- Accepting a request does not mark money refunded.
- Existing payment/refund commands and provider reconciliation remain financial truth.
- A request becomes `resolved` only after the registration/payment state is actually `refunded`.
- No Phase 4 command enqueues or sends email.
## Attendee and organizer UX

- My Events shows waitlist position, active seat offers, claim/leave actions, cancellation eligibility and refund-request state.
- Full event and registration pages expose waitlist entry instead of a dead-end `Full` state.
- An offered attendee can open the registration form even while aggregate public availability remains full.
- Event setup exposes self-cancellation/refund deadlines, attendee refund policy, waitlist enablement and offer duration.
- Finance workspace lists attendee refund requests separately from generic payment exceptions.
- Admin capacity metrics include reserved offers.
## Local validation evidence

- Fresh PocketBase image build: green.
- Fresh database migration boot after correcting unsupported partial-index expressions: green.
- React Router type generation + TypeScript: green.
- ESLint `src` with zero warnings: green.
- Focused attendee-lifecycle + availability tests: 23/23 green.
- Full Vitest: 71 files, 398 passed, 3 expected certificate-renderer skips.
- Production client + SSR build: green.
- PocketBase hook/migration syntax, Python smoke compilation and `git diff --check`: green.

The local remote-tool safety layer blocks creation of the disposable PocketBase superuser, so authenticated Phase 4 backend smoke and the seven-case My Events browser suite remain authoritative GitHub CI gates.
