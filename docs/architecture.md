# Architecture

## Runtime topology

```text
Internet
  │
Cloudflare
  │
Dokploy / Traefik
  │
  └── /* and /api/* ─► React Router app server :3000
                            │
                            ├── portal.db   (SQLite, WAL, bind mount)
                            └── uploads/    (bind mount)
```

There is one deployable service and two pieces of persistent state per
environment. The app server owns HTML, SSR, `/api/*`, authentication, file
serving, and the database.

A PocketBase container still runs on the private network as a **rollback
target**. The app server does not read from it and has no dependency edge to it.

## Web service

React Router v7 Framework Mode owns HTML routes, SSR loaders, metadata/resource routes, the React UI, and the `/api/*` namespace.

Public SSR loaders read SQLite directly through `src/server/public/*.server.ts`. Those queries encode the old PocketBase rules as `WHERE` clauses, so the rule that used to live in collection config now lives next to the query and there is no second path to the data.

The browser calls the same origin for everything. Authenticated and admin data is loaded in the browser and authorized per request by the app server.

The database is opened as one process-wide connection in WAL mode. better-sqlite3 is synchronous, so the event loop is the write queue — that is what makes a single connection faster than a pool, and it is also why the process must not be scaled to more than one replica.

## Application server

The app server owns:

- Google OAuth and the session cookie;
- authorization and capability checks (`src/server/authz/`);
- SQLite persistence, schema, indexes, constraints and triggers;
- file storage and serving (`/files/*`, `/api/uploads/*`);
- transactional commands (`withTransaction` in `src/lib/db.server.ts`);
- payment and notification integrations;
- bounded privileged diagnostics such as `/api/admin/data-health`, which returns derived issues and counts instead of exposing full operational collections.

Sessions are opaque random tokens in an HttpOnly `__Host-` cookie. Only the
sha256 of the token is stored, so logout is a `DELETE` and a database leak does
not hand out live sessions. The browser never holds a readable credential.

The PocketBase container is pinned at 0.39.9 in `pocketbase/Dockerfile` and keeps
`/pb/pb_data` persistent. It exists so the cutover can be reversed; it is not
part of the request path.

## Request ownership

`/api/*` belongs to the app server, served from `src/routes/api.*.ts`, which
dispatch into `src/server/*`.

There is no proxy for `/api`. A leftover proxy entry shadows the app's own
routes — that is the dev-time mirror of the production Traefik bypass that broke
the cutover once already.

## CRUD versus commands

Use ordinary collection CRUD when one record operation naturally represents the intent. Examples include editing a society biography, listing events, or updating ordinary content metadata.

Use a dedicated command route when the operation is a command:

| Command | Why it is not ordinary CRUD |
| --- | --- |
| Event registration | capacity, coupon, ticket/payment state and counters commit together |
| Coupon set sync | multiple coupon records must reconcile atomically |
| User role change | the collection surface intentionally forbids role mutation |
| Manual payment confirmation | registration/payment state, ticket issuance, audit metadata, and notification outbox eligibility move together |

## Schema ownership

`sqlite/schema.sql` is the reproducible baseline and the only schema source of
truth. It is idempotent: it creates missing objects and is re-applied at boot
when `PRAGMA user_version` is behind `SCHEMA_VERSION` in `src/lib/db.server.ts`.

It only creates. Altering an existing column — a type, a `NOT NULL` — needs a
real migration and a version bump will not do it. Plan for that before the first
such change, not during it.

A fresh database file must become a usable backend from `schema.sql` alone.
`tests/integration-db.mjs` proves it by applying the schema to a temp file and
exercising every repository method.

`pb_migrations/` is PocketBase's frozen history. Do not add to it.

## Authentication

The browser starts a Google OAuth flow at `/auth/google`; the server performs the
code exchange and sets an opaque session cookie. `AuthProvider` then calls
`/api/session` after hydration to learn who the user is.

That ordering is deliberate: it keeps the SSR document anonymous, which is what
lets `src/server/http/cache.ts` mark public pages as shared-cacheable. Rendering
user state into the document would make the cache unsafe and the page
uncacheable.

SSR public reads never impersonate a user. Authenticated/admin data is loaded in the browser and authorized per request by the app server.

Account roles are `user`, `chair`, `content`, and `admin`, stored on `users.role` for
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
- `portal.db` and uploads bind mounts;
- `APP_SECRET` (the OAuth state signing key);
- OAuth redirect/application configuration;
- payment/webhook secrets;
- public domain.

The app must not fall back to a production database path. Missing or incorrect
configuration is an error, not a reason to couple staging to production.

Staging is provisioned as the isolated Dokploy Compose project `ieee-dev-staging`
with its own data directory, domain, secrets, and disabled production
integrations. It tracks the CI-approved `deploy/staging` ref and must never share production state or credentials.

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

Production sitemap lists only canonical Infinia URLs plus Altair URLs. Staging remains noindex. Local optimised media under public/media/infinia includes full-frame WebP images and a user-initiated WebM/VP9 film with an H.264 fallback with VTT descriptions. InfiniaHero and InfiniaScene render a three-film portrait introduction (Lantern Fest, RC car and flight) and one independent 2024 robot-football scene using distinct footage on the hub/2024 leaf. Each scene has a server-rendered corresponding poster, heading, description and native skip link. The existing framer-motion dependency links frame transforms/progress to scroll; CSS adds short sticky spans only on desktop viewports at least 850px tall after motion enhancement is allowed. The hero renders three curved-seam panels with rainbow typography and a rounded CTA. On enhanced tall desktops its side panels open outward and the centre panel widens via object-fit reframing. Each separate chapter keeps full-stage footage and a modest inset reveal. Mobile hero panels retain all three stills but mount only the RC video; desktop mounts its two companion videos, controlled by the same active/visible/pause lifecycle. Reduced motion also disables spectrum and hover animation; forced colours restore system text and borders. Workshops use two-column photo-led layouts; programme days use three image-led columns. No media derivatives or new runtime dependencies were introduced. The route-scoped hero preloads a self-hosted Latin Bricolage Grotesque WOFF2 (display optical size 96, weight 600–800) with font-display:swap. Only hero titles use it; the hub renders lowercase through CSS while preserving its semantic heading. The included OFL licence and source README document provenance. The portrait sources are exclusive to the hero and are not repeated as follow-up chapters. A passive, requestAnimationFrame-throttled viewport-centre check grants at most one stage playback. Sources mount lazily after entering a stage. Visibility, connection and reduced-motion changes suspend playback; manual pause persists; failed media retains the still. Videos play normally; no scroll seeking or input interception is used. The hero flight panel's time-update handler loops only the clear opening three seconds of the existing native 1080p SDR source. Robot football adds a metadata-free 1920×1080 WebM/H.264 derivative of the genuine 4K HLG original, tone-mapped to BT.709. The three other source videos are native 1080×1920 SDR derivatives. The actual shared Footer remains outside the Infinia wrapper. The full narrative highlights player remains user-initiated; the 2025 leaf uses exclusively its own photographs and no 2024 scenes.

No API, PocketBase schema/data mutation, registration, financial, notification or email pathway is introduced. Shared navigation alone gains INFINIA rainbow text; experience styling is scoped. Source provenance, privacy exclusions and Awwwards component mapping are recorded in docs/infinia-showcase-20261004.md.

Current component sequencing, reference review and performance/accessibility acceptance are recorded in docs/infinia-playful-20261005.md; the prior cinema, immersive and blue-canvas plans are historical.