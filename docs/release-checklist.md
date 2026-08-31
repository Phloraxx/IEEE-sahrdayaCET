# Production Release Checklist

Use this checklist for future schema-sensitive releases from `dev` staging to `main` production.

## 1. Source control

- Release branch contains every intended application, migration, hook, workflow, and documentation change.
- Reconcile the latest `main` into `dev` before the final production PR when the branches have diverged.
- Review unexpected deletions and infrastructure diffs explicitly; do not assume a large diff is harmless.
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

Do not bypass CI by manually recreating production or staging containers.

## 3. Public staging acceptance

Verify from `https://staging.ieeesahrdaya.com`, not only localhost:

- `/`;
- `/events` and at least one `/events/:slug`;
- `/societies` and at least one society page;
- `/blog` and at least one blog post;
- `/full-execom`;
- `/FIFA`, `/FIFA/matches`, `/FIFA/leaderboard`, `/FIFA/rules`;
- `/healthz`;
- `/api/health`.

Check responsive layouts, navigation, browser console/page errors, hydration, canonical/metadata output, file images, and the required `noindex, nofollow` behavior on staging.

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
- blog create/edit/publish/unpublish and timestamp sorting;
- coupon create/edit/expiry/max-use behavior;
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

For the temporary Kotak/PayGate fallback, verify it only on events that explicitly select `Kotak direct UPI · temporary`:

- `PAYGATE_URL`, `PAYGATE_API_KEY`, and `PAYGATE_WEBHOOK_SECRET` belong to the intended environment;
- PayGate's outgoing webhook targets `/api/webhooks/paygate` on the same IEEE environment;
- the PayGate UPI destination is the intended Kotak account and bank-message verification is healthy;
- the event's final payable amount after any coupon is a whole rupee before PayGate adds its unique 1–99 paise verification suffix;
- a real low-value test confirms exact-amount UPI → Kotak credit → signed webhook/reconciliation → ticket/email;
- event cancellation or a released seat followed by a late bank credit produces manual review and never resurrects a ticket;
- once Razorpay UPI Intent is available, switch new registrations back to `Razorpay · default`; existing registrations remain locked to the provider they started with.

For Razorpay specifically, verify before accepting real registrations:

- payment capture is configured for automatic capture, so successful UPI payments do not remain `authorized`;
- UPI Intent is enabled for the merchant account before exposing mobile app buttons;
- desktop UPI QR succeeds independently of Intent enablement;
- the production webhook points to `/api/webhooks/razorpay` and subscribes to payment capture/failure, order paid, refund, and dispute events used by the hook;
- one real-device smoke test covers Android/iOS mobile handoff as supported by the merchant account and one desktop QR payment;
- a callback-loss test confirms webhook or explicit reconciliation still reaches the correct final state.

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
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_CHECKOUT_HOLD_SECONDS
PAYMENTS_ENABLED
PAYGATE_URL                 # only while temporary Kotak fallback is enabled
PAYGATE_API_KEY             # only while temporary Kotak fallback is enabled
PAYGATE_WEBHOOK_SECRET      # only while temporary Kotak fallback is enabled
FOOTBALL_DATA_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Certificate-platform releases must also follow `docs/certificate-production-runbook.md`. Before real issuance, production must use `CERTIFICATE_MAIL_PROVIDER=smtp`, `MAIL_DELIVERY_MODE=live`, a production-only renderer capability key, and the controlled `[TEST / NOT VALID]` SMTP acceptance test from that runbook. From a clean exact release-candidate checkout, run `scripts/certificate-release-preflight.sh` with `EXPECTED_SHA=<candidate SHA>` and `CHECK_RUNTIME=0` against the intended production environment file. After CI-gated production deployment, rerun it from the exact deployed `main` checkout with `EXPECTED_SHA=<CD TESTED_SHA>` and `CHECK_RUNTIME=1` before any issuance.

Also verify:

- production Google OAuth redirect/origin configuration;
- production domain routes `/api → PocketBase` and `/ → web`;
- no public PocketBase `/_/` route;
- production and staging use different `pb_data` volumes and encryption keys;
- the production web container has no PocketBase superuser credential.

## 8. Backup and migration rehearsal

Immediately before production deployment:

- take a fresh backup of the production PocketBase data volume/database and files;
- keep the backup outside the volume being upgraded;
- confirm the migration set has already succeeded against a recent scrubbed copy of production data;
- confirm file storage was included in the rehearsal/backup plan;
- record the pre-deploy production Git SHA and backup location.

Do not rely on automatic reverse migrations after destructive schema changes.

## 9. Deployment

Staging deployment path:

```text
merge/push dev
  → CI
  → successful CI workflow_run
  → CD freshness check
  → DOCKPLOY_WEBHOOK_DEV
  → isolated staging Dokploy Compose deployment
```

Production deployment path:

```text
merge/push main
  → CI
  → successful CI workflow_run
  → CD freshness check
  → DOCKPLOY_WEBHOOK_PROD
  → production Dokploy Compose deployment
```

Do not start replacement containers manually under either Compose project name.

## 10. Post-deploy verification

After Dokploy reports healthy services, verify:

- `/` returns 200 and expected current UI;
- `/healthz` returns 200;
- `/api/health` returns 200;
- event/society/blog/FIFA public routes return expected content;
- production `robots.txt`/sitemap behavior is correct;
- staging remains noindexed;
- production Google login initializes;
- one safe authenticated/admin read succeeds where configured;
- uploaded files resolve;
- `/verify` renders the public registry design;
- `/admin/certificates` loads for a role with `certificates.view` and remains read-only;
- registry email visibility still requires event-scoped `registrations.view`, and delivery-error detail still requires `certificates.send`;
- web and PocketBase logs show no migration/startup/runtime error spike.

If a rollback is required, restore application code through Git/Dokploy. Treat database rollback as a separate explicit operation based on the backup and the exact migrations that ran.
