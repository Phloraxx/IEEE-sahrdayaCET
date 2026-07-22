# Security Architecture

## Trust boundary

The PocketBase API is an application security boundary, not a private database hidden behind React Router. Direct API access must be safe under collection rules and hooks.

Roles are `user`, `chair`, `content`, and `admin`.

- `user`: own protected records plus public data.
- `chair`: staff access scoped by PocketBase relations to societies they chair.
- `content`: owns editorial blog records they create.
- `admin`: administrative access and privileged commands.

## Enforcement layers

### Collection API rules

Rules answer who may list/view/create/update/delete records. They must remain correct if a caller bypasses the UI completely.

Examples:

- chairs cannot enumerate another society's private events;
- users can read only their own protected records;
- content editors can mutate only their own posts;
- direct `registrations` and `fifa_bets` creation is disabled because those are commands.

### Request/model hooks

Hooks own state-transition invariants such as immutable event URLs, check-in validity, counter protection, payment/ticket transitions, privacy enrichment, and singleton restrictions.

### Transactional custom routes

Any operation that moves a wallet balance, reserves event capacity, consumes a coupon, creates a ticket, or refunds/pays several records must be all-or-nothing.

PocketBase `runInTransaction` is used for registration, FIFA betting/settlement/voiding, coupon reconciliation, and the raffle draw. All writes inside the transaction use the transaction app.

## Runtime privilege policy

The web runtime must never receive PocketBase superuser credentials. `src/lib/pb.server.ts` creates only an unauthenticated public SSR client.

A superuser exists only for administrative operations outside the app and for disposable CI fixture setup. CI credentials are created inside the throwaway PocketBase container.

## Authentication

Browser authentication is direct PocketBase OAuth on the same public origin. There is no domain-wide custom auth cookie, OAuth callback BFF, or server-side token forwarding layer.

User role changes cannot be performed through generic user updates. Admins use `POST /api/app/admin/users/:id/role`.

## Private fields

Execom records are publicly readable for the directory, but PocketBase enrichment hides `email` and `phone` from non-admin responses.

Ticket lookup intentionally returns the minimum public ticket/event state. Authenticated callers may separately read registration details when collection rules permit it.

## Financial game integrity

WC Predict uses fake points, but its ledger is still treated as financial-style state:

- bet placement is atomic;
- settlement has exactly one payout engine;
- settlement is idempotent;
- direct pool/result/settlement edits and destructive deletes are rejected once bets exist;
- direct financial void edits are rejected;
- market/match void commands refund exactly once;
- raffle evidence fields can only be written by the raffle command;
- no background score synchronizer or production testing console is allowed to issue payouts or rewrite balances.

Live-score APIs provide display data only. Admin settlement is explicit.


## Browser response hardening

React Router document responses set the browser security policy directly so it is not lost when the reverse proxy changes. The current baseline includes CSP, HSTS in production, frame denial, MIME sniffing protection, a strict-origin referrer policy, and a restrictive Permissions-Policy.

The CSP intentionally still allows inline scripts/styles because the current theme bootstrap and UI stack rely on them. Moving to nonce-based CSP would be a separate hardening project, not a prerequisite for this deployment.

## Deployment isolation

Staging and production must never share PocketBase data. Staging is also marked `noindex, nofollow` at the web response layer.

Public routing should expose `/api` to PocketBase but not map `/_/` to the PocketBase service on the public hostname.
