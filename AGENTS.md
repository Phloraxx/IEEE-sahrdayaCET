# IEEE Sahrdaya — contributor and agent contract

This file is the operational contract for humans and coding agents working in this repository. Keep it aligned with the actual architecture and deployment workflow.

## Current architecture

- React 19 + React Router 7 Framework Mode (SSR), TypeScript, Vite 8.3, Tailwind CSS 4
- TanStack Query for browser-side query caching only
- better-sqlite3 as the single application database, owned by the app server
- Docker Compose on Dokploy/Traefik, Cloudflare in front of the public domains

The application has **one** runtime service per environment: the `web` app server.
It owns HTML, SSR, `/api/*`, authentication, file serving, and the SQLite
database. There is no separate backend process.

PocketBase is **retired from the default stack**. It stays defined in
`docker-compose.yml` behind the `legacy-pocketbase` Compose profile so the
`pb_data` volume keeps a definition, and it does not start on a normal deploy. The
app server does not read from it and must not be made to; nothing routes to it,
and it deliberately has no healthcheck (PocketBase 0.39 has no `/api/health` route). A docs:retired-ok
deliberate start uses `docker-compose.legacy-pocketbase.yml`, which requires the
original `PB_ENCRYPTION_KEY`. Removing the service or the volume is a separate
decision, never a side effect of a tidy-up. docs:retired-ok

## Non-negotiable boundaries

1. `/api/*` belongs to the app server. It is served from `src/routes/api.*.ts`, which dispatch into `src/server/*`. There is no second API process and no proxy to one.
2. Browser authentication is an opaque session token in an HttpOnly `__Host-` cookie. The browser never holds a readable credential, and logout is a server-side delete.
3. Public SSR reads use `src/server/public/*.server.ts`, which query SQLite directly. There is no credential-free HTTP client and no internal API base URL.
4. Never expose the session token to JavaScript, and never put a signing key in the browser bundle.
5. Ordinary single-record CRUD goes through the policy-gated collection surface (`/api/collections/:name`). Use a dedicated command route only for a real transaction, privileged command, webhook, or server-only integration. Every collection create, edit and delete must append an `admin_audit_log` row in the same transaction.
6. `sqlite/schema.sql` is the only schema source of truth. `pb_migrations/` is PocketBase's history and is frozen — it is not applied to the new database.
7. Financial, ticket, capacity, coupon, role, and check-in invariants must remain correct when the React UI is bypassed.
8. Staging and production databases, files, OAuth configuration, encryption keys, payment secrets, and domains are isolated.
9. Do not edit application source on the deployment host. Source changes go through Git/GitHub and the repository branch workflow.
10. Do not manually replace a Dokploy-managed service with a temporary Compose file or fallback image under the same Compose project/service name.

## Source-of-truth map

```text
src/routes.ts                 route ownership
src/root.tsx                  document shell/providers/global metadata + cache middleware
src/routes/                   React Router HTML/resource routes, including /api/*
src/server/                   application server: auth, authz, registration, payments,
                              attendance, certificates, notifications, collections
src/server/public/            public credential-free SSR readers (direct SQLite)
src/server/http/              shared HTTP helpers and the public cache policy
src/lib/db.server.ts          the single SQLite connection and statement cache
sqlite/schema.sql             the only schema source of truth
src/lib/db-migrate.server.ts  schema version, forward migrations, boot refusals
scripts/migrate-pb-to-sqlite.ts   PocketBase -> SQLite cutover
scripts/ieee-backup-export.sh     database + uploads backup and restore
scripts/backup-offsite-verify.sh  verified-offsite-copy marker (watchdog reads it)
scripts/ieee-ops-watchdog.sh      host watchdog: disk, containers, backups, offsite
scripts/audit/                    staging audit harness (fixtures, HTTP/API, UI, axe)
.opencode/skill/                  project skills (staging-audit, ops-watchdog, repo-docs)
src/features/                 feature UI
src/components/               shared UI
src/server/readiness.server.ts  what /healthz reports; fail = 503
src/server/build-identity.server.ts  commit/tree baked into the image and reported by /healthz
src/server/integrations.server.ts    which outbound integrations may act here
src/server/jobs/backup-verify.ts     safe archive inspection + db/media coherence
src/server/jobs/offsite-marker.ts    verified-offsite-copy marker interface
Dockerfile                    app server build + Node 22 SSR runtime
docker-compose.yml            production/staging service topology
.github/workflows/ci.yml      automated quality gates
.github/workflows/cd.yml      CI-gated Dokploy deployment + post-deploy verification
```

## Routing and SSR

Route ownership is explicit in `src/routes.ts`.

Public content that should rank must be server-rendered and have a stable leaf URL. Published events use `/events/:slug`; event slugs are immutable after creation. Societies also have stable crawlable leaf routes. The public blog was removed on 2026-11-22 and must not be reintroduced without a product decision.

The public document is anonymous: authentication is resolved in the browser by
`AuthProvider`, which calls `/api/session` after hydration. That is what lets
`src/server/http/cache.ts` mark public pages as shared-cacheable. Do not render
user state into the SSR document — it would make the cache unsafe and the page
uncacheable.

Authenticated/admin reads happen in the browser and are authorized per request by
the app server.

## Backend change rules

Choose the enforcement layer by intent:

- API access control → the capability checks in `src/server/authz/` plus the route's own `requireApiUser`.
- Record/state-transition invariant → a CHECK constraint or trigger in `sqlite/schema.sql`, or the service module that owns the transition.
- Multi-record all-or-nothing operation → `withTransaction` in `src/lib/db.server.ts`.
- New field/table/index/constraint → `sqlite/schema.sql`. A change to an existing table is a forward step in `src/lib/db-migrate.server.ts` plus a `SCHEMA_VERSION` bump there; a version bump alone does not alter a table. See `docs/sqlite-migrations.md`.

Current transactional/privileged command areas include event registration, coupon sync, user role changes, payment confirmation, ticket/check-in operations, attendance, certificates, and payment reconciliation.

When adding or changing a command, test the failure path as carefully as the success path. Partial writes are not acceptable.

## Authentication and roles

Account roles are stored on `users.role`:

```text
user
chair
content
admin
```

- `user` can access their own protected records plus public data.
- `chair` is scoped to societies they chair.
- `content` has elevated editorial capabilities; the public blog product was removed on 2026-11-22.
- `admin` has administrative access and privileged commands.

Workspace assignments use the simplified capability roles `Organizer`,
`Finance`, `Registration Staff`, `Check-in Staff`, and `Content Editor`.
Assignments are branch-, society-, or event-scoped as appropriate. Historical
role codes remain readable and are normalized to compatible storage aliases;
organizational titles stay in Execom/assignment metadata and do not grant
permissions by themselves.

Generic user updates must not be able to change `role`; use the dedicated admin role command.

Google OAuth is the normal production login path. Password auth is not a normal end-user login flow. The isolated staging database has OAuth disabled by default so it cannot reuse production OAuth credentials; configure a separate staging OAuth client or disposable test account before authenticated acceptance.

## Registration/payment/check-in invariants

Treat event registration as a transaction, not generic CRUD.

A valid registration flow must keep capacity, coupon consumption, registration state, ticket/payment state, and counters coherent. Cancelled registrations must not occupy capacity or be resurrected by an unrelated payment callback. Check-in must validate the ticket/registration/event state and reject duplicates/invalid tickets.

Paid-event webhook handling must fail closed when its required secret is absent or invalid.

## UI and design expectations

Preserve the existing page-specific visual language instead of flattening the site into a generic component theme.

- Public IEEE surfaces use the IEEE blue/slate system and existing expressive typography/motion.
- The Events page intentionally uses playful handwritten annotations and editorial layouts.
- Admin surfaces use the scoped `.vh-admin` design system.
- Respect `prefers-reduced-motion`.
- Do not make critical information hover-only or color-only.
- Keep touch targets usable on mobile.
- Keep the homepage identity and every homepage section visible without JavaScript (see "Homepage cold-load behaviour" in `DESIGN.md`).

See `DESIGN.md` for the current design contract.

## Important commands

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
node scripts/generate-gallery-derivatives.mjs --check
scripts/check-no-runtime-data.sh
bun run test:e2e
scripts/audit/run-staging-audit.sh
```

Local backend/web:

```bash
docker compose -f docker-compose.local.yml up --build
PORT=3000 bun run dev
```

## Testing contract

A change is not complete until it can survive a fresh SQLite database.

`bun run test:integration` runs two suites against real databases: `tests/integration-db.mjs` exercises every repository method and schema invariant, and `tests/integration-migrate.mjs` proves the PocketBase → SQLite migration handles the data shapes staging never had.

CI runs `checks` (lint, typecheck, docs, unit, build) and `integration` (`test:integration` against real databases) on every push and PR, plus `release-gate`: the compiled app, seeded with a synthetic database, exercised over HTTP and in Chromium on loopback with providers faked or disabled. PRs into `main` and `main` pushes add arm64 container builds and publish the web image per commit tree. It does not run the full Playwright suite; run `bun run test:e2e` locally when the change touches browser behaviour. PocketBase suites are run by hand — see `docs/legacy-tooling.md`.

Put backend authorization and transaction assertions in the integration suites. Browser E2E should cover SSR/navigation/SEO/guards and user-visible integration behavior.

Runtime application data is never source. `sqlite/schema.sql` is; `portal.db`,
its `-wal`/`-shm`/`-journal` sidecars, dumps and backups are not. `.gitignore`
and `.dockerignore` keep new ones out of Git and out of the image, and
`scripts/check-no-runtime-data.sh` fails if one is already in the index (for
example after `git add -f`). It reads tracked names only — never file contents —
and needs no history, so it works on a shallow checkout. If it fires, remove the
path from the index with `git rm --cached`, not from the working tree.

For regressions found on staging, add a test when practical before declaring the fix complete.

## Branch and deployment contract

There are two deliberate lanes:

```text
main        → CI → CD → production (Dokploy pulls the arm64 image)
local worktree → scripts/deploy-local.sh --staging → staging
```

Production CD reacts to successful CI on `main` only. It verifies that the SHA
tested by CI is still the current `main` head, pins it to `deploy/production`,
retags the image, calls the production Dokploy webhook and then verifies that
`/healthz` reports the tested release's build fingerprint. A `dev` push runs CI
but deploys nothing.

Staging deploys from the machine you are working on with
`./scripts/deploy-local.sh --staging`. It uses the commit you have checked out
(committed, clean, pushed), builds with the worktree compose file, takes `.env`
from the Dokploy staging checkout, recreates only `web` and health-gates. The
Dokploy staging checkout is not a deployment trigger; it supplies environment
only.

The projects and persistent volumes are distinct:

```text
production app/volume: ieee-rewrite-i9ir8q / ieee-rewrite-i9ir8q_pb_data  (frozen, legacy profile)
staging app/volume:    ieee-dev-staging     / ieee-dev-staging_pb_data     (frozen, legacy profile)

Application data lives on host bind mounts, not in those volumes:
production  SQLITE_DATA_DIR + UPLOADS_HOST_DIR
staging     /home/drvij/ieee-staging-data/{db,uploads}
```

Required deployment secret:

```text
DOCKPLOY_WEBHOOK_PROD
```

`DOCKPLOY_WEBHOOK_DEV` and the `staging` GitHub environment are unused after the
two-lane split. Because CD uses `workflow_run`, the trigger workflow must exist
on the repository default branch. Do not replace this with an independent
repository auto-deploy path that can deploy untested pushes.

The Dokploy records intentionally use the public repository as a custom Git source (`sourceType=git`) with `customGitBranch=main|dev` and no GitHub App association (`githubId` is unset). Do not reconnect the Dokploy GitHub App or switch the records back to `sourceType=github`: the production record would then react to pushes before CI and create a second deployment, bypassing the gate. The Dokploy deployment toggle remains enabled only because its project-token webhook requires it; the missing GitHub App association is what prevents native pre-CI deployment. After deployment-infrastructure changes, verify there is exactly one deployment record per pushed SHA.

Each Dokploy project must track its matching branch. The deployment webhooks are CI-approved triggers; they are not immutable SHA image deployments. The webhook-only Traefik host exposes only Dokploy's Compose deployment-token path, not the Dokploy dashboard or general API.

## Environment and container safety

The canonical deployment is `docker-compose.yml` from each Dokploy project checkout.

The web service reads its database from a bind mount, not from another container:
`SQLITE_DATA_DIR` provides `/app/data/portal.db` and `UPLOADS_HOST_DIR` provides
`/app/data/uploads`. They are separate mounts and can drift, so back them up
together — see `docs/deployment.md` § Backup and rollback.

`GET /healthz` is readiness, not liveness: it returns 503 when the database, the
job runner or the backup cadence is unhealthy, and it publishes a build
fingerprint that both deploy lanes compare against the release they shipped.
Keep its body free of paths, hosts, error strings and commit SHAs; reasons belong
on the admin data-health page.

PocketBase does not run in the default stack: it is behind the
`legacy-pocketbase` profile, nothing routes to it, and the app server does not read
from it. Do not add a dependency edge from `web` to it, and do not treat starting
it as a rollback. docs:retired-ok

Staging must not act on production integration credentials. Paid registration
initiation requires `PAYGATE_SANDBOX=true`, and `live` mail is refused outside
production. Separating the remaining OAuth and relay credentials is operator work
listed in `docs/release-checklist.md` § 10.

Staging is configured with `DEPLOY_ENV=staging`, `SITE_URL=https://staging.ieeesahrdaya.com`, `noindex`, a staging-only encryption key, and disabled production integrations. Its initial data is a scrubbed snapshot of production; it diverges independently after creation.

If staging or production serves stale code, inspect running container provenance before changing application code. A container created from a temporary Compose file can shadow the canonical service even when it is healthy.

Never point staging at the production `pb_data` volume or the production `portal.db`, and never copy production OAuth, payment, SMTP, or other integration secrets into staging.

If a container's provenance is unclear, `docker exec <container> cat /app/build/git-commit` names the commit it was built from, and `/healthz` reports a fingerprint of it.

## Production release gate

Do not call a release production-ready only because public routes return 200.

Before future production releases:

1. develop and validate accepted work on `dev`/staging;
2. review the `dev` → `main` production diff;
3. resolve any `main`/`dev` divergence intentionally in the production PR;
4. get full CI green on the exact release candidate;
5. deploy staging and run `scripts/audit/run-staging-audit.sh` (HTTP/API, every admin route, UI/rails/mobile, axe) plus any authenticated acceptance the change specifically needs;
6. verify enabled production integrations and OAuth configuration;
7. take a fresh production backup with `scripts/ieee-backup-export.sh` and confirm it restores, and confirm the newest offsite verification marker is fresh (`.opencode/skill/ops-watchdog/SKILL.md`);
8. merge to `main` and let CI-gated CD deploy;
9. perform post-deploy health, public-route, login, and safe authenticated checks — CD has already verified the build identity, so a green CD run means the new image is serving.

See `docs/release-checklist.md` for the detailed procedure.

## Documentation contract

Architecture, security, deployment, and product behavior changes are incomplete until the relevant documentation is updated in the same branch. Follow `.opencode/skill/repo-docs/SKILL.md` and run `node scripts/audit/check-docs.mjs`; it checks live-doc links, stale deployment claims and referenced commands.

Primary docs:

- `README.md`
- `AGENTS.md`
- `DESIGN.md`
- `PRODUCT.md`
- `docs/architecture.md`
- `docs/security-architecture.md`
- `docs/deployment.md`
- `docs/release-checklist.md`
- `.opencode/skill/*/SKILL.md` for repeatable procedures

Do not commit secrets, production credentials, private backup locations, deployment tokens, or temporary server workarounds into documentation.
