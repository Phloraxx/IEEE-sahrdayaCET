# Deployment

## Runtime images

### Web

The web image installs and builds with Bun 1.2.9. The final SSR runtime is Node 22 Alpine.

Node is intentional: runtime smoke testing showed that serving React Router SSR under Bun selected React DOM's Bun server build, which did not provide the stream API expected by `@react-router/serve`.

### PocketBase

`pocketbase/Dockerfile` pins PocketBase 0.39.9, supports amd64/arm64, and verifies the downloaded release archive by SHA-256 before extraction.

Hooks and migrations are baked into the image. Only `/pb/pb_data` is persistent.

PocketBase is **retired from the default stack** (2026-11-23). The live site runs
entirely on the app server and its SQLite database. The service stays defined in
`docker-compose.yml` behind an explicit Compose profile, so the `pb_data` volume
keeps a definition and the old API can be brought back on purpose, but it does
not start with a normal deploy:

```text
docker compose --profile legacy-pocketbase up -d pocketbase
```

Nothing routes to it, the app server does not read from it, and it takes no mail
or payment: its `SMTP_*` and `PAYGATE_*` values are inherited from the same
environment file, but no traffic reaches its hooks. Two details matter:

- **No healthcheck.** PocketBase 0.39 has no `/api/health` route, so the old probe docs:retired-ok
  reported it unhealthy from the first tick. "The container runs" is the only
  meaningful signal, and the watchdog checks that only when
  `IEEE_PB_CONTAINER` names it. docs:retired-ok
- **Legacy-only secrets are optional in the tracked file.** Compose interpolates
  every service during `config`, including one behind a profile that will not
  start, so `${PB_ENCRYPTION_KEY:?…}` there would break a normal deploy on a host
  that no longer has the variable. A deliberate start goes through
  `docker-compose.legacy-pocketbase.yml`, which requires the original key.
  PocketBase 0.39.9 starts with an empty key and then has no at-rest encryption
  (verified against the pinned binary), so that override is a real guard rail,
  not ceremony.

The volume key is unchanged, so the existing `<project>_pb_data` volume and its
archive names are preserved. Do not remove the service or the volume as a side
effect of a documentation or compose tidy-up.

**A rollback does not mean switching back to PocketBase.** Its data has been
frozen since the cutover, so returning traffic to it would strand every write
made since. See **Rollback** below.
documentation change.

## Dokploy Compose projects

Production and staging are separate Dokploy Compose projects built from `docker-compose.yml`.

Required environment values:

```text
DEPLOY_ENV=production|staging
SITE_URL=https://...
SITE_HOST=ieeesahrdaya.com|staging.ieeesahrdaya.com
ROUTER_KEY=ieee-production-web|ieee-staging-web
SQLITE_DATA_DIR=/srv/ieee/data
UPLOADS_HOST_DIR=/srv/ieee/data/uploads
PB_ENCRYPTION_KEY=<32-character high-entropy key>
CERTIFICATE_RENDER_CAPABILITY_KEY=<32+ character high-entropy key, unique per environment>
```

`SITE_HOST` and `ROUTER_KEY` are consumed by `docker-compose.yml`, not by the
app. Both are required (`${VAR:?…}`), so a deploy missing either fails before
anything starts instead of routing the wrong host. `SQLITE_DATA_DIR` and
`UPLOADS_HOST_DIR` are the host paths bind-mounted into the web container.

The app server also requires:

```text
APP_SECRET=<openssl rand -base64 48>
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APP_URL=https://<same host as SITE_HOST>
ALLOWED_ORIGINS=https://<same host as SITE_HOST>
SQLITE_PATH=/app/data/portal.db
UPLOADS_DIR=/app/data/uploads
```

Optional backend integrations are configured only where enabled:

```text
PAYGATE_URL
PAYGATE_API_KEY
PAYGATE_WEBHOOK_SECRET
PAYGATE_REGISTRATION_GRACE_SECONDS
PAYGATE_WEBHOOK_TOLERANCE_SECONDS
PAYGATE_CLIENT_NAMESPACE

FOOTBALL_DATA_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```
`PAYGATE_WEBHOOK_TOLERANCE_SECONDS` defaults to 300 seconds and is capped at
900 seconds by the runtime. `PAYGATE_URL` must be HTTPS except for loopback
or `host.docker.internal` fake-provider endpoints used by local/CI tests.

Never reuse a production encryption key, OAuth application, payment secret, SMTP credential, or `pb_data` volume in staging.

### Staging integration isolation

The rule above is enforced where it can be, and left as an operator action where
this repository cannot reach.

**Enforced in code** (`src/server/integrations.server.ts`, applied at boot):

- **PayGate.** Paid registration initiation requires `PAYGATE_SANDBOX=true`.
  Without it every environment refuses initiation; the reason appears in
  `/admin/data-health` and in the boot log as `[boot] integrations: paygate=blocked`.
  There is no way for the runtime to tell a live endpoint from a sandbox one by
  looking at it, so this is a declaration, not a heuristic. A staging stack that
  inherited a production `.env` therefore cannot create real payment sessions;
  the webhook route still verifies and parks money, it never initiates.
- **Mail.** `live` was already refused outside `DEPLOY_ENV=production`; the
  `allowlist` and `redirect` modes rewrite the recipient and add a TEST banner.
  The guard additionally reports a staging stack whose mail transport is
  configured with a non-`disabled` mode, so an inherited relay is visible rather
  than assumed harmless.

**Not enforced here, and left for the operator** (no credential was read,
changed, rotated or probed while writing this):

1. Staging has its own PayGate sandbox merchant, API key and webhook secret in
   `/etc/dokploy/compose/ieee-dev-staging/code/.env`, and `PAYGATE_SANDBOX=true`
   referring to it. Until then staging simply has no paid flow.
2. Staging has a disposable SMTP relay and credentials of its own, with
   `MAIL_DELIVERY_MODE` set to `disabled` or `allowlist` (one or two operator
   inboxes).
3. Staging Google OAuth is a separate client with only the staging redirect URI.
   Today the same client serves both hosts; tightening it needs the Google
   console and stays an operator step.
4. Rotation of any credential that was ever shared between the two environments.

Each of these is a change to the Dokploy staging environment file or a provider
console, not to the repository. Production is unaffected: its configuration is
unchanged by this section, and the guard never contacts a provider.

## Outbound mail

Ticket, receipt and certificate email is sent by the app server through the
shared mail worker (`src/server/mail`). PocketBase is no longer in the path.

The relay is Google Workspace: `smtp.gmail.com:587`, STARTTLS, the full Gmail
address as `SMTP_USERNAME`, and a Google App Password as `SMTP_PASSWORD`.
Keeping the relay means Google still signs the messages, so SPF and DKIM do not
change.

The safety policy is the same one PocketBase enforced:

| `MAIL_DELIVERY_MODE` | Behaviour |
| --- | --- |
| unset / `disabled` | nothing is transmitted; queued rows stay pending |
| `allowlist` | only addresses in `MAIL_ALLOWLIST`, with a TEST banner |
| `redirect` | everything goes to `MAIL_REDIRECT_TO`, banner names the intended recipient |
| `live` | real delivery, only when `DEPLOY_ENV=production` |

`live` outside production is refused, not treated as permission. Staging should
use `allowlist` with one or two operator inboxes.

Delivery is driven by the app's own job runner (see **Scheduled work** below),
never inside the request that queued the row. `scripts/send-notifications.ts`
remains for a manual pass or a one-off probe.

The worker claims a row with a conditional `UPDATE`, sends it, and records
`sent` or `failed` with the exact error. Transient failures retry with backoff
(1m, 5m, 15m, 1h, 3h, 6h) up to 8 attempts; a revoked credential, a finished
event or a missing transport fails once and stops. Gmail accepts roughly 2,000
messages a day on Workspace (500 on consumer Gmail); one pass sends 25, so a
131-recipient batch drains over a few minutes without hammering the relay.

The admin **Send & delivery** panel reports the mode, the resolved recipient and
the SMTP host. A successful handoff means the relay accepted the message — not
that the inbox delivered it.

Before enabling live mail, confirm DKIM, return-path SPF/MX and DMARC are
published for the sending domain. Start DMARC monitoring with
`v=DMARC1; p=none;`, then tighten once legitimate traffic aligns.

## Scheduled work

The web process owns its clock (`src/server/jobs/scheduler.server.ts`); there is
no host cron entry. Every wall-clock minute it runs whatever is due:

| Job | Cadence | What it does |
| --- | --- | --- |
| Notification outbox | every minute, 25 rows | sends due ticket / receipt / certificate mail |
| Payment expiry | every minute | releases seats whose payment window closed |
| Session pruning | hourly | deletes expired session rows |
| Backup | daily (24h since the newest archive) | `VACUUM INTO` + uploads archive, rotated |
| Maintenance | weekly | `PRAGMA optimize` + a WAL checkpoint |

Why in-process: the timer ships with the app, reads the same environment and
cannot drift from the schema. The cost is a **single-instance assumption** — the
compose stack runs one web container. If it is ever scaled, the outbox claim and
lease still prevent duplicate sends; backups would run in each replica, so scale
only after moving the runner out.

Rules the runner follows:

- no overlapping ticks; the next wake is scheduled after the previous one ends,
  aligned to the minute boundary;
- a restart delays a job rather than skipping it (`isDue` compares against the
  last run or the newest archive on disk);
- a failed backup retries after an hour, not every minute;
- queued mail is capped at `MAIL_DAILY_LIMIT` over a rolling 24 hours, because
  Gmail's quota is per account and shared with every other client;
- `GET /healthz` reports whether the runner is ticking (see **Health and
  readiness** below), not just whether the process answers.

Backups are written to `BACKUP_DIR` (mounted from `BACKUP_HOST_DIR`) as
`ieee-<env>-<timestamp>.tar.gz` containing `portal.db`, `manifest.json` and the
uploads tree, keeping `BACKUP_KEEP` archives.

Two operator commands use the same code as the runner:

```text
npx tsx scripts/backup-now.ts                                   take one now
npx tsx scripts/restore-backup.ts --archive <file> --to <dir>    rehearse a restore
```

`restore-backup.ts` extracts into an empty directory and verifies the restored
file: `integrity_check`, `foreign_key_check`, table count, schema version,
database bytes and uploads count against the manifest. Exit 0 means the archive
is materialisable and complete. It never touches live data.

To restore for real: stop the app, restore into a scratch directory, compare the
per-table row counts and the uploads checksums with the live data, then swap
`portal.db` and the uploads directory and start the app. A snapshot already
reports `PRAGMA integrity_check`, so a failed copy is never mistaken for a
backup.

`scripts/ieee-backup-export.sh` stays for the pre-cutover PocketBase volume and
for offsite copies; once the SQLite deployment is live, the in-app archive is the
primary one.

## Health and readiness

There is one health endpoint, `GET /healthz`. It answers **readiness**, not
liveness, and it is the same document for every caller: Docker's healthcheck, the
external probe in `.github/workflows/production-health.yml`, `scripts/deploy-local.sh`
and CD's post-deploy verification.

```json
{
  "ok": true,
  "status": "ok",
  "service": "web",
  "environment": "production",
  "build": "6c16dac29dd1f57d",
  "checks": { "database": "ok", "jobs": "ok", "backups": "ok", "identity": "ok" },
  "degraded": false,
  "renderCache": { "entries": 3, "bytes": 41210 },
  "at": "2026-11-24T14:16:57.830Z"
}
```

HTTP 200 when `ok` is true, **503** otherwise, always `Cache-Control: no-store`.
The body carries status, the environment, a 16-character build fingerprint, one
status per check, a `degraded` flag and the public cache's size. It carries no
path, host, error string, stack, record count, cache hit/miss counters or commit
SHA: the reasons live in the admin **data health** page
(`readinessReport()` in `src/server/readiness.server.ts`), which requires a
session with `reports.view`.

### Only minimum viable service closes the site

A recoverable side job must never take the deployment out of rotation. A stale
backup, a paused runner or a failed mail pass is a real problem, but the public
site, the admin workspace and every read and write that does not need that job
still work. Marking the container unhealthy would restart it, stop the very runner
that retries, and turn a fixable issue into an outage.

| Check | Role | `fail` when |
| --- | --- | --- |
| `database` | readiness | `SELECT 1` on the app's own connection throws (unwritable `-wal`, locked file, corrupt database) |
| `schema` | readiness | only when a caller supplies a schema probe; `/healthz` does not — `ensureSchema()` in `src/lib/db.server.ts` already refuses to serve a database it cannot bring to this build's version |
| `identity` | readiness when the build has a tree; diagnostic when it does not | never for a source build; it is reported as a warning instead |
| `jobs` | diagnostic | the runner is expected in this process and has not ticked for 15 minutes |
| `backups` | diagnostic | an archive exists but the newest is older than 36 hours (absent is `ok`: a fresh copy has none yet) |

Anything in the diagnostic role appears in `checks` and sets `degraded: true`,
and it is alerted on by the watchdog and listed by the admin page — but it never
changes the HTTP status. On fresh startup the runner has not ticked and there is
no archive yet; that is normal and the site serves immediately. On staging with
`JOBS_ENABLED=0` the `jobs` check is `ok` ("not enabled in this process"), because
jobs off is a configuration, not a fault.

The rule was tightened on 2026-11-24 after review: an earlier version failed
readiness for a stale backup, which would have closed a healthy site over a
fixable, recoverable condition.

Before 2026-11-24 `/healthz` answered `{ ok: true }` unconditionally, so a green docs:retired-ok
healthcheck proved only that Node was alive. That is why a deployment could look
healthy while every write failed.

### Build identity

A deployment should be able to say what it is
(`src/server/build-identity.server.ts`):

- `Dockerfile` bakes `GIT_COMMIT`, `GIT_TREE` and `GIT_BUILT_AT` into
  `/app/build/git-{commit,tree,built-at}` as build args. They come from the
  checkout being built, never from `/app/.git` (the runtime image has none).
- The app prefers the same three values from its environment (Compose passes them
  through) and falls back to the baked files, so a bare `docker compose up` on a
  labelled image still knows what it is.
- All three are optional. A build without a tree reports `source`; nothing claims
  a release it cannot prove.

**The fingerprint is tree-only: `sha256("ieee-tree\0<tree>")`, first 16 hex.**

The commit is deliberately excluded. A GitHub release PR merges to a **merge
commit** whose SHA differs from the head CI tested, while the tree — and therefore
the image — is identical. A fingerprint over commit+tree would therefore differ
between a correct PR image and the merge commit that deploys it, and fail a
healthy release. The tree is the only value that survives squash, rebase and
merge, so it is the only one a deploy gate can compare.

A build with a commit but no tree publishes `build: ""` rather than a value no
gate can match: "unverifiable" must not look like "wrong". `identity.kind` on the
admin page tells the two apart. The environment is excluded, so one image promoted
between environments keeps its identity.

The full identity, including commit, tree and the image digest when supplied, is on
the admin data-health page. To read it from a running container without touching
data:

```bash
docker exec ieee-rewrite-i9ir8q-web-1 cat /app/build/git-commit
docker exec ieee-rewrite-i9ir8q-web-1 cat /app/build/git-tree
```

### Verifying a deploy

A Dokploy webhook `200` means `docker compose up` ran, not that the origin serves
the tested commit. Both deploy paths therefore verify the build:

| Lane | Where |
| --- | --- |
| Production CD | `cd.yml` step **Verify the deployed build is the tested release**: polls `/healthz` for up to 300 s until `ok` is true and `build` equals the fingerprint of the tested SHA's commit and tree |
| Staging / break-glass | `scripts/deploy-local.sh`: prints the container's image, creation time and baked commit, then the same fingerprint comparison |

Both compare against the **tree of the image CI actually published**, not the
commit main happens to point at:

| Lane | Expected tree comes from |
| --- | --- |
| Production CD | the `tree-<tree>` tag's own `ieee.tree` label, resolved from the registry; the commit's git tree is a checked fallback for older images, and a mismatch between label and tag aborts the deploy |
| Staging / break-glass | `git rev-parse HEAD^{tree}` of the checkout being built, which is exactly what the build args received |

A green gate therefore means the origin serves the image CI built, even when the
deployed commit is a merge commit whose SHA differs from the one CI tested. It
fails when the origin is ready but reports a different tree — a stale, replaced or
misrouted container — or serves a build with no tree at all. Rolling back is a
deploy of an earlier `deploy/production` commit, not a restore of a container.

## Render cache

The public pages on the allow-list in `src/server/http/cache.ts` are cached in
process for `RENDER_CACHE_TTL_SECONDS` (default 45). This exists because the
events listing costs ~82 ms of CPU per render, which caps one Node process at
~13 req/s regardless of concurrency; a cache hit is a string copy and measured
120–160 req/s on the same box.

The cache stores the rendered HTML, the CSP nonce it was rendered with, and the
response headers. On a hit the nonce is rewritten to a fresh one and the policy
is recomputed, so every response still carries a unique nonce and its scripts
stay authorised; an entry whose nonce cannot be found is ignored rather than
served. A request with the session cookie, a query string, a non-allow-listed
path, a non-200 status or a `Set-Cookie` header is never stored or served from it.

`X-Render-Cache: hit|miss` on the response, `renderCache` in `/healthz`
(entries and bytes) and the admin data-health page (entries, bytes, hits, misses,
evictions) make it measurable. Bounds: `RENDER_CACHE_MAX_ENTRIES` (50) and
`RENDER_CACHE_MAX_BYTES` (32 MB); 0 disables. Only the size is public: the
counters describe traffic. An admin change appears on the public site within the
TTL.

This is complementary to the edge cache, not a replacement: `s-maxage=60` still
lets Cloudflare absorb the traffic spike, and the render cache keeps the origin
fast on the misses.

### Edge cache (Cloudflare)

The zone has one Cache Rule, scoped by host, that marks the public documents
eligible for the edge:

- **Edge TTL:** respect origin (`s-maxage=60`).
- **Browser TTL:** bypass. This is not optional: the zone default is four hours,
  and Cloudflare otherwise rewrites the header to `max-age=14400`, so a browser
  would keep a page for hours. The origin deliberately sends no `max-age`:
  Cloudflare's edge TTL reads `s-maxage`, and `max-age=0` would make every edge
  entry expire immediately.
- **Excluded paths:** `/api/`, `/admin`, `/auth/`, `/files/`, `/ticket/`, `/c/`,
  `/my-events`, `/register`, `/payment`, `/verify`, `/healthz`, `.data`
  requests, any query string, and any request carrying `__Host-ieee_session`.

It is currently scoped to `next.ieeesahrdaya.com` for the rehearsal; add the
production host when the SQLite deployment is live. With the rule in place a
sustained 500-request run reached 232 req/s through the edge while the origin
rendered three documents.

## Routing and networks

The app server owns the public host: React Router serves the pages **and**
`/api/*` from the same process. One Traefik router per environment:

```text
Host(`<SITE_HOST>`) → web:3000
```

The router is declared as labels in `docker-compose.yml` and keyed by
`ROUTER_KEY`, so the same file deploys to both environments without carrying a
hostname across branches. The PocketBase service is retired behind a profile and
**carries no router**: a `/api` router there would compete with the web router
for the same paths, and it does not run by default. Do not move the router to
PocketBase as a rollback: its data is frozen at the cutover (see **Rollback**).

Do not publish application host ports from Compose. Public `/_/` is an IEEE-owned
OAuth completion route; never map it to PocketBase or expose the PocketBase
administration UI through a public hostname.

The web service joins Dokploy's proxy network, the private `app-internal`
network (kept for the legacy profile) and the Compose `default` network.

Do not publish application host ports from Compose. Public `/_/` is an IEEE-owned
OAuth completion route; never map it to PocketBase or expose the PocketBase
administration UI through a public hostname.

The web service joins Dokploy's proxy network, the private `app-internal`
network (still shared with PocketBase for rollback) and the Compose `default`
network.

`ALLOWED_ORIGINS` must list the public origin, and `APP_URL` must be the same
origin; the OAuth redirect URI is `${APP_URL}/auth/google/callback`.


Cloudflare terminates public HTTPS for the current hosts and forwards to the matching Traefik HTTP router. Do not enable an origin redirect that sends Cloudflare back to the same HTTPS URL; that creates a redirect loop.

## Security controls

**Headers.** Every document response carries `Strict-Transport-Security:
max-age=31536000`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` and a restrictive
`Permissions-Policy`. The CSP is nonce-based and built per response in
`entry.server.tsx`. HSTS is sent regardless of `DEPLOY_ENV` (browsers ignore it
over plain HTTP), so a missing or misspelt deploy environment cannot drop the pin.

**Cross-site mutations.** `ALLOWED_ORIGINS` is enforced on every non-GET request
that carries an `Origin`: same-origin and listed origins pass, anything else
(including `Origin: null`) is a 403 before the rate limiter runs. A request with
no `Origin` is allowed because no browser can attach the `SameSite=Lax` session
cookie to it; the PayGate webhook relies on its signature instead.

**Uploads.** The stored type is sniffed from the file's magic bytes and must match
the declared MIME type. PNG, JPEG, WebP and GIF are accepted; SVG and HTML are
rejected even when declared as `image/png`, so librsvg never sees browser-uploaded
markup.

**Collection visibility.** `/api/collections/*` applies publication state, not
only deletion: events are public only when published/completed, societies only
when not hidden, and execom `email`/`phone` are omitted. Staff
with the matching capability (or an assignment scoped to the row) see the full
set; a legacy `chair` keeps their own societies through `society_chairs`.

**Workspace.** `/admin` requires `workspace.view`, not merely a session: an
ordinary member gets a 403, not the admin shell.

**CPU-heavy routes.** `/files/*?w=` resizing runs behind a two-slot gate with a
bounded queue and a 90/minute per-IP allowance; a full queue answers 429 rather
than joining an unbounded wait. Certificate rendering keeps its 30/minute rule.

## Environments

### Production

```text
branch: main
host:   https://ieeesahrdaya.com
app:    ieee-rewrite-i9ir8q
volume: ieee-rewrite-i9ir8q_pb_data (frozen; legacy profile only)
```

Compose environment:

```text
ROUTER_KEY=ieee-rewrite-i9ir8q-99-web
SITE_HOST=ieeesahrdaya.com
SQLITE_DATA_DIR=/home/drvij/ieee-production-data
UPLOADS_HOST_DIR=/home/drvij/ieee-production-data/uploads
APP_URL=https://ieeesahrdaya.com
ALLOWED_ORIGINS=https://ieeesahrdaya.com
```

Production uses production-only OAuth/integration configuration and must never consume staging data or secrets.

### Staging/development

```text
branch: dev
host:   https://staging.ieeesahrdaya.com
app:    ieee-dev-staging
volume: ieee-dev-staging_pb_data (frozen; legacy profile only)
```

Staging is a separate Dokploy environment and Compose project. Its code is
deployed from the operator's worktree with `./scripts/deploy-local.sh --staging`;
the Dokploy checkout supplies the environment file and keeps the Compose project
identity. A `dev` push only runs CI. It uses:

```text
DEPLOY_ENV=staging
SITE_URL=https://staging.ieeesahrdaya.com
ROUTER_KEY=ieee-dev-staging-106-web
SITE_HOST=staging.ieeesahrdaya.com
SQLITE_DATA_DIR=/home/drvij/ieee-staging-data
UPLOADS_HOST_DIR=/home/drvij/ieee-staging-data/uploads
APP_URL=https://staging.ieeesahrdaya.com
ALLOWED_ORIGINS=https://staging.ieeesahrdaya.com
```

`ROUTER_KEY` and `SITE_HOST` are required by `docker-compose.yml`. A deploy
that is missing either fails before any container is created, rather than
serving the host unregistered.

The initial staging data was created from a verified, scrubbed production snapshot on 2026-08-01. The copy has its own volume and encryption key and production integrations are empty. The app server authenticates with Google OAuth through the same client as production, so the client must list both redirect URIs: `https://ieeesahrdaya.com/auth/google/callback` and `https://staging.ieeesahrdaya.com/auth/google/callback`.

Staging intentionally returns `X-Robots-Tag: noindex, nofollow`. Its records may be changed or deleted during testing and do not synchronize back to production.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `dev`, on pull requests,
and on manual dispatch. It is split into a **fast path** and a **release gate**,
run in parallel jobs so wall time is the slowest job, not the sum.

**Fast path — every push and every pull request:**

1. `checks` — runtime-script syntax, lint, typecheck, docs, unit tests and the
   production Vite build in one job, so one checkout, one install and one cache
   restore cover all of it.
2. `integration` — `bun run test:integration`: the repository and schema
   invariants against a real SQLite file, the PocketBase-to-SQLite cutover
   against a populated fixture, the versioned forward migration across the
   shipped schema shapes, and the production storage guard.
3. `release-gate` — the compiled app, not the dev server. `tests/ci/seed.mjs`
   writes a synthetic database (refused unless the file is named
   `release-gate*.sqlite`), `tests/ci/assert-seeded.mjs` refuses to start without
   it because the app would otherwise create an empty database and report
   healthy, and then the server runs on loopback with jobs off, mail disabled and
   OAuth and payment providers faked or unreachable. Playwright drives the HTTP
   contract and a browser through it.

**Release gate — pull requests into `main`:**

4. `web-image` — the web image on **arm64**, published to GHCR (see below). It
   runs on `main` pushes too, because that is the image the deploy pulls.

The PocketBase smoke (`smoke-backend`), clean-room (`clean-room-backend`) and
Dockerfile-validation (`container-builds`) jobs are retired as of 2026-11-24:
the app server owns `/api`, so exercising PocketBase proved nothing about the
merged code. The same suites still run by hand —
`scripts/legacy-pocketbase-ci.sh`, including the populated migration — and
nothing was deleted. Build and run PocketBase from that script, not from CI. See
[legacy-tooling.md](legacy-tooling.md).

A push to `main` runs `checks`, `integration`, `release-gate` and `web-image`
before CD deploys. A direct push to `main` still skips pull-request review, so
releases should go through a pull request.

The certificate renderer opens exactly two files, `NotoSans-Regular.ttf` and
`NotoSerif-Regular.ttf`. They are committed under `tests/fixtures/fonts` (SIL
Open Font License 1.1, licence alongside) and found through
`CERTIFICATE_FONT_DIR`, so the renderer suite runs on every push instead of an
`apt-get install fonts-noto-core` that took 7–26 s depending on the mirror. At
runtime the image still reads the system copies. The bulk certificate suite runs at 100
recipients, which still exercises pagination (three registry pages) without the
22 s cost of 200.

`integration` also reports the production advisory surface. It runs
`bun audit --prod --json` — Bun's own audit, against `bun.lock`, the lockfile the
image installs from — and collapses it to the packages the image actually gets.
`tests/ci/audit-runtime.mjs` records a disposition for each one; an advisory
with no recorded disposition fails the step. The step is a report: a registry
outage does not fail a release.

CI and the Dockerfile use Bun **1.4.5**. Bun 1.2.9's better-sqlite3 postinstall
never returns under BuildKit on arm64; keeping the versions aligned means CI and
the image build exercise the same installer. `setup-bun` restores
`~/.bun/install/cache` on its own, so no separate `actions/cache` step is
needed. `scripts/check-runtime-syntax.sh` checks its 124 files in parallel.

The release gate starts from a database the seed created in the same job, never
from a copy of a deployment. A successful run proves the build serves public
pages, enforces the admin gate, resolves a session, refuses a foreign `Origin`
and completes sign-in against a fake provider — without reading any secret or
touching any real database.

## CD

`.github/workflows/cd.yml` reacts only to successful `CI` completion on `main`:

```text
main → production environment → DOCKPLOY_WEBHOOK_PROD
```

Before deployment, CD verifies that the SHA tested by CI is still the current
head of `main`. If a newer commit exists, the older deployment is skipped.

After deployment, CD does not trust the webhook's `200`. It verifies that the
origin reports the release it shipped: `/healthz` must be ready and its build
fingerprint must match the **tree of the published image**, for up to five
minutes (see **Health and readiness** § Verifying a deploy). The expected tree
comes from the artifact's own `ieee.tree` label, not from main's commit, so a
merge commit whose SHA differs from the tested PR head still passes. A green CD
run therefore means the new image is serving, not that Dokploy accepted a request.

Staging is not in this workflow. It deploys from the machine you are working on
(see *Deploying* below), which is faster and means a dev push never waits for a
runner. `workflow_run` workflows are evaluated from the repository default
branch, so this definition must exist on `main`.

`.github/workflows/production-health.yml` runs every 15 minutes and again when a
CD run finishes. It asserts `/healthz` readiness, the build identity when CD has
just deployed, the public routes, the security headers, TLS validity, the
`/verify` page and the public OAuth landing. It probes `/healthz`, not
`/api/health`: that route has not existed since the SQLite cutover, and the old docs:retired-ok
probe was asserting a 200 no healthy deployment could return.

### Prevent native pre-CI deployments

Both Dokploy Compose records use the public repository through Dokploy's custom-Git source mode:

```text
sourceType=git
customGitUrl=https://github.com/Phloraxx/IEEE-sahrdayaCET.git
customGitBranch=main|dev
githubId=<unset>
```

Do not reconnect either Compose record to the Dokploy GitHub App or switch `sourceType` back to `github`. With the GitHub App association present, Dokploy reacts to a push immediately and then the CI webhook deploys the same SHA again, allowing the first deployment to bypass CI.

The Dokploy deployment toggle remains enabled because `/api/deploy/compose/<refreshToken>` rejects requests when it is disabled. CI-only behavior therefore depends on keeping `githubId` unset and using custom-Git source mode. After changing deployment configuration, verify there is exactly one deployment record per pushed SHA and that it was created after the successful CI run.

Each Dokploy Compose record tracks its matching custom-Git branch. The webhook is a deployment trigger, not an immutable image reference. There remains a narrow branch-head-check-to-build race if another push lands immediately after the freshness check; eliminating that completely would require immutable SHA-tagged registry images.

The deployment endpoint is exposed through a narrow Traefik route on `hooks.ieeesahrdaya.com`. Only `/api/deploy/compose/*` is routed to Dokploy; the dashboard, Swagger UI, and general API are not exposed on that host. The refresh token remains stored only in GitHub Secrets and Dokploy.

## The production image flow

Production does not build on the deploy path. It pulls.

1. CI's `web-image` job builds `Dockerfile` on `ubuntu-24.04-arm` and pushes it
   to GHCR as `ghcr.io/phloraxx/ieee-sahrdaya-web`, tagged twice: `:sha-<commit>`
   and `:tree-<commit tree>`.
2. CD resolves the tested commit's tree, finds `:tree-<tree>`, reads the image's
   own `ieee.tree` label, and moves the mutable `:production` tag to that image
   with `docker buildx imagetools create` — a registry-side manifest copy, not an
   upload.
3. The Dokploy production compose command is
   `docker compose -p ieee-rewrite-i9ir8q --env-file .env -f ./docker-compose.yml up -d --pull always --remove-orphans`
   (no `--build`), with `WEB_IMAGE=ghcr.io/phloraxx/ieee-sahrdaya-web:production`
   in the environment. Compose pulls the image and recreates the container.
4. CD verifies the origin reports the tree it attached (see **Verifying a
   deploy**). The webhook having returned `200` is not the end of the deploy.

Why the tree tag: a squash merge keeps the tree of the pull request, so the
image built on the PR is exactly the image the merged commit runs. A **merge
commit** keeps it too, even though its SHA is new — which is why the gate compares
trees, never commit SHAs. A merge that lands on a different tree (for example two
PRs merging in sequence) is still covered, because CI publishes an image for
every `main` push as well.

**Failure modes**

- The image is missing for the tested tree: CD stops before the webhook with an
  explicit error and the old container keeps serving. Re-run the `web-image`
  job, or use the break-glass script.
- The image is present but its `ieee.tree` label disagrees with the tag it is
  filed under: CD refuses to deploy it, because the artifact does not match its
  own name.
- The image was built without the identity args: it reports `source` (or the
  previous tree), and CD's verification fails after the 300 s window. See
  **The image must carry the tested identity** below.
- A pull fails at deploy time, `up --pull always` may build `WEB_IMAGE` locally
  from the Dokploy checkout. That build carries **no identity args**, so the
  container reports `source` and CD's verification fails rather than passing on an
  unprovable image. The deploy landing is not the same as the deploy being
  verified; check the CD run, and if the pull failure is transient, re-run it.
- Staging is unchanged: it keeps the default Dokploy command and builds locally,
  with the identity passed by `scripts/deploy-local.sh`.

**The image must carry the tested identity**

`/healthz`'s `build` fingerprint is derived from `GIT_TREE`, which the Dockerfile
takes as a build arg. Production pulls an image it did not build, so the tree has
to be in the image CI published. The `tree-<tree>` tag proves which tree was
*built*; the fingerprint proves the *running container* is that build.

This branch adds the consuming side (Dockerfile args, compose pass-through, CD and
staging verification). The producing side is `.github/workflows/ci.yml`, which
other work in flight also edits. One interface is required, and it changes no tag
names and nothing in the Dokploy contract:

```yaml
# .github/workflows/ci.yml, job web-image, in the docker/build-push-action step
build-args: |
  GIT_COMMIT=${{ github.sha }}
  GIT_TREE=${{ steps.tree.outputs.tree }}
  GIT_BUILT_AT=${{ github.event.repository.updated_at }}
```

`steps.tree.outputs.tree` already exists in that job. The labels
`org.opencontainers.image.revision` and `ieee.tree` are already set and stay as
they are; CD reads `ieee.tree` from the published image to know which tree to
expect. `GIT_BUILT_AT` is informational (the admin data-health page); drop that
line if the workflow schema objects to it.

Until this lands, CD's verification fails after 300 s. Deploy with
`scripts/deploy-local.sh` (which passes the args itself), or land the CI change
first. Do not remove the verification to work around it.

## Deploying

There are two lanes, and they are deliberately different.

### Staging: from your machine

```bash
./scripts/deploy-local.sh --staging          # checks, build, switch, health gate
./scripts/deploy-local.sh --staging --yes    # no prompt
```

It deploys **the commit you have checked out**. The commit must be pushed (the
Dokploy checkout fetches it by SHA) and the source tree must be clean, so what
the tests cover is what goes live. It runs typecheck, the unit suite, builds the
web image with the staging Compose project, recreates `web` only, and waits for
`/healthz`. Measured: **35 s** end to end, against ~70 s for the old
push → CI → CD → build path.

Every build is labelled: the script passes `GIT_COMMIT`, `GIT_TREE` and
`GIT_BUILT_AT` as build args, so the image can say what it is. The gateway then
does more than wait for a 200:

1. prints the running container's name, image id, creation time, start time and
   the commit baked into `/app/build/git-commit`, and fails immediately if that
   commit is not the one being deployed (a reused image is the common cause);
2. waits up to 120 s for `/healthz` to report `ok: true` **and** a build
   fingerprint equal to the fingerprint of the commit and tree it built.

A container that was not actually replaced, or a router still pointing at the
old one, now fails the deploy instead of being reported as success.

Staging is a playground: it does not require a green CI run, and nothing
promotes it automatically. When the change is ready, it goes to `main` through a
pull request.

### Production: through CI

```text
dev ──PR──▶ main ──CI──▶ CD ──▶ Dokploy pulls ghcr.io/…:production
```

Nobody deploys production by hand in the normal course. CI must be green on the
exact commit, CD pins it to `deploy/production`, and the server pulls the arm64
image CI built for that commit's tree.

### Production break-glass: also from your machine

```bash
./scripts/deploy-local.sh                   # production, with tests
./scripts/deploy-local.sh --skip-tests      # incident hotfix, no test run
```

Only for a CI outage or a hotfix that cannot wait. It deploys the commit CD
pinned to `deploy/production` — not your worktree — so it can only ship what CI
already approved, and it refuses if that checkout is on another branch. It also
refuses when the checkout's `HEAD` is not `origin/deploy/production`, which is the
mistake of running it from a checkout that was never fetched. It builds on the
server instead of pulling, passes the identity build args, and the next normal
deploy pulls and replaces it.

It runs as your own user (Docker group), not root: the unit suite misbehaves
under root and nothing here needs it. It refuses on uncommitted edits to the
Dokploy checkout, ignoring `docker-compose.yml`, which Dokploy rewrites on every
deploy.

## Verifying staging

Run the full audit from the repository root after every staging deploy:

```bash
scripts/audit/run-staging-audit.sh
```

It creates a temporary event, user, registration, society and execom member;
asserts the HTTP contract, every admin route, the public UI and both rails,
mobile navigation, certificate/registration/ticket flows, audit rows, and
accessibility; then removes every test row and session. Expected baseline:

```text
deep HTTP/API        137/137
admin routes          19/19
UI / rails / mobile   22/22
axe + SEO             15/15
```

See `.opencode/skill/staging-audit/SKILL.md` for what each pass covers and which
staging behaviours are expected rather than bugs.

Do not open the staging database from the host with `sqlite3`, or with any other
WAL client. SQLite creates `portal.db-wal`/`portal.db-shm` owned by your host
user; the container's uid can no longer write them, and every mutation starts
answering 500 (`attempt to write a readonly database`). Read fixture data
through `docker exec` instead (`scripts/audit/fixtures.cjs` does exactly this).
To recover from a mistake, stop the web container, remove the stale `-wal` and
`-shm` files, and start it again.

## Do not manually replace Dokploy services

Do not launch a second Compose file, fallback image, or manually created container under the same Dokploy Compose project/service name. The one exception is `scripts/deploy-local.sh`, which deliberately uses the existing Compose project and service so Dokploy still owns the record.

A manual container can appear healthy while serving stale code and can shadow the service that Dokploy believes it manages. Source deployments must be performed through the repository CI/CD path or the canonical Dokploy project Compose configuration.

If an environment appears stale, verify the running container labels before debugging application code. The web service should point to the matching Dokploy project working directory and canonical `docker-compose.yml`, not a temporary file elsewhere on the server.

## Normal development/release flow

1. Make changes on a feature branch or directly through the agreed development workflow.
2. Merge accepted work into `dev`.
3. Let `dev` CI pass and CD deploy `staging.ieeesahrdaya.com`.
4. Perform public, responsive, schema-sensitive, and authenticated acceptance on staging.
5. Open and review the `dev` → `main` production PR.
6. Take a fresh production PocketBase/files backup for schema-sensitive releases.
7. Merge to `main`; successful main CI deploys production.
8. Verify production health and critical user flows.

See `docs/release-checklist.md` for the detailed acceptance list.

## Backup and rollback

### What is backed up

The application server owns two pieces of state, and a backup is only complete
with both:

| State | Where |
| --- | --- |
| `portal.db` | `SQLITE_DATA_DIR` bind mount, `/app/data/portal.db` in the container |
| Uploads | `UPLOADS_HOST_DIR` bind mount, nested at `/app/data/uploads` |

They are separate mounts, so they can drift. A database restored without its
uploads renders pages whose images 404; uploads restored without the database
leaves orphans. Back them up together.

### Taking a backup

`scripts/ieee-backup-export.sh` is the tool. It writes one zip per run
containing `portal.db`, the `uploads/` tree and a `manifest.json`, plus a
`.sha256` sidecar:

```bash
IEEE_SQLITE_DB=/srv/ieee/data/portal.db \
IEEE_UPLOADS_DIR=/srv/ieee/data/uploads \
IEEE_BACKUP_DIR=/home/drvij/ieee-backups/daily \
  scripts/ieee-backup-export.sh backup
```

| Variable | Purpose |
| --- | --- |
| `IEEE_SQLITE_DB` | Required. The live database. Opened **read-only**. |
| `IEEE_UPLOADS_DIR` | Required. The uploads directory. |
| `IEEE_BACKUP_DIR` | Default `/home/drvij/ieee-backups/daily`. |
| `IEEE_BACKUP_MAX_KEEP` | Default 30 archives. |

It uses `VACUUM INTO`, not `cp`. The database runs in WAL mode with a live
writer, so the file on disk is not a consistent snapshot — recent commits may
still be in `-wal`, and a copy can capture a torn page mid-checkpoint.
`VACUUM INTO` opens a read transaction and writes a fully materialised database,
holding no write lock, so the app keeps serving.

Every archive is verified before it is published: `PRAGMA integrity_check`, a
table-count floor, a zip CRC read-back, and a sha256 of both the database and
the archive. A run that cannot verify its own output exits non-zero and leaves
nothing behind.

The database is snapshotted before the uploads tree. A file uploaded between
the two is an orphan in the archive, which is harmless and already reported by
the data-health page. The reverse order would be worse — a file deleted between
the two would be referenced by the database but missing from the archive.

`scripts/ieee-ops-watchdog.sh` alerts when the newest `*.zip` in the export
directory is stale, so the archive extension and location are part of the
contract.

A recent local zip proves only that this script ran. It is not evidence of an
offsite copy; that needs the verified-success marker described under **Offsite
backups** above.

### Restoring

```bash
scripts/ieee-backup-export.sh restore <archive.zip> <target-dir>
```

The restore path verifies before it trusts: zip CRC, path containment, the
`portal.db` sha256 against the manifest, `PRAGMA integrity_check`,
`PRAGMA foreign_key_check`, the table-count floor, and the uploads file count
against the manifest. It refuses to write over an existing `portal.db` without
`--force`, so a rehearsal cannot clobber the thing it is rehearsing for.

**Rehearse this before you need it.** A backup nobody has restored is a
hypothesis. Restore the newest archive to a scratch directory and boot the app
against it.

### Archive verification

Two scripts write backups with two formats, and one verifier now reads both:
`src/server/jobs/backup-verify.ts`.

| Writer | Format | Where |
| --- | --- | --- |
| `src/server/jobs/backup.ts` (in-app daily job) | `ieee-<env>-<stamp>.tar.gz` | `BACKUP_HOST_DIR` |
| `scripts/ieee-backup-export.sh` | `ieee-sqlite-<stamp>.zip` + `.sha256` | `IEEE_BACKUP_DIR` |

The format does **not** change in this branch. A fleet with two archive shapes on
disk and one reader is worse than one shape with a recorded verification, so the
churn is deferred until a rollout story exists for both copies (see the operator
steps in `docs/release-checklist.md`).

The verifier reads the member list without extracting (`tar -tvzf`, or a zip's
central directory) and refuses:

- an absolute path, a `..` segment, a backslash or a drive letter;
- a symlink, hardlink or device member;
- more than 50,000 members or 16 GiB uncompressed (a decompression bomb);
- a sidecar sha256 that does not match the archive;
- zero or more than one `portal.db`, or more than one `manifest.json`;
- a listing line it cannot parse. A line it cannot read is a reason to refuse, not
  to guess the size.

A restore **never extracts by name**. It resolves each member through
`isSafeMemberPath` and refuses the archive if any member fails.

### Database and uploads coherence

A backup is two pieces that drift: `portal.db` and the uploads tree. The
in-app manifest now records `referencedFiles`, the number of snapshot rows whose
file column points at a stored upload (`backup.ts` reads the columns from the
snapshot's own schema, so a new image column is counted without a code change).

`checkCoherence` compares that with the files the archive actually contains:

| Situation | Result | Why |
| --- | --- | --- |
| files ≥ rows | pass, reported as orphans | the writer snapshots the database first, then the uploads tree; a file written in between has no row, and the data-health page already reports orphans |
| rows > files | **fail** | the database points at something the archive does not contain; pages break after a restore |

The one-sided rule is deliberate. An orphan is harmless; a missing file is not.

### Offsite backups

The local archive is not an offsite copy. A copy job that is disabled, failing,
or sealing archives without uploading leaves the local file present and recent,
and the watchdog used to read that as success. It now requires evidence from the
copy step itself.

The interface is the **marker**, not any particular store or tool: whatever
copies the archive offsite writes the same JSON after its own verification check,
and the watchdog reads only that. Restic is one possible mechanism and is *not*
the one in use (see "Current host state" below).

**Two kinds of evidence, two cadences.** A full read-back is expensive — the daily
archive is about 98 MB, and reading it back every day would push ~98 MB/day through
Backblaze B2, against a free egress allowance of roughly three times the data
stored per day. Requiring that daily would either trip the quota or force the
check to be disabled, which is how the old "recent zip" check came to exist. So:

| Evidence | File | Written when | Watchdog budget |
| --- | --- | --- | --- |
| `upload` | `ieee-offsite-<stamp>.json` | after each verified remote PUT (provider response, or a HEAD/stat that matches size and checksum) | 31 h, checked every run |
| `drill` | `ieee-offsite-drill-<stamp>.json` | after a full read-back and a restore | 90 days, only when `IEEE_OFFSITE_REQUIRE_DRILL=1` |

The daily question is "is the copy being replaced?", which cheap metadata answers
correctly: a stored SHA-256, an object version or an ETag that matches the archive
already proves the object matches. The
slower question — "would a restore work?" — belongs to a drill on its own schedule,
not to every run.

After each upload:

```bash
scripts/backup-offsite-verify.sh --mode upload \
  --archive  <the local archive> \
  --target   b2:ieee-offsite \
  --remote-sha256 <the store's sha256, when it reports one>
```

After a read-back drill (manual or on a slow cron):

```bash
scripts/backup-offsite-verify.sh --mode drill \
  --archive  <the local archive> \
  --target   b2:ieee-offsite \
  --read-back <a copy fetched back FROM the target> \
  --restore-checked
```

`--target` must be offsite storage, never a local path. Upload mode refuses a
checksum that disagrees with the archive; drill mode refuses a read-back that does
not match and requires `--restore-checked`. A marker looks like:

```json
{
  "version": 1,
  "kind": "upload",
  "verifiedAt": "2026-11-24T03:10:00Z",
  "archiveSha256": "<64 hex>",
  "archiveName": "ieee-sqlite-2026-11-24T024000Z.zip",
  "target": "b2:ieee-offsite",
  "bytes": 97823114,
  "proof": "metadata",
  "remoteSha256": "<64 hex>"
}
```

Markers are append-only: each is evidence for one run, and rotation does not
rewrite them. `scripts/ieee-ops-watchdog.sh` alerts unless the newest upload marker
is younger than `IEEE_OFFSITE_MAX_AGE_SECONDS` (31 h), is complete, and does not
predate the newest local archive. With `IEEE_OFFSITE_REQUIRE_DRILL=1` it also alerts
when the newest drill is older than `IEEE_OFFSITE_DRILL_MAX_AGE_SECONDS`
(90 days) or absent. Sealing an archive produces neither marker, so sealing can
never be mistaken for a successful copy.

How the copy job gets the archive back depends on the store. A drill fetches one
archive back from the target into a scratch directory and restores it; the tool
that moved the bytes does not matter, only that the read-back matches the stored
checksum and the restore was exercised. The `--restic-snapshot` flag exists for a
Restic target and is optional everywhere else.
`tests/unit/server/ops-offsite-marker.test.ts` pins both verdicts, including the
regressions "a recent local archive with no marker fails" and "a fresh drill cannot
mask a stale upload".

**Current host state, 2026-11-24.** The offsite copy is handled by the host job
**`important-backup.py`**, not by Restic. Restic is not the current mechanism and
must not be re-enabled: the 2026-11-24 audit verified the B2 archive it
produces, so the offsite copy itself is live and healthy.

`important-backup.py` does not write the upload marker yet. Until it is wired to
call `scripts/backup-offsite-verify.sh --mode upload` at the end of a successful
run, the watchdog reports a missing offsite upload marker once
`IEEE_BACKUP_GRACE_UNTIL_EPOCH` passes. That alert is accurate and is not a
reason to change the copy job. The local export at 22:00 UTC and the hourly
watchdog at :12 are unchanged.

The restore drill is separate from the daily copy and runs on its own slow
cadence. Keep it under the B2 egress allowance: free egress is roughly three
times stored data per day and the archive is about 98 MB, so a daily read-back
would exhaust it. Monthly is reasonable; opt in with
`IEEE_OFFSITE_REQUIRE_DRILL=1` once a drill schedule exists.
### Staging

Staging additionally has a host-level nightly snapshot, independent of this
script: `/etc/cron.d/ieee-staging-sqlite-backup` runs
`/home/drvij/ieee-ops/backup-staging-sqlite.sh` at 02:40 UTC, writing
`portal-YYYY-MM-DD.db` via `VACUUM INTO` into
`/home/drvij/backups/ieee-staging-sqlite` with 14-day retention. It covers the
database only, not uploads. Offsite copying of that directory is not asserted
here: the verified production path is `important-backup.py`, and the staging copy
mechanism should be read from the host job itself rather than assumed.

Staging data is disposable but its volume must still remain separate from
production. Refreshing staging from production is an explicit scrubbed-copy
operation, not continuous replication.

### Rollback

Application rollback is a Git/Dokploy deployment operation.

**Database rollback is not.** Once the SQLite app server takes a write — a
registration, a payment, a check-in — that write exists only in `portal.db`.
The PocketBase container is retired behind the `legacy-pocketbase` profile and its
volume has been frozen since the cutover, so returning traffic to it would strand
every write made since. Past that point, rollback means *restore from backup*,
not *swap the service*:

```bash
scripts/ieee-backup-export.sh restore <archive.zip> <scratch-dir>   # verify first
```

The `legacy-pocketbase` profile exists to inspect or export that frozen volume
during an investigation (see **PocketBase** above). It is not a rollback path.

Migrations must be forward-safe on a recent copy of production data before
rollout. Prefer additive migrations and explicit data migrations; do not assume
a schema change can be reversed.

Rolling back to a commit that predates the image flow (before the GHCR pull was
introduced) has no `:tree-` image, so CD stops with an explicit error instead of
deploying. For those commits, deploy with `scripts/deploy-local.sh`, which builds
on the server.

## Edge caching

Public HTML is served with a shared-cache directive so a CDN can absorb repeat
traffic without waking the Node process:

```text
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

The policy lives in `src/server/http/cache.ts` and is applied by the
`publicCacheMiddleware` in `src/root.tsx`. It is deliberately conservative:

- **Path allow-list.** Only the routes listed in that module are cacheable. A new
  route is not cached until it is added there, so a mistake costs a cache hit,
  never correctness.
- **Session cookie.** A request carrying `SESSION_COOKIE_NAME` is never given the
  shared directive.
- **200 only.** Redirects, error-boundary responses and 5xx are never pinned.
- **Documents only.** `*.data` requests and `/api/*` are excluded.

This is safe because the public document carries no user state: authentication
lives in `AuthProvider`, which calls `/api/session` after hydration. The HTML a
signed-out visitor receives is identical for every visitor.

### Cloudflare

Cloudflare's default cache level does not cache HTML, so `s-maxage` alone leaves
`cf-cache-status: DYNAMIC`. To actually use the edge, add a Cache Rule for the
public hostnames:

| Field | Value |
| --- | --- |
| When incoming requests match | `URI Path` in `/`, `/about`, `/contact`, `/pricing`, `/events`, `/societies`, `/full-execom`, `/infinia`, `/flagships` — or a `starts_with` test per prefix |
| Then | Eligible for cache, Edge TTL *Use cache-control header if present* |

Do **not** add a catch-all rule. `/my-events`, `/register/*`, `/payment/*`,
`/ticket/*`, `/c/*`, `/admin/*`, `/api/*` and `/auth/*` must stay uncached; the
allow-list in `cache.ts` already refuses to mark them, and a broad Cache Rule
would override that.

`/files/*` is served with `public, max-age=31536000, immutable`. Filenames are
generated UUIDs and a replaced file gets a new one, so the URL is
content-addressed and a year is safe.

### In-process cache

`src/server/public/cache.server.ts` memoises the public readers for 30 seconds.
This is the layer that matters when the edge is cold or not configured at all:
better-sqlite3 is synchronous, so every query on a render blocks the event loop
for its full duration. The TTL matches `s-maxage`, so an admin who publishes an
event sees it on the public site within the same half-minute the CDN already
imposes. The admin UI reads through `/api/*`, which is never cached, so an editor
always sees their own write immediately.
