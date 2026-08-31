# Certificate Platform — Production Runbook

This runbook prepares the certificate platform for production without issuing a real credential. Real workshop issuance is a separate operator decision.

## Release boundaries

- `dev`/staging is the acceptance environment.
- `main`/production must not move until the exact release candidate has passed CI and staging acceptance.
- Do not issue or send real certificates as part of the application deployment itself.
- Back up production PocketBase data and files before the first certificate migration reaches production.
- Keep **Issue** and **Send** as separate operator actions after release.

## Required production configuration

```text
DEPLOY_ENV=production
SITE_URL=https://ieeesahrdaya.com
CERTIFICATE_RENDER_CAPABILITY_KEY=<production-only random 32+ character value>
CERTIFICATE_MAIL_PROVIDER=smtp
MAIL_DELIVERY_MODE=live
```
PocketBase SMTP is applied at bootstrap from environment variables:

```text
SMTP_HOST=<mail server>
SMTP_PORT=<usually 587 or provider-specific port>
SMTP_USERNAME=<SMTP account when authentication is required>
SMTP_PASSWORD=<SMTP password/app password when required>
SMTP_TLS=true
SMTP_FROM=IEEE Sahrdaya <approved-sender@example.org>
```

`SMTP_FROM` must be an address permitted by the configured SMTP account/domain. The application treats SMTP success as **Accepted**, never as proof of inbox delivery.

Before production, confirm the sender domain has appropriate SPF/DKIM and DMARC policy for the actual SMTP sender. Do not add Resend credentials when SMTP is the selected transport.

## Pre-deploy checks

1. Record current production Git SHA and Dokploy Compose project state.
2. Confirm the release candidate is a reviewed fast-forward/merge from the staging-accepted code.
3. Confirm CI is green for the exact candidate SHA.
4. Confirm staging `/`, `/healthz`, `/verify`, and an ACTIVE synthetic `/c/:token` have passed browser acceptance.
5. Confirm staging PocketBase `/_/` is not publicly routed.
6. Confirm no synthetic staging data remains after acceptance restores.
7. From the exact release-candidate working tree, run the certificate release preflight against the intended production environment file:

```bash
EXPECTED_SHA=<exact-staging-accepted-candidate-sha> \
CHECK_RUNTIME=0 \
TARGET_ENV=production \
BASE_URL=https://ieeesahrdaya.com \
ENV_FILE=/path/to/rendered-production.env \
./scripts/certificate-release-preflight.sh
```

The environment file must stay outside Git. This pre-deploy pass requires a clean checkout at the explicit candidate SHA and validates the production SMTP provider/live-mode configuration, renderer key, SMTP host/port/sender, and authentication pair without requiring certificate routes to exist on the still-old production deployment.

## Backup and rollback point

Immediately before production deployment:

- create a full backup of the production PocketBase volume, including database and uploaded files;
- store it outside the live volume;
- record its path, byte size, checksum, and creation time;
- verify the archive can be listed/read before deployment;
- record the pre-deploy `main` SHA.

Application rollback and data rollback are separate operations. Code can be rolled back through Git/Dokploy; restore PocketBase data only when the migration/data state requires it and only from the recorded backup.

## Post-deploy, before any issuance

Verify all of the following while the certificate registry may still be empty:

- `/` → HTTP 200;
- `/healthz` → HTTP 200;
- `/verify` renders with production site design language;
- `/api/health` → HTTP 200;
- `/_/` remains unavailable publicly;
- `/admin/certificates` loads for a role with `certificates.view`;
- the registry remains read-only: lifecycle changes still happen only in the event-scoped certificate workflow;
- registry recipient email is present only where that event also grants `registrations.view`;
- registry delivery error detail is present only where that event also grants `certificates.send`;
- Certificate Template Studio loads on an existing event;
- renderer fonts and capability key are healthy;
- production logs contain no migration or renderer startup errors.

From a clean checkout of the exact `main` SHA that CI/CD deployed, rerun the same preflight with runtime checks enabled and confirm the SHA matches the CD `TESTED_SHA` evidence:

```bash
EXPECTED_SHA=<exact-deployed-main-sha> \
CHECK_RUNTIME=1 \
TARGET_ENV=production \
BASE_URL=https://ieeesahrdaya.com \
ENV_FILE=/path/to/rendered-production.env \
./scripts/certificate-release-preflight.sh
```

This post-deploy pass must prove root/health/verification HTTP success, the verification UI marker, and public `/_/` isolation before any certificate issuance.

## SMTP acceptance test

Do this before real certificate issuance, using only the signed-in operator's authorized test inbox:

1. Open an event with a published certificate template.
2. Confirm **Mail transport ready** reports `SMTP`, `LIVE`, `ACCEPTED ONLY`.
3. Use **Test Email**. It must remain `[TEST / NOT VALID]` and must not create a certificate, batch, or outbox job.
4. Confirm the message is accepted by SMTP and arrives in the intended inbox.
5. Inspect desktop/mobile email rendering and both links.
6. Confirm the sample Credential ID remains `TEST-NOT-VALID` and does not verify as a real credential.

If SMTP rejects the message, the readiness state is wrong, or the message does not arrive reliably, stop. Do not issue the real workshop batch.

## Permission acceptance

At minimum verify these role boundaries in production after deployment:

- `certificates.view` → Template/Registry read access;
- `registrations.view` in the same event scope → registry recipient email visibility;
- `certificates.manage_templates` → create/edit/publish template versions and `[TEST / NOT VALID]` Test Email;
- `certificates.issue` → recipient Review and Issue;
- `certificates.send` → Send, Retry failed, and registry delivery-error detail;
- `certificates.revoke` → Revoke and Replace/Supersede.

A user without the relevant capability must not gain access by deep-linking directly to an API route or admin page.
## Rollback triggers

Stop the release and consider rollback if any of these occur:

- PocketBase migration/startup errors;
- certificate renderer returns 5xx or mismatched dimensions;
- public verification exposes private recipient data;
- `/_/` becomes publicly reachable;
- certificate permissions are broader than intended;
- SMTP readiness reports ready when SMTP host/port/sender are incomplete;
- existing registration/payment/event workflows regress.

## Deferred real rollout

The following are intentionally outside this deployment runbook and remain deferred until the workshop operator is ready:

- final Cybersecurity certificate artwork selection;
- final attendee/eligibility list;
- production Issue;
- sample credential review after Issue;
- production Send;
- SMTP acceptance/failure monitoring for the real batch.

`attendance_qualified` remains disabled until genuine multi-session attendance records exist.
