<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya" src="./public/web.png" />

# IEEE Sahrdaya Student Branch

**Public website, event platform, certificate system, and administration tools for IEEE Sahrdaya.**

[Production](https://ieeesahrdaya.com)

</div>

## Architecture

The application deliberately has only two runtime services:

```text
Browser
  │
Cloudflare / Dokploy / Traefik
  ├── /*     → React Router v7 web container
  └── /api/* → PocketBase container

web ── private app-internal network ── PocketBase ── pb_data volume
```

- **React Router v7 Framework Mode** owns SSR, HTML routes, metadata/resource routes, and UI.
- **PocketBase 0.39.9** owns auth, SQLite data, files, API authorization, migrations, hooks, and custom transactional commands.
- The browser authenticates directly with PocketBase through same-origin `/api`.
- Public SSR reads use the private `pocketbase-internal` network alias.
- There is no React-side BFF and no runtime PocketBase superuser credential.
- `pb_migrations/` is the only schema/rule/index source of truth.

See [docs/architecture.md](docs/architecture.md), [docs/security-architecture.md](docs/security-architecture.md), [docs/deployment.md](docs/deployment.md), and [docs/release-checklist.md](docs/release-checklist.md).

## Stack

| Layer | Technology |
| --- | --- |
| Web | React 19, React Router 7.18, TypeScript, Vite 7 |
| UI | Tailwind CSS 4, shadcn/ui/Radix, Framer Motion, Lucide |
| Client data | PocketBase JS SDK, TanStack Query |
| Backend | PocketBase 0.39.9, SQLite, JS hooks/migrations |
| Auth | Google OAuth through PocketBase |
| Deployment | Docker Compose on Dokploy/Traefik |
| Edge | Cloudflare |

## Repository layout

```text
src/
  routes.ts                 explicit React Router route config
  root.tsx                  document shell, providers, global metadata
  routes/                   HTML/resource route modules
  server/public/            credential-free SSR PocketBase readers
  lib/data/                 browser PocketBase data modules
  components/               shared UI
  features/                 feature UI

pb_migrations/              complete baseline + incremental migrations
pb_hooks/                   authoritative backend invariants and commands
pocketbase/Dockerfile       pinned PocketBase runtime image
Dockerfile                  web build + Node 22 SSR runtime
docker-compose.yml          production/staging stack
docker-compose.local.yml    local PocketBase stack
tests/backend/              clean-room PocketBase integration suite
tests/e2e/                  browser/SSR/SEO tests
```

## Request ownership

`/api` belongs exclusively to PocketBase.

Normal record operations use PocketBase collections directly. Custom routes exist only for operations that need transactional or privileged semantics, including:

- `POST /api/app/events/:id/register`
- `PUT /api/app/events/:id/coupons`
- `POST /api/workspace/events/:id/workflow` (publish, unpublish, complete)
- `POST /api/app/admin/users/:id/role`

## Local development

Requirements: Bun 1.2.9+, Docker, and Docker Compose.

```bash
cp .env.example .env.local

docker compose -f docker-compose.local.yml up --build
bun install --frozen-lockfile
bun run dev
```

The web app runs on `http://127.0.0.1:3000` by default. Vite proxies `/api` to the local PocketBase instance on `127.0.0.1:8090`.

For another local port:

```bash
PORT=3100 bun run dev
```

Create the first local PocketBase superuser with the PocketBase CLI inside the container when needed. End-user authentication is Google OAuth; password auth is not an application login path.

## Commands

```bash
bun run dev          # React Router/Vite development server
bun run build        # production web build
bun run start        # serve the built app
bun run lint         # ESLint
bun run typecheck    # React Router typegen + TypeScript
bun run test         # Vitest
bun run test:e2e     # Playwright Chromium suite
```

Backend clean-room smoke test:

```bash
PB_BASE_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=... \
PB_SUPERUSER_PASSWORD=... \
python3 tests/backend/pocketbase_smoke.py
```

CI performs this against a newly created PocketBase database, not a long-lived development database.

## Database changes

Do not create one-off schema scripts or edit production first.

1. Add an incremental file to `pb_migrations/`.
2. Make it safe for both an existing database and a fresh database where applicable.
3. Update `202607200000_baseline_schema.js` when the field belongs in every new installation.
4. Run the migration against a disposable empty database.
5. Run `tests/backend/pocketbase_smoke.py`.

PocketBase applies committed migrations when the container starts.

## Authorization model

PocketBase account roles remain `user`, `chair`, `content`, and `admin` for
compatibility. Workspace assignments use the capability roles Organizer,
Finance, Registration Staff, Check-in Staff, and Content Editor, with
branch/society/event scope. Historical role codes are retained as aliases;
directory titles do not grant permissions.

- Public users can read intentionally public records.
- Signed-in users can access their own protected records.
- Chairs are scoped by PocketBase rules to societies they chair.
- Content editors own their blog posts.
- Admins have administrative access.
- User role changes go through the dedicated admin command; ordinary user record updates cannot change `role`.

Business invariants must remain correct when the React UI is bypassed. Put load-bearing checks in PocketBase rules/hooks/transactional routes.

## Event registration

Registration is a transaction, not generic CRUD. One PocketBase command validates the event/form/capacity/coupon, creates the registration and ticket/payment state, and updates counters. If any step fails, no seat is reserved.

Admins can manually confirm an offline-verified pending payment through a dedicated command. The transition atomically marks it paid/confirmed, issues the ticket, records an audit marker, and queues the ticket and PDF receipt emails; generic record edits cannot forge the same state.

`registeredCount` means active seat reservations (`pending + confirmed`). Cancelled registrations do not occupy capacity.

## SEO

Public content is server-rendered. Published events have immutable crawlable URLs under `/events/:slug`, canonical links, Open Graph/Twitter metadata, and Event JSON-LD. Blog posts use BlogPosting JSON-LD. Production exposes dynamic sitemap/robots resources; non-production HTML responses emit `X-Robots-Tag: noindex, nofollow`.

## CI/CD

CI runs full validation, fresh-PocketBase backend tests + Playwright, and both
container builds for pull requests into `dev`, final `main` pushes, and manual
runs. Merged `dev` pushes and `dev` → `main` pull requests use a lighter
validation gate instead of repeating the heavyweight integration jobs.

Production CD runs only after a successful CI workflow on `main`. It verifies the tested SHA is still the current `main` head, then calls:

```text
main → DOCKPLOY_WEBHOOK_PROD → production
```

Successful `dev` CI deploys the isolated staging project through the CI-gated
CD workflow. Never point `dev` at the production Compose/volume.

The canonical deployment remains the Dokploy-managed `docker-compose.yml`; do not shadow a service with a manually created fallback container or temporary Compose file.

## Environment isolation

Production and staging must use different Compose projects, volumes, OAuth configuration, encryption keys, payment secrets, and domains. Never point staging at production `pb_data`.

Dokploy should route:

- `/api` → `pocketbase:8090` without stripping the path
- `/` → `web:3000`

Do not expose PocketBase `/_/` through the public host.

## Release process

Normal promotion is `feature/release branch → dev → main`. Before future schema-sensitive releases, provision/use isolated staging, get full CI green on the exact release candidate, complete authenticated staging acceptance, verify enabled production integrations, take a fresh production PocketBase/files backup, review the `dev` → `main` diff, then deploy through the CI-gated `main` path.

Use [docs/release-checklist.md](docs/release-checklist.md) as the release runbook.

## Contributor/agent contract

Read [AGENTS.md](AGENTS.md) before architectural, backend, deployment, or security-sensitive changes.

## License

© 2025–2026 IEEE Sahrdaya Student Branch. Proprietary — all rights reserved.
