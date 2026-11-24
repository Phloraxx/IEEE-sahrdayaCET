# Production Release Checklist

Use this checklist for future schema-sensitive releases from `dev` staging to `main` production.

## 1. Source control

- Release branch contains every intended application, migration, hook, workflow, and documentation change.
- Reconcile the latest `main` into `dev` before the final production PR when the branches have diverged.
- Review unexpected deletions and infrastructure diffs explicitly; do not assume a large diff is harmless.
- The exact release-candidate SHA has a successful CI run.

## 2. Automated gates

The required CI jobs must all succeed:

- `checks`: lint, typecheck, docs, unit tests and the production build;
- `integration`: `test:integration` against real databases;
- `release-gate`: the compiled app on a synthetic database, over HTTP and in a
  browser, on every push and PR;
- the arm64 `web-image` on PRs into `main` and `main` pushes. The image carries
  `GIT_COMMIT` and `GIT_TREE`; CD compares the baked tree with the tree CI tested.

Read the production advisory surface in the `integration` job log. Every
production advisory must have a recorded disposition in
`tests/ci/audit-runtime.mjs`.

PocketBase smoke and clean-room no longer run in CI. When a change touches the
migration tooling, run `scripts/legacy-pocketbase-ci.sh` yourself
([legacy-tooling.md](legacy-tooling.md)).

The full browser suite is not in CI; run `bun run test:e2e` locally when the
change touches browser behaviour.

Do not bypass CI by manually recreating production or staging containers.

## 3. Public staging acceptance

Verify from `https://staging.ieeesahrdaya.com`, not only localhost:

- `/`;
- `/events` and at least one `/events/:slug`;
- `/societies` and at least one society page;
- `/full-execom`;
- `/healthz`;
- `/robots.txt`.

Faster and wider than clicking through by hand: deploy staging, then run

```bash
scripts/audit/run-staging-audit.sh
```

It checks all of the above plus every admin route, the audit rows, registration/
ticket/certificate flows, both home rails, mobile navigation and axe. Expected
baseline: 137/137 deep, 19/19 admin routes, 22/22 UI, 15/15 accessibility. See
`.opencode/skill/staging-audit/SKILL.md`.

## 4. Authentication and admin acceptance

The staging snapshot has production OAuth disabled by design. Before authenticated acceptance, configure a separate staging OAuth client or create a disposable staging-only test account. Never copy production OAuth secrets into staging.

With the appropriate staging role, verify:

- sign-in and sign-out;
- admin route guard;
- dashboard metrics;
- event create/edit/publish/archive behavior;
- registration listing/detail/export paths;
- QR/ticket check-in validity and duplicate check-in handling;
- society create/edit and chair scoping;
- execom create/edit and public privacy behavior;
- user role-change command;
- coupon create/edit/expiry/max-use behavior;
- an admin edit appears in the dashboard activity feed (`admin_audit_log`);
- file upload persistence across a web-container restart.

Use disposable staging records and remove them after verification.

## 5. Registration and payment invariants

Verify at least one disposable registration flow:

- registration is rejected when closed, outside its registration window, or full;
- capacity cannot be oversubscribed;
- a successful free registration creates a valid ticket;
- an admin can manually confirm a pending paid registration, with one stable ticket and both ticket/receipt email jobs queued;
- cancellation releases capacity and cannot be resurrected by an unrelated payment callback;
- invalid/duplicate check-in is rejected;
- coupon usage is applied once and respects expiry/max-use constraints.

For paid events, verify the enabled production payment integration and webhook secret before cutover. Never copy a production payment secret into staging merely to make a test pass.

For PayGate v4, verify before accepting real registrations:

- `PAYGATE_URL`, `PAYGATE_API_KEY`, and `PAYGATE_WEBHOOK_SECRET` belong to the intended IEEE environment;
- PayGate's outgoing webhook targets `/api/webhooks/paygate` on the same IEEE environment;
- event, registration and environment metadata round-trip unchanged and reject foreign-environment callbacks;
- the event's final payable amount after discounts is a whole rupee before PayGate assigns its verification adjustment;
- the exact `upi_uri` returned by PayGate is used unchanged for both QR rendering and mobile UPI handoff;
- a real low-value test confirms PayGate v4 payment creation → UPI payment → signed webhook/reconciliation → ticket/email;
- callback loss is recoverable through explicit/background reconciliation;
- event cancellation or a released seat followed by a late credit produces manual review and never resurrects a ticket.

## 6. Production configuration

Confirm the production Dokploy project has the intended values before merge:

```text
DEPLOY_ENV=production
SITE_URL=https://ieeesahrdaya.com
PB_ENCRYPTION_KEY=<production-only value>
```

Confirm any enabled backend integrations separately:

```text
PAYGATE_URL
PAYGATE_API_KEY
PAYGATE_WEBHOOK_SECRET
PAYGATE_REGISTRATION_GRACE_SECONDS
PAYGATE_WEBHOOK_TOLERANCE_SECONDS
PAYGATE_CLIENT_NAMESPACE    # optional explicit environment/client namespace
FOOTBALL_DATA_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Certificate-platform releases must also follow `docs/certificate-production-runbook.md`. A production deployment may keep all outbound mail disabled: set a production-only renderer capability key and explicitly set `MAIL_DELIVERY_MODE=disabled`. From a clean exact release-candidate checkout, run `scripts/certificate-release-preflight.sh` with `EXPECTED_SHA=<candidate SHA>` and `CHECK_RUNTIME=0` against the intended production environment file. After CI-gated production deployment, rerun it from the exact deployed `main` checkout with `EXPECTED_SHA=<CD TESTED_SHA>` and `CHECK_RUNTIME=1`. Only if live certificate email is separately authorized later should the operator configure Gmail SMTP (`smtp.gmail.com:587`, `SMTP_TLS=false` for STARTTLS, full account username, dedicated Google App Password), set `MAIL_DELIVERY_MODE=live`, and rerun the preflight with `REQUIRE_MAIL_LIVE=1` before any Send action or controlled `[TEST / NOT VALID]` SMTP acceptance test.

Also verify:

- production Google OAuth redirect/origin configuration;
- `/` and `/api` are served by the app server, with no proxy to PocketBase;
- PocketBase's administration paths are not routed on the public host;
- production and staging use different databases, uploads and encryption keys;
- the production web container has no PocketBase superuser credential.

## 7. Backup and migration rehearsal

Immediately before production deployment:

- take a fresh backup of the production database and uploads with `scripts/ieee-backup-export.sh`;
- keep the backup outside the volume being upgraded;
- confirm the migration set has already succeeded against a recent scrubbed copy of production data;
- confirm file storage was included in the rehearsal/backup plan;
- record the pre-deploy production Git SHA and backup location.

Do not rely on automatic reverse migrations after destructive schema changes.

## 8. Deployment

Staging deployment path (from the operator's machine):

```text
./scripts/deploy-local.sh --staging
  → checks the worktree is committed, clean and pushed
  → typecheck + unit suite
  → build with the worktree compose file, labelled with the commit and tree
  → recreate web in ieee-dev-staging
  → print the running container's image, creation time and baked commit
  → wait for https://staging.ieeesahrdaya.com/healthz to be ready AND to report
    the build fingerprint of the commit just built
```

A printed `Deployed <sha>` therefore means the new container is serving. A stale
image, an unreplaced container or a router still on the old one fails the run.

Before the first production release that includes the integration guard, confirm
on staging that `/admin/data-health` shows `PayGate is configured but refused`
(or nothing about PayGate) rather than a working paid flow. A staging stack with
no PayGate sandbox declaration refuses paid registration initiation by design;
that is not a regression.

Production deployment path:

```text
merge/push main
  → CI
  → successful CI workflow_run
  → CD freshness check
  → DOCKPLOY_WEBHOOK_PROD
  → production Dokploy Compose deployment
  → CD verifies /healthz reports the tested release's build fingerprint (≤ 300 s)
```

`Production Health` also runs automatically when that CD run finishes and
re-checks readiness and identity. A webhook `200` alone is not a successful
release.

Do not start replacement containers manually under either Compose project name.

## 9. Post-deploy verification

After Dokploy reports healthy services, verify:

- `/` returns 200 and expected current UI;
- `/healthz` returns 200 **and** `"ok": true`, with `build` equal to the
  fingerprint of the released commit — the CD run and the `Production Health`
  run should already have asserted this;
- the running container's baked commit matches the release:
  `docker exec ieee-rewrite-i9ir8q-web-1 cat /app/build/git-commit`;
- event/society public routes return expected content;
- production `robots.txt`/sitemap behavior is correct;
- staging remains noindexed;
- production Google login initializes;
- one safe authenticated/admin read succeeds where configured;
- an admin edit produces an `admin_audit_log` row visible in the activity feed;
- uploaded files resolve;
- `/verify` renders the public registry design;
- `/admin/certificates` loads for a role with `certificates.view` and remains read-only;
- registry email visibility still requires event-scoped `registrations.view`, and delivery-error detail still requires `certificates.send`;
- web logs show no startup/runtime error spike;
- the boot log line `[boot] integrations: …` names the integrations you expect
  for this environment.

If a rollback is required, restore application code through Git/Dokploy. Treat database rollback as a separate explicit operation based on the backup and the exact migrations that ran.

## 10. Operator steps this repository cannot perform

These remain open after merging operations/hardening work. None was performed
while writing the code or these documents. No credential was read, changed,
rotated or probed, and nothing on the host was restarted.

1. **CI passes the identity build args — done.** `web-image` supplies
   `GIT_COMMIT` and `GIT_TREE` (`.github/workflows/ci.yml`), the Dockerfile bakes
   them both into `build/build-info.json` and the `build/git-*` files, and CD
   verifies the running tree against the published `ieee.tree` label. Nothing
   remains for an operator here; the instruction is kept so the next reader knows
   the contract exists and must not be dropped.
2. **Staging integration isolation.** Give staging its own PayGate sandbox
   merchant/keys with `PAYGATE_SANDBOX=true`, a disposable SMTP relay with
   `MAIL_DELIVERY_MODE=disabled` or `allowlist`, and a separate Google OAuth
   client. Anything ever shared between the two environments should be rotated;
   that rotation has **not** been done and is not claimed to be done. See
   `docs/deployment.md` § Staging integration isolation. Until staging declares a
   sandbox, paid registration refuses initiation, webhooks and status together,
   and mail is rewritten or disabled — by design, not a regression.
3. **Wire the upload marker into the existing offsite job.** Offsite copies are
   made by the host job `important-backup.py`; the 2026-11-24 audit verified the
   B2 archive it produces, so the copy itself is live. Do **not** re-enable
   Restic, which is not the current mechanism. The remaining step is for that job
   to end each successful run by calling
   `scripts/backup-offsite-verify.sh --mode upload` with the store's checksum
   (drop `--restic-snapshot` unless the job is a Restic one). Until then the
   watchdog reports a missing offsite upload marker once
   `IEEE_BACKUP_GRACE_UNTIL_EPOCH` passes, which is correct.
4. **Schedule a restore drill.** Not daily: the archive is about 98 MB, and B2's
   free egress allowance is roughly three times stored data per day. Run a drill on
   a slow cadence (monthly is reasonable) with `--mode drill … --read-back …
   --restore-checked`, then set `IEEE_OFFSITE_REQUIRE_DRILL=1` in the watchdog's
   cron entry so an overdue drill alerts. Keep the drill under the same egress
   budget as the upload job.
5. **PocketBase retirement, if it is going away.** It is already out of the
   default stack on the host (`profiles: [legacy-pocketbase]`, 2026-11-23) and the
   tracked Compose now matches. Removing the service and the `pb_data` volume
   entirely is a separate deliberate operation; the volume key is unchanged, so the
   existing `<project>_pb_data` volume and its archive names are preserved until
   then. Do not treat the legacy profile as a rollback path.
6. **Archive format consolidation.** The in-app `.tar.gz` and the offsite `.zip`
   both remain. Consolidating them needs a rollout story that covers the copies
   already on disk at both sites; there is no such story today.
