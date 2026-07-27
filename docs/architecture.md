# Architecture

## Runtime topology

```text
Internet
  │
Cloudflare
  │
Dokploy / Traefik
  ├── /api/* ────────────────► PocketBase :8090
  │                              │
  └── /* ─► React Router :3000 ──┘ private app-internal network
                                 │
                              pb_data
```

There are two deployable services and one persistent PocketBase data volume per environment.

## Web service

React Router v7 Framework Mode owns HTML routes, SSR loaders, metadata/resource routes, and the React UI. It does not own an application API namespace.

Public SSR loaders use an unauthenticated PocketBase client over `POCKETBASE_INTERNAL_URL`. This is only for data that PocketBase collection rules already permit publicly.

In Compose, that URL resolves through the private-network-only alias `pocketbase-internal`. Do not use the generic `pocketbase` service name for SSR: multiple Dokploy projects share `dokploy-network`, and Docker DNS service aliases can collide there.

The browser uses the same public origin for PocketBase SDK requests. Authenticated/admin data is loaded in the browser and remains subject to PocketBase authorization.

The web runtime never receives a PocketBase superuser credential.

## PocketBase service

PocketBase owns:

- Google OAuth sessions;
- collection authorization rules;
- SQLite persistence;
- file storage;
- schema migrations and indexes;
- request/model hooks;
- transactional custom commands;
- payment/live-score server integrations.

The public hostname maps `/api` directly to PocketBase, so browser SDK calls remain same-origin.

PocketBase 0.39.9 is pinned in `pocketbase/Dockerfile`; hooks and migrations are baked into the image while `/pb/pb_data` is persistent.

## Request ownership

`/api/*` belongs to PocketBase.

React Router may expose HTML routes and framework resource routes outside the application API namespace, but it must not grow a parallel BFF that proxies ordinary PocketBase operations.

## CRUD versus commands

Use ordinary collection CRUD when one record operation naturally represents the intent. Examples include editing a society biography, listing events, or changing non-financial FIFA match metadata.

Use a PocketBase custom route when the operation is a command:

| Command | Why it is not ordinary CRUD |
| --- | --- |
| Event registration | capacity, coupon, ticket/payment state and counters commit together |
| Coupon set sync | multiple coupon records must reconcile atomically |
| User role change | ordinary users collection rule intentionally forbids role mutation |
| FIFA bet | balance, ledger, bet and pool are one transaction |
| FIFA settlement | payouts, balances, ledgers, bets, markets and match result are one transaction |
| FIFA void | refunding a market/match is a financial state transition |
| Raffle draw | eligibility snapshot and selected result must be auditable |

## Schema ownership

`pb_migrations/202607200000_baseline_schema.js` is the reproducible baseline. Later timestamped files are incremental migrations.

A fresh PocketBase data directory must become a usable backend using only committed migrations and hooks. CI proves this by starting a disposable clean database and running the backend smoke suite.

Do not add a parallel schema source such as a TypeScript superuser migration script.

## Authentication

The browser creates a same-origin PocketBase client. OAuth, token storage, and refresh belong to the PocketBase SDK. The web server does not mint or proxy an application session cookie.

SSR public reads never impersonate a user. Authenticated/admin data is loaded in the browser after PocketBase authorization.

Application roles are `user`, `chair`, `content`, and `admin`.

## Public rendering and SEO

Searchable content has stable HTML routes, including:

- `/events/:slug`
- `/blog/:slug`
- `/societies/:slug`

Event slugs are backfilled for old records, generated on create, uniquely indexed, and immutable afterwards. Production generates dynamic sitemap/robots resources. Non-production document responses are `noindex, nofollow`.

## Environment isolation

Each deployed environment has separate:

- Dokploy Compose project;
- `pb_data` volume;
- `PB_ENCRYPTION_KEY`;
- OAuth redirect/application configuration;
- payment/webhook secrets;
- public domain.

The web container must not fall back to a production PocketBase hostname. Missing or incorrect internal routing is a configuration error, not a reason to couple staging to production.

After the 2026 rewrite production cutover, no isolated new-architecture staging Compose is currently assigned. `dev` remains an integration/CI branch until one is provisioned; it must not share the production Compose or production `pb_data`.

## Deployment ownership

The canonical runtime source is the Dokploy-managed `docker-compose.yml` from the repository checkout.

Do not create a temporary Compose file or fallback container using the same Compose project/service name. Docker can then route traffic to a healthy but stale container while the canonical project appears correct on disk.

Source changes belong in Git/GitHub and are deployed through CI-gated CD. See `docs/deployment.md`.

## Branch deployment model

```text
main → production
dev  → integration + CI only (staging deployment paused)
```

CI runs on both branches. CD currently reacts only to successful `main` CI and calls the production Dokploy webhook after verifying the tested SHA is still current.