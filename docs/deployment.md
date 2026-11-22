# Deployment

## Runtime images

### Web

The web image installs and builds with Bun 1.2.9. The final SSR runtime is Node 22 Alpine.

Node is intentional: runtime smoke testing showed that serving React Router SSR under Bun selected React DOM's Bun server build, which did not provide the stream API expected by `@react-router/serve`.

### PocketBase

`pocketbase/Dockerfile` pins PocketBase 0.39.9, supports amd64/arm64, and verifies the downloaded release archive by SHA-256 before extraction.

Hooks and migrations are baked into the image. Only `/pb/pb_data` is persistent.

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
- `GET /healthz` returns the scheduler state (`lastTickAt`, `lastError`) so the
  watchdog can tell "running" from "alive".

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

`X-Render-Cache: hit|miss` on the response and `renderCache` in `/healthz`
(stats: entries, bytes, hits, misses, evictions) make it measurable. Bounds:
`RENDER_CACHE_MAX_ENTRIES` (50) and `RENDER_CACHE_MAX_BYTES` (32 MB); 0 disables.
An admin change appears on the public site within the TTL.

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
hostname across branches. The PocketBase service keeps running as a rollback
target but **carries no router**: a `/api` router there would compete with the
web router for the same paths. During a rollback the router is moved back to
PocketBase by hand, not by the compose file.

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
only deletion: events and blogs are public only when published/completed,
societies only when not hidden, and execom `email`/`phone` are omitted. Staff
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
volume: ieee-rewrite-i9ir8q_pb_data (rollback target only)
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
volume: ieee-dev-staging_pb_data (rollback target only)
```

Staging is a separate Dokploy environment and Compose project. It uses:

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

1. `checks` — runtime-script syntax, lint, typecheck, unit tests and the
   production Vite build in one job, so one checkout, one install and one cache
   restore cover all of it.
2. `smoke-backend` — a fresh PocketBase boot, the two invariant suites, a
   certificate template lifecycle and the populated PocketBase-to-SQLite
   migration. It gates `main` pushes and PRs into `dev`, but not `dev` pushes: a
   normal release to dev has already run it on the PR, and skipping it keeps the
   staging deploy fast.

**Release gate — pull requests into `main`:**

3. `clean-room-backend` — every backend lifecycle: certificate templates,
   issuance, 100-recipient scale, public verification, delivery, revoke and
   replacement, PayGate v4, and the populated migration.
4. `container-builds` — the PocketBase image on **arm64**.
5. `web-image` — the web image on **arm64**, published to GHCR (see below). It
   runs on `main` pushes too, because that is the image the deploy pulls.

A push to `main` therefore runs only the fast path before CD deploys; the deep
backend gate has already run on the release PR. A direct push to `main` skips
it, so releases should go through a pull request.

The certificate renderer's fonts are installed only on the release gate (`main`
pushes and PRs into `main`); on the dev fast path those unit tests skip rather
than adding ~7 s to every push. The bulk certificate suite runs at 100
recipients, which still exercises pagination (three registry pages) without the
22 s cost of 200.

CI and the Dockerfile use Bun **1.4.5**. Bun 1.2.9's better-sqlite3 postinstall
never returns under BuildKit on arm64; keeping the versions aligned means CI and
the image build exercise the same installer. `setup-bun` restores
`~/.bun/install/cache` on its own, so no separate `actions/cache` step is
needed. `scripts/check-runtime-syntax.sh` checks its 124 files in parallel.

The clean-room backend starts with an empty PocketBase data directory. A
successful run proves that committed migrations and hooks can construct a usable
backend without depending on a long-lived database.

## CD

`.github/workflows/cd.yml` reacts only to successful `CI` completion on:

```text
main
dev
```

Before deployment, CD verifies that the SHA tested by CI is still the current head of that branch. If a newer commit exists, the older deployment is skipped.

Branch mapping:

```text
main → production environment → DOCKPLOY_WEBHOOK_PROD
dev  → staging environment    → DOCKPLOY_WEBHOOK_DEV
```

`workflow_run` workflows are evaluated from the repository default branch. Therefore the CD workflow definition needed to trigger both environments must exist on `main`.

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
2. CD resolves the tree of the tested commit and, for production, moves the
   mutable `:production` tag to that image with `docker buildx imagetools
   create` — a registry-side manifest copy, not an upload.
3. The Dokploy production compose command is
   `docker compose -p ieee-rewrite-i9ir8q --env-file .env -f ./docker-compose.yml up -d --pull always --remove-orphans`
   (no `--build`), with `WEB_IMAGE=ghcr.io/phloraxx/ieee-sahrdaya-web:production`
   in the environment. Compose pulls the image and recreates the container.

Why the tree tag: a squash merge keeps the tree of the pull request, so the
image built on the PR is exactly the image the merged commit runs. A merge that
lands on a different tree (for example two PRs merging in sequence) is still
covered, because CI publishes an image for every `main` push as well.

**Failure modes**

- The image is missing for the tested tree: CD stops before the webhook with an
  explicit error and the old container keeps serving. Re-run the `web-image`
  job, or use the break-glass script.
- A pull fails at deploy time: Compose falls back to building that tag locally
  from the checked-out commit, so the deploy still lands — slower, but correct.
  (Verified: `up --pull always` builds when the pull fails and pulls when it
  succeeds.)
- Staging is unchanged: it keeps the default Dokploy command and builds locally.

**Rollback**

Every release keeps its immutable `:tree-<tree>` tag, and CD re-points
`:production` at the tree of whatever commit it deploys. Repointing
`deploy/production` to an earlier commit and re-running CD therefore rolls back
both the code and the image, with no registry work by hand. The database caveat
above still applies.

`scripts/deploy-local.sh` builds the web image on the server and tags it with
`WEB_IMAGE` from the environment file, so a hotfix does not need the registry at
all; the next normal deploy pulls `:production` again and replaces it.

## Break-glass deployment (no GitHub)

`scripts/deploy-local.sh` exists for the case where GitHub Actions or the
Dokploy webhook is unavailable and a fix cannot wait. It is the **only**
sanctioned way to deploy outside the normal path.

```bash
sudo ./scripts/deploy-local.sh --dry-run     # print the plan
sudo ./scripts/deploy-local.sh               # production: tests, build, switch
sudo ./scripts/deploy-local.sh --staging     # staging
sudo ./scripts/deploy-local.sh --skip-tests  # incident hotfix
```

It refuses to run unless the checkout is clean, is on `deploy/production` (or
`deploy/staging`), and the operator passes an explicit confirmation. It installs
dependencies, runs typecheck and the unit suite (unless skipped), builds the
**web** service with the environment few people should touch, using the same
Compose project and service name Dokploy uses, and recreates only `web`.
PocketBase is left untouched. The health check waits for `/healthz` to report a
living `renderCache`, which proves the new process is serving rather than the
old one still draining.

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

### Staging

Staging additionally has a host-level nightly snapshot, independent of this
script: `/etc/cron.d/ieee-staging-sqlite-backup` runs
`/home/drvij/ieee-ops/backup-staging-sqlite.sh` at 02:40 UTC, writing
`portal-YYYY-MM-DD.db` via `VACUUM INTO` into
`/home/drvij/backups/ieee-staging-sqlite` with 14-day retention, and restic
copies that directory offsite. It covers the database only, not uploads.

Staging data is disposable but its volume must still remain separate from
production. Refreshing staging from production is an explicit scrubbed-copy
operation, not continuous replication.

### Rollback

Application rollback is a Git/Dokploy deployment operation.

**Database rollback is not.** Once the SQLite app server takes a write — a
registration, a payment, a check-in — that write exists only in `portal.db`.
Flipping the container back to PocketBase does not move it, and the PocketBase
volume has been frozen since the cutover. Past that point, rollback means
*restore from backup*, not *swap the service*.

Migrations must be forward-safe on a recent copy of production data before
rollout. Prefer additive migrations and explicit data migrations; do not assume
a schema change can be reversed.

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
| When incoming requests match | `URI Path` in `/`, `/about`, `/contact`, `/pricing`, `/events`, `/blog`, `/societies`, `/full-execom`, `/infinia`, `/flagships` — or a `starts_with` test per prefix |
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
