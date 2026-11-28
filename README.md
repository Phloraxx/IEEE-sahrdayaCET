<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya" src="./public/web.png" />

# IEEE Sahrdaya Student Branch

**Public website, event platform, certificate system, and administration tools for IEEE Sahrdaya.**

[Production](https://ieeesahrdaya.com)

</div>

## Architecture

The application deliberately has only one runtime service:

```text
Browser
  │
Cloudflare / Dokploy / Traefik
  └── /*  →  React Router v7 app server  ──  portal.db (SQLite, WAL)
                                          └──  uploads/ (bind mount)
```

- **React Router v7 Framework Mode** owns SSR, HTML routes, metadata routes, the browser UI, and `/api/*`.
- The **app server** owns authentication, authorization, registration, payments, attendance, certificates, notifications, and file serving. There is no second API process.
- **better-sqlite3** is the single database, opened as one process-wide connection in WAL mode.
- Sessions are opaque tokens in an HttpOnly `__Host-` cookie, stored as a sha256 hash so logout is a delete and a database leak does not hand out live sessions.
- Every privileged mutation — workflow commands, ordinary collection creates/edits/deletes, and image uploads — appends one `admin_audit_log` row in the same transaction, with the actor, the changed columns and before/after values.
- `sqlite/schema.sql` is the only schema source of truth. `pb_migrations/` is PocketBase's frozen history and is not applied to this database.
- PocketBase is retired from the default stack (behind the `legacy-pocketbase` Compose profile); the app does not read from it.

See [docs/architecture.md](docs/architecture.md), [docs/security-architecture.md](docs/security-architecture.md), [docs/deployment.md](docs/deployment.md), and [docs/release-checklist.md](docs/release-checklist.md).

## Stack

| Layer | Technology |
| --- | --- |
| Web | React 19, React Router 7.18, TypeScript, Vite 8.3 |
| UI | Tailwind CSS 4, shadcn/ui/Radix, Framer Motion, Lucide |
| Client data | TanStack Query over same-origin `/api` |
| Backend | React Router resource routes, better-sqlite3, TypeScript |
| Auth | Google OAuth, app-issued session cookie |
| Deployment | Docker Compose on Dokploy/Traefik |
| Edge | Cloudflare |

## Repository layout

```text
src/
  routes.ts                 explicit React Router route config
  root.tsx                  document shell, providers, global metadata, cache middleware
  routes/                   HTML/resource route modules, including /api/*
  server/                   application server: auth, authz, registration, payments,
                            attendance, certificates, notifications, collections
  server/public/            credential-free SSR readers (direct SQLite)
  server/http/              shared HTTP helpers and the public cache policy
  lib/db.server.ts          the single SQLite connection and statement cache
  lib/data/                 browser data modules (same-origin /api)
  components/               shared UI
  features/                 feature UI

sqlite/schema.sql           the only schema source of truth
scripts/migrate-pb-to-sqlite.ts   PocketBase -> SQLite cutover
scripts/ieee-backup-export.sh     database + uploads backup and restore
pb_migrations/              PocketBase's frozen history (rollback reference only)
pocketbase/Dockerfile       pinned PocketBase runtime image (rollback target)
Dockerfile                  app server build + Node 22 SSR runtime
docker-compose.yml          production/staging stack
tests/integration-db.mjs    repository + schema invariants against real SQLite
tests/integration-migrate.mjs  cutover migration against a PocketBase fixture
tests/e2e/                  browser/SSR/SEO tests
scripts/audit/              staging audit harness: fixtures, HTTP/API, admin routes, UI, axe
.opencode/skill/            project skills, including staging-audit and repo-docs
```

## Request ownership

`/api` belongs exclusively to the app server.

Normal record operations go through the policy-gated collection surface
(`/api/collections/:name`), which enforces an allow-list of collections and
fields and compiles a small filter grammar to bound parameters. Dedicated
command routes exist only for operations that need transactional or privileged
semantics, including:

- `POST /api/events/:id/register`
- `POST /api/events/:id/coupons`
- `POST /api/workspace/events/:id/workflow` (publish, unpublish, complete)
- `POST /api/admin/users/:id/role`

## Local development

Requirements: Bun 1.2.9+ and Node 22. No Docker is needed for the app itself —
it creates its own SQLite database on first request.

```bash
cp .env.example .env.local
bun install --frozen-lockfile
bun run dev
```

The app runs on `http://127.0.0.1:3000` by default and serves `/api` itself.
There is no proxy: a leftover proxy entry would shadow the app's own routes.

For another local port:

```bash
PORT=3100 bun run dev
```

The local database is created at `SQLITE_PATH` (default `./data/portal.db`) and
seeded from `sqlite/schema.sql` on first use. End-user authentication is Google
OAuth; password auth is not an application login path.

## Commands

```bash
bun run dev          # React Router/Vite development server
bun run build        # production web build
bun run start        # serve the built app
bun run lint         # ESLint
bun run typecheck    # React Router typegen + TypeScript
bun run check:docs   # README/docs links, stale claims, referenced commands
bun run test         # Vitest
bun run test:integration  # repository + schema invariants, and the cutover migration
bun run test:release-gate # compiled app + synthetic database, HTTP and browser gate
bun run test:e2e     # full Playwright Chromium suite (local; needs staging-shaped data)
scripts/audit/run-staging-audit.sh  # full audit of the deployed staging surface
```

The staging audit creates temporary rows and sessions, asserts the HTTP/API,
admin, UI and accessibility contracts, and removes them again. It never touches
production; see `.opencode/skill/staging-audit/SKILL.md`.

`test:integration` runs against real databases, not mocks: `tests/integration-db.mjs`
applies `sqlite/schema.sql` to a fresh file and exercises every repository method,
and `tests/integration-migrate.mjs` runs the PocketBase → SQLite migration against
a fixture that includes the data shapes staging never had.

## Database changes

Do not create one-off schema scripts or edit production first.

1. Change `sqlite/schema.sql`. It is idempotent, so a new table or index needs
   nothing else.
2. A change to an existing table (a type, a nullability, a CHECK) needs a forward
   step in `src/lib/db-migrate.server.ts` and a bump of `SCHEMA_VERSION` there.
   The existing database is upgraded in place; it is never rebuilt. See
   `docs/sqlite-migrations.md`.
3. Run `bun run test:integration` against a fresh database.
4. Run the change against a recent copy of production data before rollout.

`pb_migrations/` is PocketBase's frozen history. Do not add to it.

## Authorization model

Account roles are `user`, `chair`, `content`, and `admin`, stored on `users.role` for
compatibility. Workspace assignments use the capability roles Organizer,
Finance, Registration Staff, Check-in Staff, and Content Editor, with
branch/society/event scope. Historical role codes are retained as aliases;
directory titles do not grant permissions.

- Public users can read intentionally public records.
- Signed-in users can access their own protected records.
- Chairs are scoped to the societies they chair.
- Content editors have elevated editorial capabilities; the public blog product was removed on 2026-11-22.
- Admins have administrative access.
- Every write through the generic collection surface is audited, so an edit cannot hide behind the UI.
- User role changes go through the dedicated admin command; ordinary user record updates cannot change `role`.

Business invariants must remain correct when the React UI is bypassed. Put load-bearing checks in the schema constraints and the service modules that own each transition.

## Event registration

Registration is a transaction, not generic CRUD. One command validates the event/form/capacity/coupon, creates the registration and ticket/payment state, and updates counters, all inside a single SQLite transaction. If any step fails, no seat is reserved.

Admins can manually confirm an offline-verified pending payment through a dedicated command. The transition atomically marks it paid/confirmed, issues the ticket, records an audit marker, and queues the ticket and PDF receipt emails; generic record edits cannot forge the same state.

`registered_count` means active seat reservations (`pending + confirmed`). Cancelled registrations do not occupy capacity.

## SEO

Public content is server-rendered. Published events have immutable crawlable URLs under `/events/:slug`, canonical links, Open Graph/Twitter metadata, and Event JSON-LD. Production exposes dynamic sitemap/robots resources; non-production HTML responses emit `X-Robots-Tag: noindex, nofollow`.

## CI/CD

CI runs on every push and pull request:

- `checks` lints, typechecks, checks the docs, runs the unit suite and builds;
- `integration` runs `test:integration` against real databases;
- `release-gate` builds the app, seeds a synthetic database, refuses to start
  without it, and drives the compiled server over HTTP and in Chromium on
  loopback, with mail, payments and OAuth faked or disabled.

Pull requests into `main` and `main` pushes also build the arm64 container and
publish the web image once per commit tree (`GIT_COMMIT`/`GIT_TREE` build args).
The full browser suite is local (`bun run test:e2e`); PocketBase suites are run
by hand — see [docs/legacy-tooling.md](docs/legacy-tooling.md).

Production CD reacts only to successful CI on `main`. It verifies the tested SHA
is still `main`'s head, pins it to `deploy/production`, retags the image and
calls Dokploy, then verifies that `/healthz` reports the released build:

```text
main → CI → CD → Dokploy pulls ghcr.io/phloraxx/ieee-sahrdaya-web:production
                    → CD verifies /healthz fingerprint
```

Staging is not deployed by CI. It deploys from the machine you are working on:

```bash
./scripts/deploy-local.sh --staging
```

That deploys the commit you have checked out (committed, clean and pushed), runs
typecheck and the unit suite, builds with the worktree compose file, recreates
only `web`, and waits for `/healthz` to be ready and to report the commit it just
built. A `dev` push still runs CI, but deploys nothing.

`/healthz` is a readiness endpoint: it answers 503 when the database, the job
runner or the backup cadence is unhealthy, and it publishes a build fingerprint
so a deploy can prove which release is serving. See
[docs/deployment.md](docs/deployment.md#health-and-readiness).

The canonical deployment remains the Dokploy-managed `docker-compose.yml`; do not shadow a service with a manually created fallback container or temporary Compose file.

## Environment isolation

Production and staging must use different Compose projects, volumes, OAuth configuration, encryption keys, payment secrets, and domains. Never point staging at production `pb_data` or the production `portal.db`.

Dokploy routes everything to the app server:

- `/` and `/api` → `web:3000`

The app serves `/api` itself. Do not reintroduce a proxy for `/api`: it would
shadow the app's own routes, which is the dev-time mirror of the production
Traefik bypass that broke the cutover once already.

The PocketBase container stays on the private network as a rollback target and
must not be exposed through the public host.

## Release process

Normal promotion is `feature/release branch → dev → main`. Before a schema-sensitive release: deploy staging with `./scripts/deploy-local.sh --staging`, run `scripts/audit/run-staging-audit.sh`, get full CI green on the exact release candidate, verify enabled production integrations, take a fresh production backup with `scripts/ieee-backup-export.sh` and confirm it restores, review the `dev` → `main` diff, then deploy through the CI-gated `main` path. The audit harness and its expected baselines are documented in `.opencode/skill/staging-audit/SKILL.md`.

Use [docs/release-checklist.md](docs/release-checklist.md) as the release runbook.

## Contributor/agent contract

Read [AGENTS.md](AGENTS.md) before architectural, backend, deployment, or security-sensitive changes. Documentation changes follow `.opencode/skill/repo-docs/SKILL.md` and `node scripts/audit/check-docs.mjs`.

## License

© 2025–2026 IEEE Sahrdaya Student Branch. Proprietary — all rights reserved.
