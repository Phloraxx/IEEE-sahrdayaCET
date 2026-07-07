# IEEE Sahrdaya Student Branch — AGENTS.md

Event management platform for the 14 IEEE technical societies of Sahrdaya
College of Engineering & Technology.

## Project

| Key      | Value |
|----------|-------|
| Stack    | **TanStack Start** (file-based routes, server functions), **React 19**, **TypeScript 5.8**, **Tailwind CSS 4**, **Framer Motion**, shadcn/ui primitives |
| Backend  | **PocketBase 0.39.1** (embedded SQLite, built-in auth, file storage, REST API) |
| Auth     | Google OAuth2 via PocketBase. Roles: `admin`, `chair`, `user` |
| Entry    | `src/routes/__root.tsx` — root route (HTML document, AuthProvider, head/SEO) |
| Admin    | `src/routes/admin.*.tsx` + `src/components/admin/` — admin dashboard (AdminSidebar, AdminGuard, AdminTopbar, KeyboardShortcuts) |
| Config   | `vite.config.ts` (TanStack Start plugin), `tsconfig.json` (path alias `@/` → `./src/*`), `vitest.config.ts`, `playwright.config.ts` |

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (TanStack Start) |
| `npm run build` | Production build (Vite) |
| `npm start` | Start production server (`node dist/server/server.js`) |
| `npm run lint` | Run ESLint (`eslint src`) |
| `npm test` | Run unit tests (Vitest) — files in `tests/unit/**/*.test.ts` |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:ui` | Vitest with UI dashboard |
| `npm run test:e2e` | Run Playwright e2e tests (`tests/e2e/`) |
| `npm run test:e2e:headed` | Playwright with browser GUI |
| `bun run migrate:pb` | Apply PocketBase schema (`scripts/migrate-to-pb.ts`) |
| `bun run migrate:pb-rules` | Apply PocketBase collection API rules (`scripts/migrate-pb-rules.ts`) — source of truth for security rules |
| `bun run migrate:events` | Migrate events (`scripts/migrate-events.ts`) |
| `bun run migrate:indexes` | Apply DB indexes (`scripts/migrate-indexes.ts`) |
| `bun run migrate:game-schema` | Create FIFA game collections (`scripts/migrate-game-schema.ts`) — run once after schema changes |
| `bun run migrate:game-backfill` | Seed FIFA settings + grant starting balance to existing users (`scripts/migrate-game-backfill.ts`) |
| `bun run generate:sitemap` | Generate sitemap (`scripts/generate-sitemap.ts`) |
| `docker compose up` | App via `docker-compose.yml`; PocketBase via separate `docker-compose.pb.yml` |

**Environment**: copy `.env.example` → `.env.local`, set `POCKETBASE_URL`,
`PUBLIC_APP_URL`, `OAUTH_COOKIE_SECRET`, `PAYMENT_WEBHOOK_SECRET`,
`INTERNAL_API_SECRET`, and `POCKETBASE_SUPERUSER_TOKEN` (migrations only).

## Architecture

```
src/
├── routes/                      # File-based dot-delimited routes (TanStack Start)
│   ├── __root.tsx               # Root route (HTML shell, AuthProvider, head/SEO)
│   ├── index.tsx                # Home page
│   ├── events.tsx               # Events listing
│   ├── societies.tsx            # Societies listing
│   ├── full-execom.tsx          # Full execom page
│   ├── register.$eventId.tsx    # Event registration
│   ├── ticket.$ticketId.tsx     # Ticket view
│   ├── admin.tsx                # Admin layout (guard, sidebar, topbar)
│   ├── admin.*.tsx              # Admin pages (events, registrations, societies, users, execom, check-in, payments)
│   └── api/                     # Server function handlers
│       ├── auth/                #   OAuth2 init, callback, me, logout
│       ├── registrations.ts     #   GET (list user's), POST (register) + rate limit
│       ├── events.*.ts          #   Event detail, CSV export, coupon validation (proxy)
│       ├── check-in.verify.ts   #   QR check-in verification + rate limit
│       ├── society.$slug.ts     #   Public society detail + events
│       ├── ticket.$ticketId.ts  #   Public ticket lookup (QR)
│       └── admin/               #   Admin API handlers
│           ├── events.ts        #   CRUD events + dashboard stats
│           ├── registrations.ts #   Registrations admin view
│           ├── societies.ts     #   Society CRUD
│           ├── users.ts         #   User management
│           ├── execom.ts        #   Execom management (no PII)
│           └── stats.ts         #   Dashboard KPIs
├── features/                    # Feature-specific page components
│   ├── globals.css              # Tailwind v4 + CSS custom properties
│   ├── admin/                   # Admin page components (OverviewClient, EventsTableClient, etc.)
│   ├── events/                  # Event page components
│   ├── societies/               # Society page components
│   ├── execom/                  # Execom page components
│   ├── register/                # Registration page components
│   └── ticket/                  # Ticket page components
├── components/
│   ├── admin/                    # Admin UI (sidebar, page transitions, guards, animated counter, sparkline)
│   ├── events/                   # Event cards, detail modal, hero, list section
│   └── ui/                       # shadcn/ui primitives (button, dialog, table, sidebar, card, form, etc.)
├── lib/                          # Server-side + shared logic
│   ├── pb.ts                     # PocketBase client factory
│   │                             #   createPB(cookie?) → client from session cookie
│   │                             #   buildFileUrl(), escapeFilterValue()
│   ├── auth.ts                   # Server-side auth: requireAuth(), requireAdmin(), requireRole(), AuthError
│   ├── auth-context.tsx          # Client-side AuthProvider + useAuth() hook (React Context + cookie)
│   ├── constants.ts              # APP_URL, status enums, pagination limits, dashboard windows
│   ├── rate-limit.ts             # In-memory sliding-window token bucket (checkRateLimit, rateLimitResponse)
│   ├── dates.ts                  # Date formatting utilities
│   ├── csv-export.ts             # CSV generation for registrations
│   ├── ticketStatus.ts           # Ticket status label/color/icon mapping
│   ├── qr-utils.ts               # QR code generation helpers
│   ├── chair-scope.ts            # Chair society scoping (getChairSocietyIds, scope*Filter, require*Scope)
│   ├── admin-middleware.ts       # authenticateAdmin, buildChairFilter, getChairScopeFilters
│   ├── api-error.ts              # handleError() — distinguishes ClientResponseError vs generic; logError()
│   ├── logger.ts                 # Structured error logging
│   └── safe-get.ts               # Untyped getField()/getExpand() over PB records (O4: stringly-typed)
Business logic lives in PocketBase hooks (`pb_hooks/registrations.pb.js`,
`pb_hooks/webhook.pb.js`, `pb_hooks/events.pb.js`, `pb_hooks/coupons.pb.js`).
The TanStack server functions authenticate and scope requests, then write with
the user's own client; the hooks enforce capacity, deadline, registration-open,
form validation, ticket ID generation, payment confirmation, coupon consumption,
counter forgery prevention, and maintain `registeredCount`/`checkedInCount`
atomically at the DB layer.
There is no runtime admin/superuser token — the hooks run inside PB with
direct DB access. Duplicate registration prevention is a partial unique index
(`idx_registrations_user_event WHERE registrationStatus != "cancelled"`)
applied via `scripts/migrate-indexes.ts`. Apply it with `bun run migrate:indexes`.

Browser → Caddy (HTTPS/LB) → TanStack Start (SSR + server functions) → PocketBase REST API
                                                        │
                                                  Server functions (createServerFn)
                                                        │
                                                  PocketBase (direct fetch with PB token)
```

- **Admin API routes** authenticate via `createPB(cookie)` + `requireAuth()` and
  write with the user's own client. No elevated token is used at runtime;
  PB hooks enforce the privileged invariants at the DB layer.
- **Chair scoping**: chairs can only CRUD events/registrations for their own
  societies. Centralized in `lib/chair-scope.ts` (`getChairSocietyIds`,
  `chairFilterFromSocietyIds`, `scope*Filter`, `requireEventScope`,
  `requireRegistrationScope`); `lib/admin-middleware.ts` (`authenticateAdmin`,
  `buildChairFilter`, `getChairScopeFilters`) builds request filters on top of it.
- **Public SSR pages** (top-level routes) fetch PB data directly via `fetch()` with no auth
  (unauthenticated reads).
- **Payment webhook**: runs as a PB custom route (`/api/webhooks/payment-confirm`
  in `pb_hooks/webhook.pb.js`), NOT a TanStack route — the payment gateway calls
  PocketBase directly. Verifies `PAYMENT_WEBHOOK_SECRET` (timing-safe), looks up
  by `ticketId`, confirms atomically; the registrations hook mints `ticketId`
  and bumps counters on pending → confirmed. Idempotent on `paymentStatus="paid"`.

### PocketBase collections

| Collection | Type | Key fields |
|-----------|------|-----------|
| `users` | Auth | Google OAuth, role (admin/chair/user) |
| `societies` | Base | name, slug, bio, logo, banner, chairs (relation→users), isHidden |
| `events` | Base | title, description, date, endDate, venue, price, status, society (relation), maxCapacity, registrationOpen, formTemplate, registeredCount, checkedInCount, isDeleted |
| `registrations` | Base | user (relation), event (relation), ticketId (unique), paymentStatus, registrationStatus, checkedIn, formResponses, amount |
| `execom` | Base | name, position, department, batch, section, sectionId, order, photo |

## Conventions

- **Imports**: Use `@/` path alias for all project source imports
  (e.g. `import { requireAuth } from '@/lib/auth'`).
- **Style**: Tailwind CSS v4 with CSS custom properties in `globals.css`. Class
  merging via `cn()` from `tailwind-merge` + `clsx`.
- **Components**: Prefer shadcn/ui primitives from `components/ui/` for buttons,
  dialogs, tables, forms, cards, badges, etc.
- **Forms**: `react-hook-form` with `zod` schema validation via
  `@hookform/resolvers`.
- **Business rules**: All registration/event business logic lives in
  `pb_hooks/` (PocketBase JS hooks). The TanStack routes authenticate and
  scope, then write with the user's own client; the hooks enforce invariants
  atomically at the DB layer. Duplicate registrations are prevented by a
  partial unique index on `(user, event) WHERE registrationStatus != "cancelled"`
  (see `scripts/migrate-indexes.ts`). Run `bun run migrate:indexes` after
  schema changes.
- **Server auth**: Use `requireAuth()` / `requireAdmin()` / `requireRole()` from
  `lib/auth.ts`. They refresh the PB auth store and return `{ user, pb }`.
- **No runtime elevated token**: There is no `createAdminPB()` / admin token
  at runtime. `POCKETBASE_SUPERUSER_TOKEN` is used ONLY by migration scripts.
- **Error handling in API routes**: Use a local `handleError()` helper that
  distinguishes `ClientResponseError` (PocketBase) vs generic errors; log via
  `logError()` from `lib/logger.ts`.
- **File naming**: kebab-case (`auth-context.tsx`, `csv-export.ts`).
- **Testing**: Vitest for unit tests (`tests/unit/`), Playwright for e2e
  (`tests/e2e/`). Vitest config has `@/` alias matching tsconfig.
- **Components**: Avoid `React.FC` — prefer regular function components. Both
  semicolon and no-semicolon styles coexist.
- **PR titles**: conventional commits (`feat:`, `fix:`, `chore:`, etc.),
  enforced by `.github/workflows/pr-lint.yml`. Scope is optional
  (`feat(auth):`, `fix(fifa):`). Merge commits ("Merge pull request #N") are
  exempt. The version workflow keys off merge commits, not titles.

## Versioning & CI/CD

- **Semver source of truth = `package.json` `version`** (the frontend reads it
  at build time via `src/components/TechnicalDetails.tsx`). Bumps are committed
  by `.github/workflows/bump-version.yml` as `github-actions[bot]`:
  - PR open/push (base `dev` or `main`) → `package.json` bumped to
    `<base>+build.<run>.pr<N>` on the PR branch, committed as
    `chore(version): …`, and `[v<version>]` appended to the PR title. Shows
    in preview/staging builds.
  - PR merged into `dev` → build metadata stripped, PATCH bumped, committed
    to `dev` as `chore(release): vX.Y.(Z+1) (patch bump, …)`, tagged
    `vX.Y.(Z+1)`.
  - PR merged into `main` → MINOR bumped (patch reset to 0), committed to
    `main`, tagged `vX.(Y+1).0`.
  - Direct push to `main`/`dev` (no PR) → same bump, committed + tagged on
    the pushed commit. PR merge commits are skipped here (the
    `pull_request closed` event handles them).
  - Idempotent: re-runs skip if the commit already carries a `vX.Y.Z` tag.
- **Bot commits don't loop**: commits made by the default `GITHUB_TOKEN` do
  not re-trigger workflows (GitHub anti-loop protection), so no PAT/secret
  is needed. If `dev`/`main` are branch-protected, allow `github-actions[bot]`
  to push to them (or exempt the `chore(release):`/`chore(version):` commits).
- **CI** (`.github/workflows/ci.yml`) on push to `main`/`dev` and all PRs:
  `bun install` → `bun run build` → `tsc --noEmit` → `bun run lint` →
  `bun run test` (vitest). Caches `node_modules` (keyed on `bun.lock`),
  `.tanstack/` and `tsconfig.tsbuildinfo` (keyed on SHA). Docker build job
  runs on PRs only.
- **CD** (`.github/workflows/cd.yml`) on push to `main`/`dev`: triggers the
  Dokploy webhook (prod for `main`, staging for `dev`).
- **PR lint** (`.github/workflows/pr-lint.yml`): enforces conventional-commit
  PR titles (`feat:`, `fix:`, `chore:`, …). Scope optional. Merge commits
  exempt. The version workflow appends `[v…]` to the title — the lint action
  treats the bracketed suffix as part of the subject and tolerates it.
- **No runtime elevated token in CI**: workflows use the default
  `GITHUB_TOKEN` with explicit least-privilege `permissions:` blocks.

## Notes

### Security model (load-bearing)

The PocketBase REST API is internet-reachable. Business logic runs in **PB hooks**
(`pb_hooks/`), which enforce invariants atomically at the DB layer with direct
access — no runtime admin/superuser token. Collection **API rules** remain the
guard on direct REST access and must be self-sufficient. Rules are codified in
`scripts/migrate-pb-rules.ts` (source of truth), applied with `bun run migrate:pb-rules`.
Current hardening:
- `users`: list/view = self + admin (H-1: chairs removed — they had unscoped
  org-wide user enumeration); create = `@request.context = "oauth2"` (OAuth
  sign-up only); update forbids self role-change (`@request.body.role:changed = false`);
  delete = superuser-only. Role changes go through the admin route in `api/admin/users.ts`.
- `registrations`: create pins `user` to the caller and forbids client-set
  `paymentStatus="paid"`/`checkedIn=true` (backstop createRule). The
  `onRecordCreateRequest` hook enforces ALL business rules (status, open,
  deadline, form, capacity) before commit; `onRecordAfterCreateSuccess`
  sets `paymentStatus`/`registrationStatus`/`ticketId`/`amount`/`discountAmount`
  and runs post-commit overflow self-heal for TOCTOU safety.
- `events`: chair create scoped to owned society; public list/view excludes
  `isDeleted`. updateRule forbids chair writes to `registeredCount`,
  `checkedInCount`, `isDeleted`. `onRecordUpdateRequest` hook in
  `pb_hooks/events.pb.js` rejects non-admin counter/deletion writes
  (defense-in-depth). `societies`: chairs can't rewrite the `chairs` relation.
- `coupons`: listRule/viewRule scoped to admin/chair-of-event (was public).
  Coupon validation runs via PB internal route (`/api/coupons/validate` in
  `pb_hooks/coupons.pb.js`), gated by `INTERNAL_API_SECRET` with timing-safe
  comparison. Returns correct `discountAmount` (not `discountPercent`).
- `execom`: email/phone fields dropped; directory is name/position/photo only.
- H-2: the `onRecordUpdateRequest` hook in `registrations.pb.js` throws if a
  chair changes `paymentStatus` or `amount` (admin-only).
- Rate limiting: in-memory sliding-window limiter (`lib/rate-limit.ts`) on
  registration (10/60s), coupon (30/60s), check-in (60/60s), auth (10/60s).
- CSP: enforced by both Caddy (edge) and `server-entry.mjs` (origin).
- Webhook: requires `amount` on success; only `paid` triggers idempotency
  (failed payments remain re-confirmable).

### Deferred security decisions (require ops/product input — not yet done)

- **Superuser token lifetime (H2)**: `POCKETBASE_SUPERUSER_TOKEN` is now used
  ONLY by migration scripts (not runtime). It bypasses every rule; any leak =
  full control of schema/settings. Still worth rotating to a short-lived/
  rotatable token, but the runtime attack surface is gone (no admin token in
  the app process).
- **Coupons modeled twice (O2)**: a dedicated `coupons` collection AND a
  `coupons` JSON field on `events`. Validation/consumption uses the collection;
  the event JSON is editable by chairs and bypasses the collection's admin-only
  create rule. Pick one canonical store (product decision).
- **`safe-get.ts` stringly-typing (O4)**: `getField(obj,'key',fallback)` is used
  in 20+ files and defeats the PB SDK generics. A typed record layer would remove
  it, but that's broad zero-behavior churn — deferred to avoid regression risk.

### Resolved security items (fixed)

- **Rate limiting (H1)**: in-memory sliding-window limiter on registration,
  coupon, check-in, auth endpoints. PB built-in rate limits remain disabled.
- **Execom PII (M4)**: email/phone fields dropped from schema + all routes.
- **Coupon enumeration**: listRule scoped to admin/chair-of-event; validation
  via PB internal route with INTERNAL_API_SECRET gating.
- **Registration bypass**: createRule added; onRecordCreateRequest enforces all
  business rules (status, open, deadline, form, capacity).
- **Chair counter forgery**: updateRule + events.pb.js hook both block writes
  to registeredCount, checkedInCount, isDeleted.
- **No CSP**: enforced by both Caddy and server-entry.mjs.
- **Webhook amount**: required on success; failed payments re-confirmable.

## FIFA WC Predict '26

A points-based match prediction game (fake points, no real money) for the
2026 FIFA World Cup, layered on top of the existing site. Free to enter,
college-email-only (Google OAuth internal-only), sponsor voucher prize via
weighted raffle. **Not a gambling product** — no payment integration, no
real currency anywhere.

### Routes

- **Public (no auth):** `/FIFA` (overview), `/FIFA/matches`,
  `/FIFA/matches/$id` (betting UI unlocks when logged in), `/FIFA/leaderboard`,
  `/FIFA/feed`.
- **Authenticated:** `/FIFA/dashboard` (balance, bets, transactions).
- **Admin (`role = 'admin'` only, NOT chair):** `/admin/FIFA/*` (matches,
  markets, settle, settings, raffle — admin pages TBD, API routes exist).

### PocketBase collections (all prefixed `fifa_`)

| Collection | Type | Key fields |
|-----------|------|-----------|
| `fifa_matches` | Base | team_home, team_away, stage, kickoff_at, betting_locks_at, status, result_*, settled |
| `fifa_bet_markets` | Base | match (rel), market_type, mode (pool/fixed), line, fixed_odds, options, is_open, void, pool_total, pool_by_option (hook-maintained) |
| `fifa_bets` | Base | user (rel), match (rel), market (rel), selection, stake, mode, odds_locked, status, payout |
| `fifa_transactions` | Base | user (rel), type, amount, balance_after, ref_bet (rel), note — ledger, hook-only writes |
| `fifa_settings` | Base | singleton — event_name, starting_balance, max_bet_percent, daily_topup_*, raffle_*, prize, registration_open |
| `fifa_raffle_draws` | Base | drawn_at, winner (rel), entries_snapshot (json), seed |
| `fifa_feed_events` | Base | type, user (rel), match (rel), message — public live feed |
| `users` (extended) | Auth | + display_name (unique), balance (hook-only) |

### Game logic — `pb_hooks/fifa.pb.js` (single file)

All balance-affecting logic runs server-side in PB hooks, mirroring the
`registrations.pb.js` pattern. The TanStack routes authenticate + scope,
then write with the user's own client; the hooks enforce invariants at the
DB layer.

- **Starting grant:** `onRecordAfterCreateSuccess` on `users` sets
  `balance = starting_balance`, writes a `starting_grant` transaction.
- **Settings singleton guard:** `onRecordCreateRequest` on `fifa_settings`
  rejects a second row.
- **Bet create:** `onRecordCreateRequest` on `fifa_bets` validates market
  open + before `betting_locks_at` + stake ≤ balance + stake ≤
  `max_bet_percent`%, snapshots `odds_locked`, pins `user` to caller.
  `onRecordAfterCreateSuccess` deducts balance, writes `bet_placed`
  transaction, recomputes market pool counters (self-healing), emits feed
  event. **TOCTOU self-heal:** re-reads balance post-commit; if negative
  from concurrent bets, voids + refunds (mirrors `registrations.pb.js:263`).
- **Settlement:** `routerAdd("POST","/api/fifa/settle")` admin-gated via
  `e.auth` role. Idempotent (skips settled bets, marks `match.settled=true`
  LAST). Per-market-type payout logic mirrors `src/lib/fifa-payout.ts`
  (unit-tested). Pool: `(stake/total_winning_stakes) × pool × (1−cut)`; no
  winners → void + refund all. Fixed: `stake × odds_locked`.
- **Daily top-up:** `cronAdd("fifa-daily-topup","0 9 * * *")` tops anyone
  under `daily_topup_threshold` to `daily_topup_target`, idempotent via
  today's `daily_topup` transaction check.
- **Raffle:** `routerAdd("POST","/api/fifa/raffle")` admin-gated. Builds
  ticket list from leaderboard: `max(1, base − decay×(rank−1))`. Weighted
  random pick. Stores `entries_snapshot` + `seed` + `winner` for
  transparency.
- **Leaderboard + feed:** `routerAdd("GET","/api/fifa/leaderboard")` and
  `/api/fifa/feed` — public custom routes using internal `$app` access
  (bypasses `users` listRule, same bypass as `coupons.pb.js`).

### Realtime (SSE)

Public collections (`fifa_feed_events`, `fifa_bet_markets`, `fifa_matches`)
subscribe via the same-origin `/pb` proxy. `POCKETBASE_URL` stays
server-side; Caddy rewrites `/pb/*` → `pb:8090` (`flush_interval -1` for
SSE), Vite dev proxy does the same. Client helper: `src/lib/pb-client.ts`,
hook: `src/hooks/use-pb-subscription.ts`. Authed data (dashboard, own bets)
is polled via React Query (HttpOnly cookie blocks authed SSE). Leaderboard
polled every 15s (custom route, not a collection — SSE can't fire).

### Security rules (`scripts/migrate-pb-rules.ts`)

- `users.updateRule` forbids `balance` changes (hook-only).
- `fifa_transactions` create/update/delete = `null` (hooks only).
- `fifa_bets` create pins `user = @request.auth.id`, forbids
  `status`/`payout`/`odds_locked` writes; update/delete = `null`.
- `fifa_bet_markets` admin-only writes (pool counters are hook-maintained).
- Public reads on matches/markets/settings/feed/raffle.

### Design context

`PRODUCT.md` (register, users, brand personality) and `DESIGN.md` (inherited
tokens, typography, components) at project root — written via the Impeccable
skill (`/impeccable init`). The FIFA game inherits the IEEE blue palette and
Anton/Inter typography from `globals.css`; it does not invent new tokens.

### Acceptable risks (small-event scale)

- **Concurrent-bet TOCTOU:** post-commit self-heal voids the loser. Fine for
  fake points at ~100 students.
- **Pool counter races:** recompute-from-live-bets (self-healing, not atomic
  increment). Same pattern as `registeredCount`.
- **Settlement is sequential saves, not one transaction:** idempotency makes
  a crash re-runnable.
