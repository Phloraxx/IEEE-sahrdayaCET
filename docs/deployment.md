# Deployment

## Images

### Web

The web image builds dependencies and React Router output with Bun 1.2.9. The final SSR runtime is Node 22 Alpine.

Node is intentional: runtime smoke testing showed that serving React Router SSR under Bun selected React DOM's Bun server build, which did not provide the stream API expected by `@react-router/serve`.

### PocketBase

`pocketbase/Dockerfile` pins PocketBase 0.39.8, supports amd64/arm64, and verifies the downloaded release archive by SHA-256 before extraction.

Hooks and migrations are baked into the image. Only `/pb/pb_data` is persistent.

## Dokploy Compose project

Create separate Compose projects for staging and production using `docker-compose.yml`.

Required environment values:

```text
DEPLOY_ENV=production|staging
SITE_URL=https://...
PB_ENCRYPTION_KEY=<32-character high-entropy key>
```

Add optional payment/live-score/SMTP secrets only where those integrations are enabled.

## Domains

Configure the public host with two routes:

```text
/api  → pocketbase, container port 8090, do not strip path
/     → web,        container port 3000
```

Do not publish host ports from Compose. Both services also join Dokploy's proxy network; web and PocketBase share an internal network for SSR reads.

Do not add a public route for PocketBase `/_/`.

## Staging

Use a different domain and a different `pb_data` volume. Configure the OAuth provider with staging redirect origins separately. The web app emits `X-Robots-Tag: noindex, nofollow` outside production and does not expose a staging sitemap.

## CI

`.github/workflows/ci.yml` has three gates:

1. lint, typecheck, unit tests, production build;
2. clean-room PocketBase boot + backend smoke + Playwright;
3. production Docker builds for both services.

The clean-room job starts with an empty PocketBase database. This is the proof that migrations are complete.

## CD

`.github/workflows/cd.yml` reacts only to a successful CI workflow on `dev` or `main`.

- `dev` → staging Dokploy Compose project.
- `main` → production Dokploy Compose project.
- it verifies the tested SHA is still branch head;
- it disables Dokploy auto-deploy for that Compose project;
- it calls Dokploy's Compose deploy API with `curl --fail-with-body`.

Dokploy's Compose deploy endpoint deploys the Compose project's configured Git branch and does not accept a commit SHA. The workflow therefore performs the branch-head SHA check immediately before triggering Dokploy. There remains a very narrow check-to-deploy race if a new push lands in that window; eliminating it completely would require an immutable artifact flow such as SHA-tagged registry images. That extra machinery is intentionally deferred until it is justified.

Required GitHub environment/repository secrets:

```text
DOKPLOY_URL
DOKPLOY_API_KEY
DOKPLOY_COMPOSE_STAGING_ID
DOKPLOY_COMPOSE_PROD_ID
```

Production should additionally use GitHub Environment protection/approval as appropriate.

## Backup and rollback

Back up the PocketBase data volume before production schema deployments. Migrations must be forward-safe on a copy of production data before rollout.

Application rollback is a Git/Dokploy deployment operation. Database rollback is not assumed to be safe automatically after destructive schema changes; prefer additive migrations and explicit data migrations.
