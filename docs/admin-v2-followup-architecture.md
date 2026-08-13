# Admin V2 Follow-up Architecture

Target branch: `admin-v2-razorpay-direct-20260813`. This document complements `razorpay-direct-architecture.md` and records the remaining non-payment re-engineering decisions before production promotion.

## Access model

Replace the current single `users.role` + `societies.chairs` permission model with two layers:

- `users.globalRole`: `user | content | admin`
- `society_memberships`: `user`, `society`, `role`, `status`, timestamps

Suggested scoped membership roles: `chair`, `officer`, `editor`.

This allows one person to be both a content editor and a society chair, supports multiple society memberships, and makes permission scope explicit instead of inferring it from unrelated display data.

Do not use Execom membership as an authorization source.

## Society lifecycle

Normal admin UI must archive/hide societies, never hard-delete them. Existing `isHidden` is the natural compatibility field.

Physical deletion should be an exceptional maintenance operation only after proving there are no referenced events, blogs, execom rows, memberships or historical audit records.

## Command-only operations

Sensitive registration/event state changes should be command endpoints, not ordinary collection PATCHes:

- registration cancel / restore / reopen payment
- check-in / undo check-in
- manual payment confirmation
- refund request / resolution
- event cancellation
- counter repair

Direct collection rules/hooks should reject attempts to mutate protected state fields even for admins. Commands own validation, authorization, transaction boundaries and audit creation.

## Audit durability

Upgrade `admin_audit_log` so an audit entry can be created atomically with the business mutation without depending on a newly-created relation being resolvable.

Add plain immutable fields such as `entityType`, `entityId`, `outcome`, `requestId`, plus optional event/registration relations for navigation. High-risk exports and permission changes should also be audited.

A successful privileged command must never silently succeed without an audit record.

## Data Health

Data Health is a global administrator integrity view. It should check:

- event registered/check-in counter drift
- coupon usage drift
- confirmed paid registration missing ticket
- impossible registration/payment state pairs
- duplicate active identity
- missing event relation
- stale payment/reconciliation work
- provider/refund mismatches
- exhausted notification retries
- chair/membership authorization drift
- schema/migration version drift

Only cached counters should have one-click automatic repair. Financial or authorization inconsistencies should require explicit resolution.

## Pagination and filters

Remove every silent fixed-size admin list. Users, Societies, Execom, Events, Registrations, Payments and chair selectors must use pagination or remote autocomplete.

Search/filter/page state should live in the URL where practical so operational views are shareable and browser navigation works naturally.

## Event editor

Keep explicit `registrationMode = internal | external | closed`.

Clearable fields must continue to use explicit clear values rather than omitted keys. Capacity reductions below active reservations require an explicit warning/override path. A chair may never transfer an event to another society.

## Release policy

Do not combine destructive schema cleanup with the first Razorpay/ledger release. Stage the migration:

1. additive collections/fields and dual-read compatibility;
2. staging burn-in and reconciliation checks;
3. switch new writes to normalized models;
4. production migration after zero unresolved legacy payment sessions;
5. remove compatibility fields only in a later release.
