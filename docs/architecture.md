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
- payment and notification server integrations;
- bounded privileged diagnostics such as `/api/admin/data-health`, which returns derived issues/counts instead of exposing full operational collections to the browser.

The public hostname maps `/api` directly to PocketBase, so browser SDK calls remain same-origin.

PocketBase 0.39.9 is pinned in `pocketbase/Dockerfile`; hooks and migrations are baked into the image while `/pb/pb_data` is persistent.

## Request ownership

`/api/*` belongs to PocketBase.

React Router may expose HTML routes and framework resource routes outside the application API namespace, but it must not grow a parallel BFF that proxies ordinary PocketBase operations.

## CRUD versus commands

Use ordinary collection CRUD when one record operation naturally represents the intent. Examples include editing a society biography, listing events, or updating ordinary content metadata.

Use a PocketBase custom route when the operation is a command:

| Command | Why it is not ordinary CRUD |
| --- | --- |
| Event registration | capacity, coupon, ticket/payment state and counters commit together |
| Coupon set sync | multiple coupon records must reconcile atomically |
| User role change | ordinary users collection rule intentionally forbids role mutation |
| Manual payment confirmation | registration/payment state, ticket issuance, audit metadata, and notification outbox eligibility move together |

## Schema ownership

`pb_migrations/202607200000_baseline_schema.js` is the reproducible baseline. Later timestamped files are incremental migrations.

A fresh PocketBase data directory must become a usable backend using only committed migrations and hooks. CI proves this by starting a disposable clean database and running the backend smoke suite.

Do not add a parallel schema source such as a TypeScript superuser migration script.

## Authentication

The browser creates a same-origin PocketBase client. OAuth, token storage, and refresh belong to the PocketBase SDK. The web server does not mint or proxy an application session cookie.

SSR public reads never impersonate a user. Authenticated/admin data is loaded in the browser after PocketBase authorization.

PocketBase account roles are `user`, `chair`, `content`, and `admin` for
compatibility. Scoped workspace assignments expose the capability roles
Organizer, Finance, Registration Staff, Check-in Staff, and Content Editor;
historical role codes remain readable aliases.

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

Staging is provisioned as the isolated Dokploy Compose project `ieee-dev-staging` with its own `pb_data`, domain, encryption key, and disabled production integrations. It tracks the CI-approved `deploy/staging` ref and must never share production state or credentials.

## Deployment ownership

The canonical runtime source is the Dokploy-managed `docker-compose.yml` from the repository checkout.

Do not create a temporary Compose file or fallback container using the same Compose project/service name. Docker can then route traffic to a healthy but stale container while the canonical project appears correct on disk.

Source changes belong in Git/GitHub and are deployed through CI-gated CD. See `docs/deployment.md`.

## Branch deployment model

```text
main → CI → deploy/production → production
dev  → CI → deploy/staging    → staging
```

CD reacts only to successful CI on `main` or `dev`, verifies the tested SHA is still the branch head, pins that exact SHA to the matching immutable deployment ref, and then triggers the corresponding Dokploy webhook. Dokploy must deploy the pinned ref rather than mutable `main`/`dev`.

## Infinia showcase and independent Altair archive

Public SSR /infinia and /infinia/:year use curated src/lib/infinia.ts and src/lib/flagships.ts data and the scoped InfiniaShowcase component, independent of PocketBase. The hub ends with a newest-first, server-rendered Infinia/Altair timeline using FLAGSHIP_TIMELINE and canonical edition hrefs, also shared with the sitemap. Edition leaves retain their own year-specific content. Missing years return 404. Legacy /flagships, /flagships/infinia and valid Infinia edition paths issue 301 redirects to canonical showcase routes. /flagships/altair and its 2023/2022 leaves retain their existing archive.

Production sitemap lists only canonical Infinia URLs plus Altair URLs. Staging remains noindex. Local optimised media under public/media/infinia includes full-frame WebP images and a user-initiated WebM/VP9 film with an H.264 fallback with VTT descriptions. InfiniaHero and InfiniaScene render a three-film portrait introduction (Lantern Fest, RC car and flight) and three independent 2024 scenes on the hub/2024 leaf. Each scene has a server-rendered corresponding poster, heading, description and native skip link. The existing framer-motion dependency links frame transforms/progress to scroll; CSS adds short sticky spans only on desktop viewports at least 850px tall after motion enhancement is allowed. The hero renders three curved-seam panels with rainbow typography and a rounded CTA. On enhanced tall desktops its side panels open outward and the centre panel widens via object-fit reframing. Each separate chapter keeps full-stage footage and a modest inset reveal. Mobile hero panels retain all three stills but mount only the RC video; desktop mounts its two companion videos, controlled by the same active/visible/pause lifecycle. Reduced motion also disables spectrum and hover animation; forced colours restore system text and borders. Workshops use two-column photo-led layouts; programme days use three image-led columns. No media derivatives or new runtime dependencies were introduced. A passive, requestAnimationFrame-throttled viewport-centre check grants at most one stage playback. Sources mount lazily after entering a stage. Visibility, connection and reduced-motion changes suspend playback; manual pause persists; failed media retains the still. Videos play normally; no scroll seeking or input interception is used. Flight's time-update handler loops only the clear opening three seconds of the existing native 1080p SDR source. Robot football adds a metadata-free 1920×1080 WebM/H.264 derivative of the genuine 4K HLG original, tone-mapped to BT.709. The three other source videos are native 1080×1920 SDR derivatives. The actual shared Footer remains outside the Infinia wrapper. The full narrative highlights player remains user-initiated; the 2025 leaf uses exclusively its own photographs and no 2024 scenes.

No API, PocketBase schema/data mutation, registration, financial, notification or email pathway is introduced. Shared navigation alone gains INFINIA rainbow text; experience styling is scoped. Source provenance, privacy exclusions and Awwwards component mapping are recorded in docs/infinia-showcase-20261004.md.

Current component sequencing, reference review and performance/accessibility acceptance are recorded in docs/infinia-playful-20261005.md; the prior cinema, immersive and blue-canvas plans are historical.