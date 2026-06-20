# TanStack Start Migration Checklist

## Locked decisions
- SSR for public pages; max SEO (meta + JSON-LD + canonical + sitemap).
- File-based routing (TanStack Router conventions).
- No persistent dual stack — transitional during Stage 3, hard cutover Stage 4.
- **IMPERATIVE: identical UI** for public + admin. No visual diffs. Diff = failure.
- Authz swap before framework swap.

---

## Stage 0 — PB rules spike (de-risking, throwaway branch)
- [ ] Create throwaway branch off `feat/payload-migration`
- [ ] Write candidate collection rules: `events`, `registrations`, `societies`
  - list/create: `@request.auth.role = "admin" || @collection.societies.chairs.id ?= @request.auth.id`
  - update/delete: scoped to record's society
- [ ] Create test `chair` user linked to one society
- [ ] Test: chair lists own-society events → only theirs
- [ ] Test: chair lists other-society events → 403 or empty
- [ ] Test: admin sees all
- [ ] Test: chair cannot mass-assign event to another society
- [ ] Test: registration create fires `registrations.pb.js` hooks
- [ ] Test: counters still increment via `registrations_counters.pb.js`
- [ ] **DECISION GATE**: PASS → proceed to Stage 1; FAIL → keep thin server-side scoping, re-scope Stage 1

## Stage 1 — Authz cleanup (on Next.js)
- [ ] Delete `createAdminPB()` from every admin route → single `createPB(cookie)` client
- [ ] Delete `chair-scope.ts` (if gate passed)
- [ ] Delete manual filter helpers (`buildSocietyFilter`, `buildRegistrationsBySocietyFilter`)
- [ ] Collapse dual-client in `registration-service.ts` (one `pb` client)
- [ ] Replace `AuthContext` + `apiFetch` with TanStack Query + `/auth/me` query
- [ ] Verify public SSR pages unchanged
- [ ] Verify admin E2E (`tests/e2e/api-smoke.spec.ts`) passes
- [ ] Verify: no visual diff (UI untouched)

## Stage 2 — Document framework-portable contract (on Next.js)
- [ ] Catalog genuine server-only routes: `auth/init`, `auth/callback`, `auth/logout`, `orders/webhook`
- [ ] Catalog edge cases: `csv-export` (server fn), `check-in/verify` (PB hook or server fn)
- [ ] Confirm PB hooks untouched: `registrations.pb.js`, `registrations_confirm.pb.js`, `registrations_counters.pb.js`, `events.pb.js`

## Stage 3 — Framework swap (TanStack Start)
### 3.1 Scaffold
- [ ] Branch `feat/tanstack-pocketbase` off Stage-1-clean HEAD
- [ ] Pin exact RC versions: `@tanstack/start`, `@tanstack/react-router`, `@tanstack/react-query`, `vinxi`
- [ ] `app.config.ts` replaces `next.config.mjs`
- [ ] Tailwind v4 entry; `@/` alias via Vite
- [ ] Move `src/app/globals.css` → `app/styles.css`
- [ ] Smoke test: dev server serves blank root route

### 3.2 Port server-only routes (Stage 2 contract)
- [ ] `api.auth.init.ts` — OAuth URL + PKCE cookie
- [ ] `api.auth.callback.google.ts` — code exchange, set `pb_auth` cookie
- [ ] `api.auth.logout.ts` — clear auth cookie
- [ ] `api.orders.webhook.ts` — payment callback + signature verify

### 3.3 Port public pages (SSR + max SEO)
- [ ] `_public.index.tsx` (home) + meta
- [ ] `_public.events.tsx` + meta
- [ ] `_public.societies.tsx` + meta
- [ ] `_public.full-execom.tsx` + meta
- [ ] `_public.register.$eventId.tsx` + meta
- [ ] `_public.ticket.$ticketId.tsx` + meta
- [ ] Root `head`/meta replaces `layout.tsx` metadata (title template, OG, Twitter, robots, canonical)
- [ ] JSON-LD Organization + WebSite schemas ported
- [ ] **ISR replacement decided**: edge cache OR `s-maxage=60, stale-while-revalidate`
- [ ] Fonts: `next/font` → `@fontsource` (Geist, Inter, Press_Start_2P, Caveat)
- [ ] Sitemap: `sitemap.ts` → TanStack server route (XML)

### 3.4 Port admin pages (UI frozen)
- [ ] **UI frozen**: copy `components/admin/*` verbatim
- [ ] `admin.tsx` layout (AdminSidebar, Topbar, Guard, PageTransition, KeyboardShortcuts)
- [ ] `admin.index.tsx` (dashboard overview)
- [ ] `admin.events.*` (list/new/detail/edit)
- [ ] `admin.societies.*`
- [ ] `admin.registrations.*`
- [ ] `admin.users.*`
- [ ] `admin.payments.tsx`
- [ ] `admin.execom.*`
- [ ] `admin.check-in.tsx`
- [ ] Swap data hooks: `apiFetch` → `useQuery` around server functions (RPC)
- [ ] `AdminGuard` reads session from TanStack Query auth state
- [ ] CSV export as server function
- [ ] Check-in verify: PB hook or server function

## Stage 4 — Cutover and verify
- [ ] Delete `src/app/`, `src/lib/` wrappers, `next.config.mjs`, Next.js deps
- [ ] Point docker-compose at `vinxi build` output
- [ ] E2E: `api-smoke`, `register-flow`, `edge-cases`, `smoke` pass
- [ ] PB hooks regression check (counters/tickets still fire)
- [ ] SEO audit: per-route meta, JSON-LD, sitemap, canonical
- [ ] **Visual regression**: Playwright screenshots pre (Next.js) vs post (TanStack) — zero diff
- [ ] Update `AGENTS.md`, `.env.example`, docs

## UI preservation contract (imperative)
- [ ] Component source diff `src/components/**` vs `app/components/**` = import paths only
- [ ] Playwright visual baseline captured on Next.js pre-migration
- [ ] Playwright visual snapshot diff = clean post-migration
- [ ] Pixel-diff threshold: zero for layout, zero for critical components
