# IEEE Sahrdaya — contributor architecture contract

## Stack

- React 19 + React Router 7 Framework Mode
- TypeScript + Vite + Tailwind CSS 4
- TanStack Query for browser query caching only
- PocketBase 0.39.9 for auth, data, files, API rules, hooks, and migrations
- Docker Compose on Dokploy

## Hard boundaries

1. `/api/*` is PocketBase. Do not add React Router API/BFF routes.
2. Browser auth is the PocketBase JS SDK on the same origin.
3. SSR public reads use `src/server/public/*.server.ts` with an unauthenticated PocketBase client.
4. Never add a runtime PocketBase superuser token to the web service.
5. Ordinary CRUD uses PocketBase collections. Use a custom PB route only for a real transaction, privileged command, webhook, or server-only integration.
6. `pb_migrations/` is the only schema/rule/index source of truth.
7. Financial/ticket/capacity invariants must be enforceable without trusting the React UI.
8. Production and staging databases are physically separate.

## Important commands

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

Local backend:

```bash
docker compose -f docker-compose.local.yml up --build
PORT=3000 bun run dev
```

## Routing

Route ownership is explicit in `src/routes.ts`. Public content that should rank must be SSR and have a stable leaf URL. Event slugs are immutable after creation.

## Backend changes

- API access control → PocketBase collection rules.
- State-transition invariant → PocketBase request/model hook.
- Multi-record all-or-nothing operation → PocketBase custom route + `runInTransaction`.
- New fields/collections/indexes/rules → migration, never an ad-hoc superuser script.

Current commands include event registration/coupon sync, admin role changes, FIFA bets/settlement/voids, payment confirmation, ticket lookup, and live scores.

## Testing expectation

A change is not complete until it survives a fresh PocketBase database. CI creates one, applies all migrations/hooks, and exercises the real backend with `tests/backend/pocketbase_smoke.py`.

Browser E2E is for navigation/SSR/SEO/guards; backend authorization and transaction behavior belongs in the clean-room backend suite.

## Deployment

Web builds with Bun 1.2.9 but runs SSR on Node 22. PocketBase is pinned to 0.39.9 with release SHA verification. Do not switch either to an unbounded `latest` tag.

CD runs only after successful CI and calls the Dokploy Compose API. Do not reintroduce independent branch webhooks or swallowed deployment failures.
