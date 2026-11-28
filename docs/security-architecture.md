# Security Architecture

## Trust boundary

The app server is the security boundary. It serves the public site, `/api/*` and
the admin UI from one process, and that process owns the only SQLite connection.
There is no second API service to hide behind, so every route must be safe when
called directly with curl, without the React UI.

The database is not a private implementation detail either: `sqlite/schema.sql`
holds the constraints that keep invariants true when a request bypasses the
service that normally owns a transition.

## Enforcement layers

Security is layered so that a mistake in one place does not become an exploit:

### 1. Session and capability checks

`src/server/auth/session.server.ts` resolves the opaque session cookie to a
user. `src/server/authz/capabilities.ts` maps the account role plus the user's
active workspace assignments to capabilities, and
`src/server/workspace/service.ts` supplies society/event scope. Routes call
`requireApiUser` or `getSessionUser` themselves; there is no ambient "logged in
for the whole app" assumption.

### 2. The collection policy

`src/server/collections/policy.ts` is the allow-list behind
`/api/collections/:name`:

- only listed collections and live table columns are reachable;
- `read: "public"` collections carry a predicate and a field projection, so an
  anonymous caller cannot read drafts or internal approval/finance fields;
- `read: "self"` and `write: "self"` are always filtered by the owner column, so
  an admin capability cannot widen them;
- `scopedRead` builds a predicate from the caller's own assignments, never from
  the request;
- the filter grammar supports `= != > >= < <= ~ !~`, `&&`, `||` and parentheses,
  compiles to bound parameters, and validates every field against the live
  schema. There is no SQL text from the client.

### 3. Command routes

Operations that reserve capacity, consume a coupon, create a ticket, change
payment state, or touch several linked rows are dedicated commands, not CRUD.
They run inside `withTransaction` and re-check their invariants inside it.

### 4. Schema constraints

`sqlite/schema.sql` is the last line: foreign keys, CHECK constraints, unique
indexes and triggers must keep counters, ticket/payment state and ownership
coherent even if a future route forgets a check. `tests/integration-db.mjs`
exercises the constraints against a fresh database.

## Audit trail

Every privileged mutation appends one `admin_audit_log` row in the same
transaction as the change:

- command routes call `audit()` (`src/server/audit.ts`);
- generic collection creates, edits and deletes, and image uploads, call
  `auditCollectionWrite()` (`src/server/collections/audit.ts`), recording `<entity>.<kind>`, the entity
  id, event/registration links, and only the changed columns.

The table is readable only with `reports.view`, scoped by the caller's
assignments. `google_sub` is redacted. A delete is audited before the row
disappears because `event_id`/`registration_id` are foreign keys with
`ON DELETE SET NULL`; the delete row keeps `entity_id` and its before-image.

## Authentication

Browser authentication is a Google OAuth flow started at `/auth/google`. The
server performs the code exchange, signs the OAuth state with `APP_SECRET`, and
sets an opaque session token in a `__Host-` cookie (`Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`).

The database stores only `sha256(token)`, so a database leak does not hand out
live sessions. Logout deletes the row. The browser never receives a readable
credential, and no session token is rendered into the SSR document.

User role changes cannot be performed through generic user updates. Admins use
`POST /api/admin/users/:id/role`, which is capability-checked and audited.

Staging and production use separate OAuth redirect/origin configuration. A
working staging login is not proof that production OAuth is configured.

## Private fields

- Execom records are readable for the directory, but `email` and `phone` are
  omitted from public responses (`publicOmit`, with the staff capability as the
  bypass).
- Events omit the approval trail, finance sign-off, attendance snapshot and
  legacy coupon column from public responses.
- Ticket lookup returns only the minimum ticket/event state. Raw registration
  and payment-ledger collections are not browser-readable; workspace callers use
  the capability-filtered registration and payment projections.
- `GET /files/...` serves only records the caller can see; a hidden society's
  logo is 404 to the public and 200 to staff.

## Event registration, payment, and check-in integrity

Registration is a transactional command. Capacity, coupon usage, registration
state, ticket/payment state, and counters must remain coherent if a request
fails midway or is retried.

Security-sensitive invariants include:

- closed, full, ended or out-of-window events cannot reserve seats;
- cancelled registrations do not occupy capacity or get resurrected by a
  payment callback;
- paid registrations that are cancelled are surfaced for finance review instead
  of silently becoming a free seat;
- payment confirmation rejects missing or invalid webhook signatures when the
  integration is enabled;
- a payment whose webhook was lost can be confirmed by a bounded, validated
  provider status read on the reconciliation pass or the attendee refresh, so a
  confirmed payment never depends on webhook delivery alone;
- the provider status read is opt-in (`PAYGATE_STATUS_READ`) and off by default
  until its path and key scope are confirmed against a PayGate sandbox; while it
  is off, no provider read happens at all;
- a reservation that holds a provider payment session is never released on
  local clock alone: only an affirmative provider answer may end it. An outage,
  a timeout, a rate limit, a 401/403 and **a 404** all keep the reservation,
  because each can mean the path, the key scope or the provider's retention is
  wrong rather than that the payment is gone;
- manual confirmation is admin-only, rejects cancelled/non-pending
  registrations, and records the confirming admin and timestamp;
- generic registration PATCH requests cannot rewrite payment, amount, provider
  or ticket fields;
- coupon expiry and max-use rules are enforced server-side;
- ticket/check-in validation rejects invalid state and duplicate check-ins
  (the second scan is a 409, not a second attendance row).

Never trust a disabled button as the enforcement layer.

## Browser response hardening

React Router document responses set the browser policy directly so it is not
lost when the reverse proxy changes:

- CSP with a per-response nonce and no `unsafe-inline` in `script-src`;
  `style-src` still allows inline because the UI uses runtime style attributes;
- HSTS in production, frame denial (`frame-ancestors 'none'` and
  `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, a strict-origin
  referrer policy and a restrictive Permissions-Policy;
- upload routes apply an Origin/Sec-Fetch-Site guard: a cross-site origin is
  403 before the file is read.

## Secret handling

Integration secrets live in the Dokploy environment for the environment that
uses them. They are server-only and must never reach the browser bundle.

- Payment webhook signatures are verified over the raw body before parsing.
- Mail delivery is centrally guarded and fails closed when `MAIL_DELIVERY_MODE`
  is unset or invalid. `live` is rejected outside production; staging uses
  `disabled`, `allowlist` or `redirect`, and redirected mail is labelled.
- The certificate renderer is rate-limited and capability-scoped.
- CD uses one repository secret, `DOCKPLOY_WEBHOOK_PROD`. Staging deploys from
  the operator's machine and does not need a GitHub environment.

Do not echo webhook values or store them in repository files.

## Deployment isolation

Staging and production never share database files, uploads, encryption keys,
OAuth applications, payment secrets or domains. Staging is marked
`noindex, nofollow` at the web response layer.

`/api` is served by the app server. Do not point it at PocketBase and do not map
PocketBase's `/_/` path to the public host; the PocketBase container is a
private rollback target only.

The canonical runtime is the Dokploy-managed Compose project. Do not shadow a
service with a manually created container or temporary Compose file using the
same project/service identity: that can serve stale or unreviewed code while
appearing healthy.

## Release security gate

Before production, complete the security-relevant items in
`docs/release-checklist.md`:

- exact release-candidate CI success;
- `scripts/audit/run-staging-audit.sh` green on staging (HTTP/API, admin routes,
  UI and axe), including the audit-row checks;
- production OAuth/integration configuration review;
- a fresh database + uploads backup with `scripts/ieee-backup-export.sh`, and a
  confirmed restore;
- post-deploy login and safe authenticated verification.
