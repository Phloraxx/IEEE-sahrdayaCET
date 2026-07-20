# Security Architecture

## Trust model

- `admin` accounts are privileged operators.
- `chair` accounts are trusted internal staff.
- Society scoping in TanStack admin routes is primarily an operational and UX boundary that prevents accidental cross-society actions. It is not a hostile-user isolation guarantee unless the corresponding PocketBase API rule explicitly enforces the same scope.
- Preview deployments under the shared application parent domain are protected and run trusted code. The domain-wide PocketBase auth cookie is an intentional part of cross-subdomain OAuth/session continuity.
- Public execom contact information and public ticket lookup are intentional product behavior.

## Enforcement layers

### PocketBase API rules

API rules answer: **who may perform the base CRUD operation?**

Keep them as simple as the product threat model allows. Rules remain the first guard for direct REST access. Where trusted staff are intentionally broader than the admin UI, document that explicitly rather than adding complex relation chains solely for hostile isolation between trusted staff.

### PocketBase hooks

Hooks answer: **is this state transition valid?**

Any invariant involving money, ticket validity, registration state, counters, check-in integrity, coupons, or FIFA balances must remain valid even when TanStack routes are bypassed. Therefore the authoritative check belongs in a PocketBase hook, with TanStack optionally duplicating cheap checks for better UX.

Examples include:

- registration capacity and deadline
- payment and ticket state
- coupon usage
- event counters
- FIFA balances and settlement
- check-in validity

For check-in, PocketBase enforces that a `false -> true` transition is only allowed for a confirmed registration whose event has `checkInEnabled = true`, and PocketBase owns `checkedInAt`.

### PocketBase custom routes

Use custom routes when collection CRUD is not a good fit for the operation, such as payment webhooks, coupon validation, public ticket lookup, and FIFA settlement. Do not move ordinary CRUD into custom routes just to duplicate existing PocketBase authorization.

### TanStack Start

TanStack is the BFF and UX layer. It should handle:

- authentication checks
- admin/chair dashboard scoping
- CSRF checks
- schema validation
- rate limiting
- response shaping
- friendly errors

It is not the only enforcement point for load-bearing business invariants.

## Runtime privilege policy

The application runtime must never receive or use `POCKETBASE_SUPERUSER_TOKEN`. Elevated PocketBase credentials are migration-only. Runtime application code uses the authenticated user's PocketBase client; privileged state transitions are implemented inside PocketBase hooks or properly authenticated PocketBase custom routes.

## Small-scale operational choices

The current in-memory rate limiter is intentional for a single application instance. Introduce a shared store such as Redis only when the application is horizontally scaled.

PocketBase container versions should be pinned to the version the repository is developed and tested against instead of using an unbounded `latest` tag.
