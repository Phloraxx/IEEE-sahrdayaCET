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
  └── /* ─► React Router :3000 ──┘ private network
                                 │
                              pb_data
```

There are two deployable services and one persistent volume.

### Web service

React Router v7 Framework Mode owns HTML routes, SSR loaders, metadata, resource routes, and the React UI. It does not own an application API namespace.

Public SSR loaders use an unauthenticated PocketBase client over `POCKETBASE_INTERNAL_URL`. This is only for data that PocketBase rules already permit publicly.

### PocketBase service

PocketBase owns:

- Google OAuth sessions
- collection authorization rules
- SQLite persistence
- file storage
- schema migrations and indexes
- request/model hooks
- transactional commands
- payment/live-score server integrations

The public hostname maps `/api` directly to PocketBase, so browser SDK calls remain same-origin.

## CRUD versus commands

Use ordinary collection CRUD when one record operation naturally represents the intent. Examples: editing society biography, listing events, changing non-financial FIFA match metadata.

Use a PocketBase custom route when the operation is a command:

| Command | Why it is not ordinary CRUD |
| --- | --- |
| Event registration | capacity, coupon, ticket/payment state and counters commit together |
| Coupon set sync | multiple coupon records must reconcile atomically |
| User role change | ordinary users collection rule intentionally forbids role mutation |
| FIFA bet | balance, ledger, bet and pool are one transaction |
| FIFA settlement | payouts, balances, ledgers, bets, markets and match result are one transaction |
| FIFA void | refunding a market/match is a financial state transition |

## Schema ownership

`pb_migrations/202607200000_baseline_schema.js` is the reproducible baseline. Later timestamped files are incremental migrations. A fresh PocketBase data directory must become a usable backend using only committed migrations and hooks.

Do not add a parallel schema source such as a TypeScript superuser migration script.

## Authentication

The browser creates a same-origin PocketBase client. OAuth, token storage and refresh belong to the PocketBase SDK. The web server does not mint or proxy an application session cookie.

SSR public reads never impersonate a user. Authenticated/admin data is loaded in the browser after PocketBase authorization.

## Public rendering and SEO

Searchable content has stable HTML routes:

- `/events/:slug`
- `/blog/:slug`
- `/societies/:slug`

Event slugs are backfilled for old records, generated on create, uniquely indexed, and immutable afterwards. Production generates dynamic sitemap/robots resources. Staging HTML is `noindex, nofollow`.

## Environment isolation

Each environment must have separate:

- Compose project
- `pb_data` volume
- `PB_ENCRYPTION_KEY`
- OAuth redirect/application configuration
- payment/webhook secrets
- public domain

The web container never falls back to a production PocketBase hostname. Missing production `POCKETBASE_INTERNAL_URL` is a startup/programming error.
