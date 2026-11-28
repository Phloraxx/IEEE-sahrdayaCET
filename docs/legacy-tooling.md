# Legacy and historical tooling

This note says what in the repository is a **record or a rollback aid** rather
than part of the running system, and how to exercise each one on demand. It
exists because normal CI stopped running PocketBase on 2026-11-24: the app
server owns `/api`, authentication and the SQLite database, so a PocketBase
smoke no longer tested the code being merged.

Nothing below was deleted. Migrations, hooks, smoke suites, the rollback image
and every archived volume are intact.

## What is legacy, and why it stays

| Path | Status | Why it stays |
| --- | --- | --- |
| `pb_migrations/` | Frozen history | The PocketBase cutover's record. Never applied to the SQLite database. |
| `pb_hooks/` | Frozen history | The behaviour the TypeScript server replaced. Kept as the reference a migration question is answered from. |
| `pocketbase/Dockerfile` | Rollback target | Builds the PocketBase image the rollback path still needs. Not built in CI (removed 2026-11-24); `scripts/legacy-pocketbase-ci.sh` builds it. |
| `tests/backend/*.py` | Historical smoke suites | Exercise PocketBase hooks and collections. Useful only while the rollback target has to build and migrate. |
| `scripts/migrate-pb-to-sqlite.ts` | **Live** | The only way to rebuild a database at a new schema version (see `AGENTS.md`). Tested on every push by `test:integration`. |
| `scripts/ieee-backup-export.sh` | **Live** | Database and uploads backup and restore. |
| `docker-compose.local.yml` `pocketbase` service | Opt-in | Behind the `legacy-pocketbase` profile. Not started by default. |

"Live" means normal work depends on it. Everything else runs only when a
specific question needs it.

## Running the PocketBase suites by hand

`scripts/legacy-pocketbase-ci.sh` is the workflow the retired `smoke-backend`
and `clean-room-backend` jobs ran, as one local script:

```bash
scripts/legacy-pocketbase-ci.sh            # every suite, then a populated migration
scripts/legacy-pocketbase-ci.sh --smoke    # skip the migration step
scripts/legacy-pocketbase-ci.sh --keep     # leave the container for inspection
```

It builds the image, starts a fake SMTP server, boots PocketBase on
`127.0.0.1:18090`, creates the CI superuser, runs the invariant, certificate and
PayGate suites, and finally copies `pb_data` out and runs the migration with
`--apply` into a temporary directory. It uses its own container name and a
temporary work directory, reads no environment file, and removes both unless
`--keep` is given. Every pinned port and password is a literal test value
defined in the script.

Expected end state: `legacy PocketBase suites passed`, and the migration's own
`ALL CHECKS PASSED` block when the migration step runs. A run takes about three
minutes cold, most of it the image build.

The suites' container start-up includes `--add-host=host.docker.internal`, so
they need a Docker host; they also commit test data, so never point them at a
deployment. The script is the only place that builds the PocketBase Dockerfile:
normal CI no longer does, because the image is a rollback target and a healthy CI
run should not imply a rollback target that nobody has exercised.

## Local development without PocketBase

`docker-compose.local.yml` now runs the app the way it is deployed:

```bash
scripts/local-dev-data.sh                          # create data/local, owned correctly
docker compose -f docker-compose.local.yml up -d --build
curl -fsS http://127.0.0.1:3000/healthz
```

The container runs as uid 1000 (`node`), and a bind mount keeps the host
directory's owner. If `data/local` is owned by another user the app logs
`unable to open database file` while every page still answers `200`, which is
easy to misread as a healthy start — `scripts/local-dev-data.sh` prevents it.
Set `LOCAL_UID`/`LOCAL_GID` to the directory owner if you cannot change it.

PocketBase is behind a profile:

```bash
docker compose -f docker-compose.local.yml --profile legacy-pocketbase up -d
```

Nothing proxies to it. `vite.config.ts` has no `/api` proxy, and the app's
`fetch` never leaves the process for a PocketBase host.

## The Playwright suite

`bun run test:e2e` still drives the full browser suite locally; several specs
expect a staging-shaped database and skip without one. The deterministic subset
that gates releases is separate:

```bash
bun run test:release-gate          # build + seed + start + gate specs, temporary data
bun run test:e2e:release-gate      # only the specs, against a running server
```

`test:release-gate` needs nothing but Bun and Playwright's Chromium
(`bunx playwright install chromium`). It never touches an environment file, a
backup or a PocketBase volume.

## Why `production-proxy.mjs` is unused

`tests/e2e/production-proxy.mjs` forwarded `/api/*` to PocketBase and proxied
everything else to the compiled app. The app serves `/api` itself, so the file
described a runtime that no longer exists. It is kept for the same reason as the
hooks: it records how the old deployment was wired. The default
`playwright.config.ts` no longer starts it — a CI run of `bun run test:e2e`
would have sent every API call to a port nothing listens on.
