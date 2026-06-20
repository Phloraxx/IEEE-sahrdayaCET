# TanStack Start + PocketBase Direct Migration Plan

## Goal

Port the IEEE Sahrdaya platform from Next.js 16 to **TanStack Start (v1 RC, pinned)** while:
- Keeping **PocketBase 0.39.1** as the backend and auth source.
- **IMPERATIVE — zero UI changes**: every presentation component (`components/ui/*`, `components/events/*`, `components/admin/*`), Tailwind config, and visual behavior stays identical for both public and admin. The JSX, props, classes, and layout are frozen. Only data plumbing and routing change.
- Removing the Next.js BFF layer; the client/server talks directly to PB.

## Locked constraints

- **IMPERATIVE — identical UI** for public + admin. No visual diffs invited. Diffing is a CI failure.
- **Maximum SEO**: all public routes server-rendered with per-route meta, JSON-LD, canonical URLs, sitemap.
- **File-based routing**: TanStack Router file conventions.
- **No persistent dual stack**: Next.js is fully replaced at cutover. (Transitional parallel state during migration is allowed; see Stage 3.)
- **Two separable swaps, sequenced**: (1) authz model swap, then (2) framework swap. Never combined.
- **Decision gate after Stage 0**: if PB collection rules cannot express chair/admin scoping, the plan adapts with a thin server-side scoping fallback — we do not delete `chair-scope.ts` on faith.

## The core principle (read first)

Two independent changes are conflated in every naive migration plan:

1. **Authz model swap** — server-side superuser (`createAdminPB` + `chair-scope.ts`) → PB collection rules
2. **Framework swap** — Next.js → TanStack Start

Doing them together means debugging two unknowns at once, with expensive rollback. The correct order is **swap #1 first, on Next.js, in production — prove it — then swap #2**. The framework swap then becomes mechanical because the data layer is already clean.

---

## Stage 0 — PB rules spike (de-risking, throwaway branch)

**Stack**: Next.js (unchanged)
**Goal**: answer "can PB collection rules replace server-side scoping?" *before* committing to deletion. Cheap to throw away.

### Work

1. Write candidate collection rules:
   - `events` list/create: `@request.auth.role = "admin" || @collection.societies.chairs.id ?= @request.auth.id`
   - `events` update/delete: same, scoped to the record's society via relation
   - `registrations` list: `event.society` join → chair scoping
   - `societies`: chairs can CRUD only their linked societies
2. Create a test `chair` user linked to one society.
3. **Test matrix** (all must pass):
   - Chair lists own-society events → returns only theirs
   - Chair lists other-society events → 403 or empty
   - Admin sees all
   - Chair cannot move an event to another society (mass-assignment guard still holds)
   - Registration create still fires `registrations.pb.js` hooks (capacity, deadline, duplicate)
   - Counters still increment via `registrations_counters.pb.js`

### Decision gate

- **PASS** → proceed to Stage 1 (delete the server-side scoping code).
- **FAIL on some access path** → the plan adapts: keep a *thin* server-side scoping layer in the server function, and do NOT delete `chair-scope.ts` wholesale. Re-scope Stage 1 before continuing.

**Do not delete any code until this gate clears.** This is the single biggest risk in the whole migration.

---

## Stage 1 — Authz cleanup (on Next.js, still Next.js)

**Stack**: Next.js (unchanged framework)
**Goal**: simplify the data layer in place, now that PB rules are proven.

### Work

1. Delete `createAdminPB()` usage from every admin route. Each route uses a single client: `createPB(cookie)` (the user's own session), backed by the proven PB rules.
2. Delete `chair-scope.ts` (~5.2KB): `getChairScope`, `buildSocietyFilter`, `buildRegistrationsBySocietyFilter`, `assertChair*`.
3. Delete manual filter helpers that existed only to compensate for missing rules: `escapeFilterValue` (where replaced by relation filters), `buildSocietyFilter`, `isValidPocketBaseId` (defense-in-depth kept only where still interpolating IDs).
4. Collapse the dual-client pattern in `registration-service.ts` — one `pb` client, not `pb` + `adminPB`.
5. Replace `AuthContext` + `apiFetch` with TanStack Query (or SWR) for list caching + a `/auth/me` query.

### Verify

- Public SSR pages unchanged (they use `pbFetch`, not the admin path).
- Admin list/detail/create/edit flows pass existing E2E (`tests/e2e/api-smoke.spec.ts`).
- No visual diff — UI was never touched.

### Outcome

The codebase is ~60% simpler, authz lives in PB, and the framework is still Next.js. This is the real cleanup. It is independent of TanStack.

---

## Stage 2 — Document the framework-portable contract (on Next.js)

**Stack**: Next.js
**Goal**: isolate what *must* survive any framework, as an explicit contract.

### Genuine server-only surface (4 routes)

| Route | Why server-only |
|-------|-----------------|
| `/api/auth/init` | Builds Google OAuth URL, sets PKCE cookie |
| `/api/auth/callback/google` | Exchanges code, sets `pb_auth` httpOnly cookie |
| `/api/auth/logout` | Clears auth cookie |
| `/api/orders/webhook` | Payment gateway callback, signature verification |

### Edge cases (server functions, not full routes)

- `csv-export.ts` — streamed response; TanStack server function.
- `check-in/verify` — can move to a PB hook or a server function.

Everything else is CRUD over PB collections — now enforceable directly by rules, no BFF needed.

### Outcome

This contract is the fixed input to Stage 3. PB hooks (`registrations.pb.js`, `registrations_confirm.pb.js`, `registrations_counters.pb.js`, `events.pb.js`) are framework-agnostic and untouched throughout.

---

## Stage 3 — Framework swap (TanStack Start)

**Stack**: swaps to TanStack Start
**Goal**: mechanical port now that the data layer is clean.

### Work

#### 3.1 — Scaffold
1. New branch `feat/tanstack-pocketbase` off the Stage-1-clean HEAD.
2. Pin deps: `@tanstack/start`, `@tanstack/react-router`, `@tanstack/react-query`, `vinxi`. **Lock exact RC version**; do not upgrade mid-migration.
3. `app.config.ts` (replaces `next.config.mjs`), Tailwind v4 entry, `@/` alias via Vite.
4. Move `src/app/globals.css` → `app/styles.css`.
5. Smoke test: dev server serves a blank root route.

#### 3.2 — Port the four server-only routes (Stage 2 contract)
TanStack server routes (`api.*.ts`) replace Next.js route handlers. Behavior identical.

#### 3.3 — Port public pages (SSR + max SEO)
- `loader` (server function, unauthenticated PB reads) replaces `async Server Component` + `pbFetch`.
- Per-route `head`/meta replaces `generateMetadata`:
  - `layout.tsx` metadata (70+ lines: title template, OG, Twitter, robots, canonical)
  - JSON-LD Organization + WebSite schemas from `(main)/layout.tsx`
- **ISR loss — must address here**: Next.js `revalidate: 60` has no TanStack equivalent. Decide per route:
  - Edge cache (Cloudflare page rules / `Cache-Control: s-maxage=60, stale-while-revalidate`), OR
  - Accept full SSR on every request (measure TTFB; if Core Web Vitals regress, use caching).
- Fonts: `next/font/google` → `@fontsource/*` (Geist, Inter, Press_Start_2P, Caveat). Mind CLS.
- `sitemap.ts` → TanStack server route emitting XML.

Public route map → TanStack file names:
| Next.js | TanStack |
|--------|----------|
| `(main)/page.tsx` | `_public.index.tsx` |
| `(main)/events/page.tsx` | `_public.events.tsx` |
| `(main)/societies/page.tsx` | `_public.societies.tsx` |
| `(main)/full-execom/page.tsx` | `_public.full-execom.tsx` |
| `(main)/register/[eventId]/page.tsx` | `_public.register.$eventId.tsx` |
| `(main)/ticket/[ticketId]/page.tsx` | `_public.ticket.$ticketId.tsx` |

#### 3.4 — Port admin pages (UI frozen, data plumbing changes)
- **UI is identical** (imperative). Copy `components/admin/*` verbatim.
- **Data plumbing changes** (this is the honest part):
  - `apiFetch('GET /api/admin/events')` → `useQuery({ queryKey: ['admin','events'], queryFn: () => callServerFn(eventsList) })`
  - Server functions wrap `pb.collection('events').getList(...)` directly — authz already in PB rules from Stage 1.
  - RPC shape, not REST: admin components keep their JSX, swap their data hooks.
- `AdminGuard` reads session from TanStack Query auth state (replaces `AuthProvider`).
- Admin route map → TanStack file names (one-to-one, nested under `admin.tsx` layout):
  - `admin.events.tsx`, `admin.events.new.tsx`, `admin.events.$id.tsx`, `admin.events.$id.edit.tsx`
  - `admin.societies.*`, `admin.registrations.*`, `admin.users.*`, `admin.payments.tsx`
  - `admin.execom.tsx`, `admin.execom.new.tsx`, `admin.execom.$id.edit.tsx`
  - `admin.check-in.tsx`

### UI preservation proof (imperative)

- Component source diff between `src/components/**` and `app/components/**` MUST be limited to import-path alias changes (`@/` → `#/`), nothing else.
- Visual regression baseline: Playwright screenshots on Next.js (pre-migration) vs TanStack (post). **Pixel-diff threshold: zero for layout, zero for critical components.**

### Verify

- All existing E2E (`tests/e2e/*`) passes on TanStack.
- Playwright visual snapshot diff = clean.

---

## Stage 4 — Cutover and verify

1. Delete `src/app/`, `src/lib/` wrappers, `next.config.mjs`, Next.js deps.
2. Point docker-compose at the new build output (`vinxi build`).
3. Full E2E pass: `api-smoke`, `register-flow`, `edge-cases`, `smoke`.
4. PB hooks regression check — should be a no-op (untouched), but verify counters/tickets still fire.
5. SEO audit: per-route meta, JSON-LD validator, sitemap reachable, canonical tags.
6. Update `AGENTS.md`, `.env.example`, docs.

---

## Risk register

| Risk | Mitigation | Stage |
|------|------------|-------|
| PB rules can't express chair scoping | Stage 0 decision gate; fall back to thin server-side scoping, don't delete `chair-scope.ts` wholesale | 0 |
| `revalidate` ISR lost → TTFB regression | Edge cache or `s-maxage=60, stale-while-revalidate`; measure Core Web Vitals before/after | 3.3 |
| Fonts CLS regression | `@fontsource` with `font-display: swap`; screenshot diff pre/post | 3.3 |
| TanStack Start v1 RC API drift | Pin exact RC version; no upgrades mid-migration | 3.1 |
| Audit gap: server functions RPC ≠ REST | Accept that admin data hooks change even when JSX is frozen; cover with E2E | 3.4 |
| Real-time subscriptions | Re-implement via PB `subscribe()` if any UI depends on live updates (audit first) | 3 |
| Dual-stack drift during Stage 3 | Transitional parallel allowed, hard cutover at Stage 4; single source of truth is the E2E suite | 3→4 |

---

## Decisions log

| Question | Decision |
|----------|----------|
| SSR vs CSR for public pages | SSR for max SEO; ISR replaced by edge cache or SWR headers |
| Routing style | File-based (TanStack Router conventions) |
| Persistent dual stack | No — transitional during Stage 3, hard cutover Stage 4 |
| Authz vs framework swap order | Authz first (Stage 1), framework second (Stage 3) |
| Tests | Keep Playwright + Vitest; add visual snapshot diff for UI-preservation proof |
| UI changes | NONE. Imperative. Identical JSX, props, classes, layout. Diff = failure. |

## Stage 3 — BLOCKED (2026-06-20)

Stage 3 scaffold attempted and **blocked** by TanStack Start RC dependency drift:

1. `@tanstack/react-start@1.120.20` (latest) has no `./plugin/vite` export that the
   official docs assume. The plugin moved to `@tanstack/react-start-plugin`, whose
   API renames between patch lines (`createTanStackStartPlugin` in 1.120.x vs
   `tanstackStart` in 1.131.x).
2. The server runtime (`@tanstack/start-server-core`) references the virtual import
   `#tanstack-router-entry`, which the plugin is supposed to inject. On the 1.120.x
   line the resolver never fires → HTTP 500 on every SSR request.
3. The official workaround is Nitro. Latest Nitro (3.x) requires Vite 7/8, conflicting
   with the Vite 6 that TanStack 1.120 pins. The compatible Nitro (2.2.28) is
   **deprecated** and fails its native build on Windows (`deasync`/`spawn EINVAL`).

This is the exact RC API-drift risk flagged in the risk register. It is not a code
problem that can be edited past — it's a broken dependency-compatibility matrix in
this environment.

### What's done and safe
- ✅ Stage 0 PASS (PB rules proven, test chair confirmed scoping).
- ✅ Stage 1 DONE (commit `ab3c285`): `createAdminPB` + `chair-scope.ts` removed
  from 20 admin routes, `-256 net lines`, typecheck clean. This is the real
  de-engineering win and is independent of the framework.

### Recommended next step
Reattempt Stage 3 only after one of:
- TanStack Start ships a **stable 1.0** with a consistent plugin + virtual-module
  contract, OR
- The Nitro/Vite version matrix resolves (Nitro 3 supports Vite 6, or TanStack
  supports Vite 7/8), OR
- A hosted adapter (Cloudflare/Netlify Vite plugin) is used to bypass Nitro entirely.

Until then, the Next.js app + Stage 1 cleanup is the production deliverable.
