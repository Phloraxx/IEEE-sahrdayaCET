# IEEE Sahrdaya — contributor and agent contract

This file is the operational contract for humans and coding agents working in this repository. Keep it aligned with the actual architecture and deployment workflow.

## Current architecture

- React 19 + React Router 7 Framework Mode
- TypeScript + Vite 7 + Tailwind CSS 4
- TanStack Query for browser-side query caching only
- PocketBase 0.39.9 for auth, data, files, API rules, hooks, migrations, and transactional commands
- Docker Compose on Dokploy/Traefik
- Cloudflare in front of the public domains

The application intentionally has only two runtime services: `web` and `pocketbase`.

## Non-negotiable boundaries

1. `/api/*` belongs to PocketBase. Do not add a React Router BFF/application API namespace.
2. Browser authentication uses the PocketBase JS SDK on the same public origin.
3. Public SSR reads use `src/server/public/*.server.ts` with an unauthenticated PocketBase client over `POCKETBASE_INTERNAL_URL`.
4. Never place a PocketBase superuser credential in the web runtime.
5. Ordinary single-record CRUD uses PocketBase collections directly. Use a custom PocketBase route only for a real transaction, privileged command, webhook, or server-only integration.
6. `pb_migrations/` is the only schema/rule/index source of truth. Do not add ad-hoc superuser migration scripts.
7. Financial, ticket, capacity, coupon, role, and check-in invariants must remain correct when the React UI is bypassed.
8. Staging and production databases, files, OAuth configuration, encryption keys, payment secrets, and domains are isolated.
9. Do not edit application source on the deployment host. Source changes go through Git/GitHub and the repository branch workflow.
10. Do not manually replace a Dokploy-managed service with a temporary Compose file or fallback image under the same Compose project/service name.

## Source-of-truth map

```text
src/routes.ts                 route ownership
src/root.tsx                  document shell/providers/global metadata
src/routes/                   React Router HTML/resource routes
src/server/public/            public credential-free SSR readers
src/lib/data/                 browser PocketBase data access
src/features/                 feature UI
src/components/               shared UI
pb_migrations/                schema/rules/index history
pb_hooks/                     backend invariants and custom commands
Dockerfile                    web build + Node 22 SSR runtime
pocketbase/Dockerfile         pinned PocketBase image
docker-compose.yml            production/staging service topology
.github/workflows/ci.yml      automated quality gates
.github/workflows/cd.yml      CI-gated Dokploy deployment trigger
```

## Routing and SSR

Route ownership is explicit in `src/routes.ts`.

Public content that should rank must be server-rendered and have a stable leaf URL. Published events use `/events/:slug`; event slugs are immutable after creation. Blogs and societies also have stable crawlable leaf routes.

Do not move authenticated/admin data into public SSR by introducing privileged server credentials. Authenticated/admin reads happen in the browser and are authorized by PocketBase.

## Backend change rules

Choose the enforcement layer by intent:

- API access control → PocketBase collection rules.
- Record/state-transition invariant → PocketBase request/model hook.
- Multi-record all-or-nothing operation → PocketBase custom route + `runInTransaction`.
- New field/collection/index/rule → timestamped migration in `pb_migrations/`.

Current transactional/privileged command areas include event registration, coupon sync, user role changes, payment confirmation, ticket/check-in operations, FIFA bets, settlement, voids, raffle operations, and server-side live-score integration.

When adding or changing a command, test the failure path as carefully as the success path. Partial writes are not acceptable.

## Authentication and roles

Application roles are:

```text
user
chair
content
admin
```

- `user` can access their own protected records plus public data.
- `chair` is scoped to societies they chair.
- `content` owns editorial blog records they create.
- `admin` has administrative access and privileged commands.

Generic user updates must not be able to change `role`; use the dedicated admin role command.

Google OAuth is the application login path. Password auth is not a normal end-user login flow.

## Registration/payment/check-in invariants

Treat event registration as a transaction, not generic CRUD.

A valid registration flow must keep capacity, coupon consumption, registration state, ticket/payment state, and counters coherent. Cancelled registrations must not occupy capacity or be resurrected by an unrelated payment callback. Check-in must validate the ticket/registration/event state and reject duplicates/invalid tickets.

Paid-event webhook handling must fail closed when its required secret is absent or invalid.

## WC Predict / FIFA invariants

WC Predict uses fake points only, but its economy is handled like financial state:

- bet placement is atomic;
- balance and ledger move together;
- settlement is explicit, admin-only, and idempotent;
- market/match void refunds exactly once;
- direct edits cannot bypass financial state-transition commands;
- live-score data is display-only and cannot settle balances automatically;
- test/reset behavior belongs in disposable environments, not production data.

See `FIFA-GAME.md` for the current game contract.

## UI and design expectations

Preserve the existing page-specific visual language instead of flattening the site into a generic component theme.

- Public IEEE surfaces use the IEEE blue/slate system and existing expressive typography/motion.
- The Events page intentionally uses playful handwritten annotations and editorial layouts.
- Admin surfaces use the scoped `.vh-admin` design system.
- FIFA/WC Predict uses the dedicated `.fifa-theme` treatment.
- Respect `prefers-reduced-motion`.
- Do not make critical information hover-only or color-only.
- Keep touch targets usable on mobile.

See `DESIGN.md` for the current design contract.

## Important commands

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

Local backend/web:

```bash
docker compose -f docker-compose.local.yml up --build
PORT=3000 bun run dev
```

## Testing contract

A change is not complete until it can survive a fresh PocketBase database.

CI creates a disposable PocketBase instance, applies all committed migrations/hooks, runs `tests/backend/pocketbase_smoke.py`, installs Playwright Chromium, exercises browser E2E, and builds both production Docker images.

Put backend authorization and transaction assertions in the clean-room backend suite. Browser E2E should cover SSR/navigation/SEO/guards and user-visible integration behavior.

For regressions found on staging, add a test when practical before declaring the fix complete.

## Branch and deployment contract

CI runs on pushes to `main` and `dev`, and on pull requests/manual dispatch.

Production CD is triggered only by a successful `CI` workflow run on `main`. It verifies that the tested SHA is still the branch head, then calls the production Dokploy webhook.

Current post-cutover branch model:

```text
main → production deployment
dev  → integration + CI only
```

`dev` must not deploy into the production Compose project. Automatic dev deployment stays disabled until a separate new-architecture staging Compose project, volume, domain, OAuth configuration, and secrets are provisioned.

Required production deployment secret:

```text
DOCKPLOY_WEBHOOK_PROD
```

`DOCKPLOY_WEBHOOK_DEV` is not used while staging deployment is paused.

Because CD uses `workflow_run`, the trigger workflow must also exist on the repository default branch. Do not replace this with an independent auto-deploy path that can deploy untested pushes.

The Dokploy production project must track `main`. The deployment webhook is a CI-approved trigger; it is not an immutable SHA image deployment.

## Environment and container safety

The canonical deployment is `docker-compose.yml` from the Dokploy project checkout.

The web service should resolve PocketBase internally as:

```text
http://pocketbase-internal:8090
```

The explicit alias is important because multiple Dokploy projects share the proxy network and generic Docker service aliases can collide.

If staging or production serves stale code, inspect running container provenance before changing application code. A container created from a temporary Compose file can shadow the canonical service even when it is healthy.

Never point staging at the production `pb_data` volume.

## Production release gate

Do not call a release production-ready only because public routes return 200.

Before future production releases:

1. promote accepted work through `dev` and review the `dev` → `main` production diff;
2. provision/use an isolated staging environment before schema-sensitive or authenticated acceptance work;
3. resolve any `main`/`dev` divergence intentionally in the production PR;
4. get full CI green on the exact release candidate;
5. complete authenticated staging acceptance for admin CRUD, registration/payment/ticket/check-in, coupons, blogs, societies/users, and FIFA flows;
6. verify enabled production integrations and OAuth configuration;
7. take a fresh production PocketBase/files backup;
8. merge to `main` and let CI-gated CD deploy;
9. perform post-deploy health, public-route, login, and safe authenticated checks.

See `docs/release-checklist.md` for the detailed procedure.

## Documentation contract

Architecture, security, deployment, and product behavior changes are incomplete until the relevant documentation is updated in the same branch.

Primary docs:

- `README.md`
- `AGENTS.md`
- `DESIGN.md`
- `PRODUCT.md`
- `FIFA-GAME.md`
- `docs/architecture.md`
- `docs/security-architecture.md`
- `docs/deployment.md`
- `docs/release-checklist.md`

Do not commit secrets, production credentials, private backup locations, or temporary server workarounds into documentation.