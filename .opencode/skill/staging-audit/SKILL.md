---
name: Staging audit
description: Run a thorough, repeatable audit of the IEEE Sahrdaya staging deployment (https://staging.ieeesahrdaya.com) — public pages, every admin route, auth and scoping, registration/ticket/certificate flows, uploads, coupons, caches, rails, mobile, accessibility and SEO. Use when asked to test staging, verify a deploy, or check a change end to end.
---

# Staging audit

Staging is a disposable playground. This skill proves the whole product works
against the real deployment, using temporary rows that the last step removes.

**Never point it at production.** `deep.mjs` creates a registration, a society
and an execom member; `cleanup.cjs` deletes them. Staging runs with
`MAIL_DELIVERY_MODE=disabled`, so nothing is emailed; the outbox is still written.

## One command

```bash
scripts/audit/run-staging-audit.sh
```

It mints fixtures, runs the HTTP/API suite, the admin sweep, the browser/rail
suite and axe, then cleans up. Evidence (screenshots, JSON) lands in
`/tmp/opencode/staging-audit/`.

Expected baseline at the time of writing:

| Pass | Checks | Command |
|---|---|---|
| Deep HTTP/API | 137/137 | `node scripts/audit/deep.mjs` |
| Admin routes | 19/19 | `node scripts/audit/admin-sweep.mjs` |
| UI / rails / mobile | 22/22 | `node scripts/audit/ui.mjs` |
| Accessibility + SEO | 15/15 | `node scripts/audit/a11y.mjs` |

Run them individually when iterating; each browser pass needs sessions, so run
`docker exec -i ieee-dev-staging-web-1 node --experimental-sqlite - < scripts/audit/mint.cjs`
first (`deep.mjs` mints for itself).

## How fixtures work

`mint.cjs` runs **inside the web container**, because `/home/drvij/ieee-staging-data/db/portal.db`
is owned by the container's uid (1000); the host user cannot write it.

It creates:

- `staging-audit-user@example.invalid` (role `user`)
- `staging-audit-event` (`a0000000-0000-4000-8000-000000000001`), free, open,
  published, check-in enabled, three days out
- short-lived sessions for an admin, that user, and the first `chair`, written as
  cookie files under `.../db/.staging-test-{session,member,chair}`

The session cookie is `base64(JSON(token))`, matching `__Host-ieee_session`. The
raw token is never printed. Cleanup deletes the sessions by user agent
(`staging-test%`) and by user.

## What the deep pass covers

Pages and status codes (including `/blog` → 404 and staging's noindex sitemap),
event/society detail, ticket and certificate surfaces, security headers, cache
headers and nonces, collection visibility, the admin/member/anon matrix, IDOR
checks, origin guard, upload sniffing, registration body guards, a full free
registration → ticket → QR → cancel cycle, admin create/patch/upload/delete for
societies, execom and events (including the audit rows each write must leave),
webhook signature rejection, methods, traversal, resizing, logout invalidation,
and the auth rate limit (run inside the container on a throwaway IP so it cannot
fill the public bucket for the next run).

The admin sweep opens every admin route on its own page, so a console error or
non-2xx API call is attributed to the page that caused it.

The UI pass checks every public page for console errors, 404s, broken images and
overflow; the desktop nav; the mobile bottom nav and More sheet; both home rails
at ~33 px/s and drag; reduced motion; certificate verification; the registration
form; the admin theme toggle and persistence; event search; and check-in.

## Interpreting staging-specific results

Expected, not bugs:

- `/blog` and `/api/collections/blogs` are 404 (blog removed by product decision).
- `/sitemap.xml` is 404 and every document carries `X-Robots-Tag: noindex` —
  staging must not be indexed. Production serves the sitemap.
- `canonical` and `og:image` point at `https://ieeesahrdaya.com`; that is the
  product URL, not the host being tested.
- A deleted row can linger in a page for up to 60 s (`s-maxage=60` plus the
  server render cache). Re-check after a minute before calling it a bug.
- A cancelled registration's ticket URL is 404.
- A hidden society's uploaded logo is 404 to the public but 200 to an admin.
- `/admin/access` and `/admin/payments` answer 403 API calls for a society chair;
  the page still renders its empty state.
- The sign-in flow is Google OAuth only. Tests use minted sessions; never try to
  complete OAuth.
- The admin shell defaults to **dark** and persists the choice in
  `localStorage`; the toggle is a Sun/Moon button at the bottom of the sidebar.
  If the owner asks for light by default, that is a product change, not a test
  failure.

Transient noise:

- Cloudflare occasionally returns an isolated 502 on a burst of requests
  (no origin log, no container restart). Re-run the single request before
  treating it as a defect.
- The auth rate limit is 20/min per egress IP. Waiting a minute clears it; run
  the rate-limit check last.
- Node's `fetch` sends a >5 MB body without `Expect: 100-continue`, and
  Cloudflare can turn the origin's early 413 into a 502. `deep.mjs` uses curl
  for that one check.

## Safe-write rules

- Only create rows with the `staging-audit-` prefix and the fixed test UUID.
- Never delete or edit rows that existed before the audit.
- Cleanup removes: the test user, its sessions, the test event and its
  registrations/payments/attendance/outbox rows, `staging-audit-*` societies and
  their upload directories, and `Staging Audit Member`.
- If a run dies before cleanup, run
  `docker exec -i ieee-dev-staging-web-1 node --experimental-sqlite - < scripts/audit/cleanup.cjs`
  and then `PRAGMA integrity_check`.

## Known gaps this audit records (do not mistake for failures)

- Deleting a society/execom row does not delete its upload directory; cleanup
  removes the test ones explicitly.
- Home page transfers ~4.2 MB, ~3.9 MB of it images (`/files/execom/*` originals,
  no `srcset`). The resize endpoint works (`?w=400` cuts a 194 KB photo to 21 KB);
  wiring `buildSrcSet()` into the execom rail and the static `/Events/*` photos is
  the open performance task.

## Reading the staging database

Never open it with host `sqlite3` or any other WAL client. SQLite creates
`portal.db-wal`/`portal.db-shm` owned by your host user; the container's uid
cannot write them afterwards and every mutation answers 500. The harness reads
fixtures through `docker exec` (`scripts/audit/fixtures.cjs`) for exactly this
reason. To recover: stop the web container, remove the stale `-wal` and `-shm`,
start it.

## Environment overrides

```text
BASE=https://staging.ieeesahrdaya.com
STAGING_CONTAINER=ieee-dev-staging-web-1
STAGING_DATA_DIR=/home/drvij/ieee-staging-data
AUDIT_OUT=/tmp/opencode/staging-audit/shots
AUDIT_WORK=/tmp/opencode/staging-audit
```

`a11y.mjs` downloads `axe-core@4.10.2` to `/tmp/opencode` on first use (it needs
`bypassCSP` to inject it).
