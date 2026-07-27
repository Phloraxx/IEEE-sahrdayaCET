# Deployment

## Runtime images

### Web

The web image installs and builds with Bun 1.2.9. The final SSR runtime is Node 22 Alpine.

Node is intentional: runtime smoke testing showed that serving React Router SSR under Bun selected React DOM's Bun server build, which did not provide the stream API expected by `@react-router/serve`.

### PocketBase

`pocketbase/Dockerfile` pins PocketBase 0.39.9, supports amd64/arm64, and verifies the downloaded release archive by SHA-256 before extraction.

Hooks and migrations are baked into the image. Only `/pb/pb_data` is persistent.

## Dokploy Compose projects

Production and staging must be separate Dokploy Compose projects built from `docker-compose.yml`.

Required environment values:

```text
DEPLOY_ENV=production|staging
SITE_URL=https://...
PB_ENCRYPTION_KEY=<32-character high-entropy key>
```

Optional backend integrations are configured only where enabled:

```text
PAYMENT_WEBHOOK_SECRET
FOOTBALL_DATA_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Never reuse a production encryption key, OAuth application, payment secret, or `pb_data` volume in staging.

## Routing and networks

Each public environment host has two routes:

```text
/api  → pocketbase:8090, path preserved
/     → web:3000
```

Do not publish host ports from Compose and do not expose PocketBase `/_/` through the public hostname.

Both services join Dokploy's proxy network. Web and PocketBase also share the private `app-internal` network. SSR uses `POCKETBASE_INTERNAL_URL=http://pocketbase-internal:8090`; the explicit alias avoids service-name collisions between multiple Dokploy projects attached to the same proxy network.

## Environments

### Production

`main` is the canonical production source branch. Production deployments use production-only secrets and the production PocketBase volume.

### Staging

`dev` remains the integration branch, but automatic dev deployment is currently paused after the 2026 rewrite cutover. A new staging deployment must be a separate Dokploy Compose project with its own `pb_data`, OAuth configuration, encryption key, secrets, and hostname before CD is re-enabled for `dev`.

Do not attach `staging.ieeesahrdaya.com` to the production Compose project.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `dev`, on pull requests, and on manual dispatch.

It has three gates:

1. lint, typecheck, unit tests, and production web build;
2. a clean-room PocketBase boot, backend invariant smoke suite, and Playwright Chromium tests;
3. production Docker builds for the web and PocketBase images.

The clean-room backend starts with an empty PocketBase data directory. A successful run proves that committed migrations and hooks can construct a usable backend without depending on a long-lived database.

## CD

`.github/workflows/cd.yml` is CI-gated and currently reacts only to successful `CI` completion on:

```text
main
```

Before deployment, CD queries GitHub and verifies that the SHA tested by CI is still the current `main` head. If a newer commit exists, that older deployment is skipped.

The workflow then calls the production Dokploy deployment webhook with a GitHub-style push payload. Required repository/environment secret:

```text
DOCKPLOY_WEBHOOK_PROD
```

`DOCKPLOY_WEBHOOK_DEV` is intentionally unused while isolated staging is not provisioned.

`workflow_run` workflows are evaluated from the repository default branch. Therefore the CD workflow definition needed to trigger deployments must also exist on the default branch.

The webhook is a deployment trigger, not an immutable image reference. The production Dokploy project must track `main`. There remains a narrow branch-head-check-to-build race if another push lands immediately after the freshness check. Eliminating that completely would require immutable SHA-tagged registry images.

## Do not manually replace Dokploy services

Do not launch a second Compose file, fallback image, or manually created container under the same Dokploy Compose project/service name.

A manual container can appear healthy while serving stale code and can shadow the service that Dokploy believes it manages. Source deployments must be performed through the repository CI/CD path or the canonical Dokploy project Compose configuration.

If an environment appears stale, verify the running container labels before debugging application code. The web service should point to the Dokploy project working directory and canonical `docker-compose.yml`, not a temporary file elsewhere on the server.

## Production release procedure

Before a future production deployment:

1. promote accepted changes to `dev`;
2. use/provision isolated staging for authenticated and schema-sensitive acceptance;
3. get full CI green and open/review the `dev` → `main` production PR;
4. validate enabled OAuth/payment/live-score/SMTP integrations in the target environment;
5. take a fresh production PocketBase backup;
6. confirm production environment variables, domains, volumes, OAuth redirects, and that the production Dokploy project tracks `main`;
7. merge to `main` and let CI-gated CD deploy production;
8. verify `/`, `/healthz`, `/api/health`, critical public routes, login, and one safe authenticated read after deployment.

See `docs/release-checklist.md` for the detailed acceptance list.

## Backup and rollback

Back up the production PocketBase data volume before schema deployments. Migrations must be forward-safe on a copy of production data before rollout.

Application rollback is a Git/Dokploy deployment operation. Database rollback is not assumed to be safe automatically after destructive schema changes; prefer additive migrations and explicit data migrations.