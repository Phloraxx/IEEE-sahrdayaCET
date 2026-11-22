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
uploads tree, keeping `BACKUP_KEEP` archives. Restore: stop the app, extract the
archive into a scratch directory, check `manifest.json` and the file counts, then
replace `portal.db` and `uploads/`; a snapshot already reports
`PRAGMA integrity_check`, so a failed copy is never mistaken for a backup.

`scripts/ieee-backup-export.sh` stays for the pre-cutover PocketBase volume and
for offsite copies; once the SQLite deployment is live, the in-app archive is the
primary one.

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
and on manual dispatch. The expensive gates run for pull requests into `dev`,
final `main` pushes, and manual runs. A merged `dev` push or a `dev` → `main`
pull request runs the lighter validation job without repeating clean-room,
browser, and container work.

The workflow has three full gates:

1. lint, typecheck, unit tests, and production web build;
2. a clean-room PocketBase boot, backend invariant smoke suite, and Playwright Chromium tests;
3. production Docker builds for the web and PocketBase images.

The lighter merged-`dev` path still runs runtime syntax, lint, typecheck, unit tests,
and the production web build for the exact SHA that staging CD may deploy. The final
`main` push retains all three full gates, so CD's exact-SHA freshness check is not weakened.

The clean-room backend starts with an empty PocketBase data directory. A successful run proves that committed migrations and hooks can construct a usable backend without depending on a long-lived database.

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

## Do not manually replace Dokploy services

Do not launch a second Compose file, fallback image, or manually created container under the same Dokploy Compose project/service name.

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
