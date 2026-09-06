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
PB_ENCRYPTION_KEY=<32-character high-entropy key>
CERTIFICATE_RENDER_CAPABILITY_KEY=<32+ character high-entropy key, unique per environment>
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

Never reuse a production encryption key, OAuth application, payment secret, SMTP credential, or `pb_data` volume in staging.

## Certificate mail production readiness

Certificate issuance and certificate mail delivery are separate operations. Before enabling bulk Send, confirm the admin **Send & delivery** panel reports the environment as mail-ready.

The certificate platform can be deployed while outbound mail is intentionally disabled. The safe production release configuration is:

```text
MAIL_DELIVERY_MODE=disabled
```

With delivery disabled, certificate Issue/verification/rendering can operate, while Send/Retry remain blocked before creating certificate outbox jobs and the background notification worker leaves existing outbox intents untouched. SMTP transport readiness is not a release prerequisite while mail remains disabled.

Certificate mail has one transport: Gmail SMTP through PocketBase. When live certificate email is explicitly authorized, configure `smtp.gmail.com` on port `587`, keep PocketBase `SMTP_TLS=false` so it negotiates STARTTLS, use the full Gmail or Google Workspace address as the username, and use a Google App Password as the SMTP password. Then set:

```text
MAIL_DELIVERY_MODE=live
```

The readiness API/UI checks the delivery safety mode and actual PocketBase SMTP/sender configuration. A successful SMTP handoff is shown as **accepted only** because Gmail SMTP acceptance is not proof that the recipient inbox ultimately delivered the message.

Before production mail is enabled, verify the sending domain in the provider and confirm DKIM, return-path SPF/MX, and DMARC are published. Start DMARC monitoring with a non-enforcing policy such as `v=DMARC1; p=none;`, then tighten the policy only after observing legitimate traffic and alignment.

Staging must never use `MAIL_DELIVERY_MODE=live`; use `disabled`, `redirect`, or a tightly controlled `allowlist` for test delivery.

## Routing and networks

Each public environment host has two routes:

```text
/api  → pocketbase:8090, path preserved
/     → web:3000
```

Do not publish application host ports from Compose and do not expose PocketBase `/_/` through a public hostname.

Both services join Dokploy's proxy network. Web and PocketBase also share the private `app-internal` network. SSR uses `POCKETBASE_INTERNAL_URL=http://pocketbase-internal:8090`; the explicit alias avoids service-name collisions between multiple Dokploy projects attached to the same proxy network.

Cloudflare terminates public HTTPS for the current hosts and forwards to the matching Traefik HTTP router. Do not enable an origin redirect that sends Cloudflare back to the same HTTPS URL; that creates a redirect loop.

## Environments

### Production

```text
branch: main
host:   https://ieeesahrdaya.com
app:    ieee-rewrite-i9ir8q
volume: ieee-rewrite-i9ir8q_pb_data
```

Production uses production-only OAuth/integration configuration and must never consume staging data or secrets.

### Staging/development

```text
branch: dev
host:   https://staging.ieeesahrdaya.com
app:    ieee-dev-staging
volume: ieee-dev-staging_pb_data
```

Staging is a separate Dokploy environment and Compose project. It uses:

```text
DEPLOY_ENV=staging
SITE_URL=https://staging.ieeesahrdaya.com
```

The initial staging data was created from a verified, scrubbed production snapshot on 2026-08-01. The copy has its own volume and encryption key, production integrations are empty, and OAuth is disabled so production OAuth credentials are not reused. Configure a separate staging OAuth client or disposable test account before authenticated acceptance.

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

Back up the production PocketBase data volume before schema deployments. Migrations must be forward-safe on a recent copy of production data before rollout.

Staging data is disposable but its volume must still remain separate from production. Refreshing staging from production is an explicit scrubbed-copy operation, not continuous replication.

Application rollback is a Git/Dokploy deployment operation. Database rollback is not assumed to be safe automatically after destructive schema changes; prefer additive migrations and explicit data migrations.
