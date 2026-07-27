# Production Release Checklist

Use this checklist for the React Router + PocketBase production cutover and for future schema-sensitive releases.

## 1. Source control

- Release branch contains every intended application, migration, hook, workflow, and documentation change.
- Reconcile the latest `main` into the release branch before the final production PR/merge.
- Review unexpected deletions and infrastructure diffs explicitly; do not assume a large rewrite diff is harmless.
- The exact release-candidate SHA has a successful CI run.

## 2. Automated gates

The required CI jobs must all succeed:

- lint;
- TypeScript/typegen;
- Vitest unit tests;
- production React Router build;
- fresh PocketBase boot with all committed migrations/hooks;
- backend invariant smoke suite;
- Playwright Chromium E2E;
- web Docker image build;
- PocketBase Docker image build.

Do not bypass CI by manually recreating production containers.

## 3. Public staging acceptance

Verify from the public staging hostname, not only localhost:

- `/`;
- `/events` and at least one `/events/:slug`;
- `/societies` and at least one society page;
- `/blog` and at least one blog post;
- `/full-execom`;
- `/FIFA`, `/FIFA/matches`, `/FIFA/leaderboard`, `/FIFA/rules`;
- `/healthz`;
- `/api/health`.

Check responsive layouts, navigation, browser console/page errors, hydration, canonical/metadata output, file images, and `noindex` behavior on staging.

## 4. Authentication and admin acceptance

Use a staging account with the appropriate role and verify:

- Google OAuth sign-in and sign-out;
- admin route guard;
- dashboard metrics;
- event create/edit/publish/archive behavior;
- registration listing/detail/export paths;
- QR/ticket check-in validity and duplicate check-in handling;
- society create/edit and chair scoping;
- execom create/edit and public privacy behavior;
- user role-change command;
- blog create/edit/publish/unpublish and timestamp sorting;
- coupon create/edit/expiry/max-use behavior;
- file upload persistence across a web-container restart.

Use disposable staging records and remove them after verification.

## 5. Registration and payment invariants

Verify at least one disposable registration flow:

- registration is rejected when closed, outside its registration window, or full;
- capacity cannot be oversubscribed;
- a successful free registration creates a valid ticket;
- cancellation releases capacity and cannot be resurrected by an unrelated payment callback;
- invalid/duplicate check-in is rejected;
- coupon usage is applied once and respects expiry/max-use constraints.

For paid events, verify the enabled production payment integration and webhook secret before cutover. Never copy a production secret into staging merely to make a test pass.

## 6. WC Predict acceptance

For the FIFA/WC Predict feature, verify:

- authenticated dashboard/balance access;
- bet placement rejects invalid/oversized/late bets;
- accepted bet debits once and creates one ledger entry;
- settlement is admin-only and idempotent;
- market and match void commands refund once;
- leaderboard/rank updates are coherent after settlement;
- raffle/settings admin surfaces load and obey authorization;
- live-score data remains display-only and cannot settle balances automatically.

Use disposable staging economy data only.

## 7. Production configuration

Confirm the production Dokploy project has the intended values before merge:

```text
DEPLOY_ENV=production
SITE_URL=https://ieeesahrdaya.com
PB_ENCRYPTION_KEY=<production-only value>
```

Confirm any enabled backend integrations separately:

```text
PAYMENT_WEBHOOK_SECRET
FOOTBALL_DATA_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Also verify:

- production Google OAuth redirect/origin configuration;
- production domain routes `/api → PocketBase` and `/ → web`;
- no public PocketBase `/_/` route;
- production and staging use different `pb_data` volumes;
- the production web container has no PocketBase superuser credential.

## 8. Backup and migration rehearsal

Immediately before production deployment:

- take a fresh backup of the production PocketBase data volume/database and files;
- keep the backup outside the volume being upgraded;
- confirm the migration set has already succeeded against a recent copy of production data;
- confirm file storage was included in the rehearsal/backup plan;
- record the pre-deploy production Git SHA and backup location.

Do not rely on automatic reverse migrations after destructive schema changes.

## 9. Deployment

Production deployment path:

```text
merge/push main
  → CI
  → successful CI workflow_run
  → CD freshness check
  → DOCKPLOY_WEBHOOK_PROD
  → production Dokploy Compose deployment
```

Do not start replacement containers manually under the production Compose project name.

## 10. Post-deploy verification

After Dokploy reports healthy services, verify:

- `/` returns 200 and expected current UI;
- `/healthz` returns 200;
- `/api/health` returns 200;
- event/society/blog/FIFA public routes return expected content;
- production `robots.txt`/sitemap behavior is correct;
- Google login initializes;
- one safe authenticated/admin read succeeds;
- uploaded files resolve;
- web and PocketBase logs show no migration/startup/runtime error spike.

If a rollback is required, restore application code through Git/Dokploy. Treat database rollback as a separate explicit operation based on the backup and the exact migrations that ran.
