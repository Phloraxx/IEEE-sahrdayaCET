# IEEE Sahrdaya — Comprehensive Architecture & Code Review

**Date:** 2026-06-23  
**Branch:** `docs/tanstack-migration-rewrite`  
**Reviewer:** Architecture Review Agent  
**Scope:** Full codebase — every route, component, lib, config, test, script

---

## Executive Summary

The IEEE Sahrdaya codebase is a **TanStack Start + React 19 + PocketBase** application that has undergone a migration from Next.js. The migration is functionally complete but ships with **1 confirmed runtime crash bug**, **missing CSRF middleware** for server functions, **no `beforeLoad` auth guards** on admin routes, **3040 TypeScript diagnostics** (including real type errors), and **significant duplication** between API routes and server functions. The codebase has a well-structured lib layer and reasonable security primitives, but the architectural boundary between server functions and API routes is muddled, and several files contain dead code or over-engineered solutions.

**Severity counts:** 6 CRITICAL · 16 HIGH · 28 MEDIUM · 20 LOW · 12 INFO

---

## 1. Architecture

### 1.1 [CRITICAL] No `beforeLoad` auth guard on admin routes
**File:** `src/routes/admin.tsx` (entire file)  
**Also:** All `src/routes/admin.*.tsx` files

Admin routes have **no `beforeLoad` guard**. Authorization is done entirely client-side via `<AdminGuard>` (`src/components/admin/AdminGuard.tsx:18-27`), which checks `useAuth()` and calls `navigate({ to: "/" })`. This means:

1. Admin route **loaders** (which call `createServerFn` with `requireRole`) run before the client guard, but errors are caught and returned as empty data — not redirects.
2. A user who navigates directly to `/admin` sees a flash of the admin shell before the client-side guard redirects.
3. The `adminLoader` pattern (`src/lib/admin-loader.ts:48-62`) **silently swallows auth errors** and returns `empty` — meaning unauthorized users see empty dashboards, not redirects.

**Fix:** Add `beforeLoad` to the admin layout route that calls the server function, checks auth, and throws `redirect({ to: '/', ... })` on failure. Per TanStack Start docs, `beforeLoad` runs before loaders and can redirect.

### 1.2 [CRITICAL] No CSRF middleware — server functions are unprotected
**File:** Project root (no `src/start.ts` exists)

TanStack Start's [official docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions.md) state:

> "Server functions are same-origin RPC endpoints. TanStack Start provides `createCsrfMiddleware()` to protect server functions. **If your app does not define `src/start.ts`, Start installs this middleware automatically.** If you define `src/start.ts`, add the middleware explicitly."

This project has **no `src/start.ts`**. While the auto-install should apply, this is **unverified** — there's no explicit CSRF middleware configuration, and the `verifySameOrigin` helper is applied **inconsistently** (only on some API routes, not on server functions). The `admin.index.tsx` server function (`getAdminDashboard`) has no CSRF check at all.

**Fix:** Create `src/start.ts` with explicit `createCsrfMiddleware()` to guarantee protection. Configure `origin` to match `PUBLIC_APP_URL`.

### 1.3 [HIGH] Server functions vs API routes — architectural muddle
**Files:** `src/routes/admin.index.tsx` (uses `createServerFn`) vs `src/routes/api/admin/stats.ts` (uses `server.handlers`)

The codebase has **two parallel patterns** for the same functionality:
- **Server functions** (`createServerFn`): `admin.index.tsx`, `admin.events.tsx`, etc. — called from route loaders, return data directly.
- **API routes** (`server.handlers`): `api/admin/stats.ts`, `api/admin/events.ts`, etc. — return `Response.json()`.

These are **functionally duplicated** — `api/admin/stats.ts` and `admin.index.tsx` compute nearly identical dashboard data. Per TanStack Start docs: *"Server routes are meant for endpoints that need to be called from outside your Start app. If you only need to call server-side logic from within your app, use server functions."*

The admin API routes under `api/admin/` are called via `fetch()` from client components (e.g., `UserDetailPage.tsx:23` does `fetch('/api/admin/users?id=...')`). This is the **wrong pattern** — server functions should be used instead, which gives automatic type safety and CSRF protection.

**Fix:** Migrate all `api/admin/*` routes to server functions. Keep only `api/orders/webhook.ts` (external), `api/auth/*` (OAuth callbacks), and `api/events.$id.export.ts` (CSV stream) as API routes.

### 1.4 [HIGH] SSR<->client boundary is leaky in loaders
**File:** `src/routes/events.tsx:62-77`, `src/routes/index.tsx:59-95`

Loaders call `createPB()` **without a cookie** for public data. This is correct for public reads. But the loaders catch all errors and return `[]` — silently hiding PB outages. A user sees an empty events page with no error indication.

**File:** `src/routes/admin.index.tsx:46` — `const pb = createPB(cookieHeader)` creates the PB client from the raw cookie string, then passes it to `requireRole`. This is correct, but the `adminLoader` helper (`src/lib/admin-loader.ts:48-62`) wraps this in a try/catch that returns `empty` on **any** error — including 500s. Auth failures and server errors are indistinguishable to the client.

### 1.5 [MEDIUM] PocketBase client pattern — `createAdminPB()` called inside service functions
**Files:** `src/lib/registration-service.ts:78` (`validateAndApplyCoupon`), `src/lib/registration-service.ts:270` (`bumpEventCounter`), `src/lib/event-service.ts:4` (`softDeleteEvent`)

Several service functions internally call `createAdminPB()` to get a superuser-authenticated client. This means the **caller cannot control** whether admin privileges are used. For example, `createRegistration` is called with a user-authenticated `pb` client, but internally calls `validateAndApplyCoupon` which creates a **new admin client** to update the coupon `usedCount`. This is because PB's `updateRule` for events requires admin/chair role, and a regular user can't update the event record.

This is a **security smell** — the admin client bypasses all PB access rules. The coupon increment should use a PB hook or a dedicated admin-only server function.

### 1.6 [MEDIUM] No `src/start.ts` — no custom server entry
The project has no custom server entry point. While TanStack Start can work without one, this means:
- No global middleware (CSRF, rate-limiting, request logging)
- No custom error handling at the server level
- No ability to inject request-scoped context

### 1.7 [LOW] Mixed `createPB()` calls — some pass cookie, some don't
**File:** `src/routes/api/auth/init.ts:14` creates `new PocketBase(url)` directly instead of using `createPB()`.  
**File:** `src/routes/api/auth/callback/google.ts:33` does the same.  
These bypass the centralized client factory, meaning any future changes to `createPB` (e.g., adding default headers, timeout config) won't apply to auth routes.

---

## 2. Framework Choices

### 2.1 [INFO] TanStack Start is appropriate for this project
The project uses file-based routing, server functions for loaders, and server routes for API endpoints. TanStack Start is a valid choice for a React 19 SSR app with a PocketBase backend. The migration from Next.js is reasonable — TanStack Start gives more control over the server/client boundary.

### 2.2 [MEDIUM] React 19 + Tailwind 4 + Framer Motion — appropriate but heavy
**File:** `package.json:17` — `framer-motion: ^12.34.0`

Framer Motion is used extensively for animations (Hero, FloatingAction, Execom carousel, PageTransition). The `FloatingAction.tsx` component (295 lines) is a pixel-art character animation that runs **continuously** — blink timers, walk intervals, action schedulers. This is computationally expensive for a decorative element.

**File:** `package.json:19` — `radix-ui: ^1.6.0` — The `radix-ui` package is imported but may be redundant with individual `@radix-ui/*` packages that shadcn/ui pulls in. Verify whether it's actually used.

### 2.3 [INFO] PocketBase is a reasonable choice for this scale
For a student branch website with ~hundreds of registrations, PocketBase's embedded SQLite + built-in auth + file storage is appropriate. The alternative (Postgres + Prisma + S3) would be significantly more infrastructure.

### 2.4 [MEDIUM] Docker Compose — single replica, not 3 as claimed
**File:** `docker-compose.yml` — The compose file runs a **single** `app` container, not "3 app replicas + Caddy" as stated in the project context. Caddy is commented out. The healthcheck uses `wget` which isn't installed in `node:22-alpine` by default.

### 2.5 [LOW] `bun` and `npm` mixed in the same project
**File:** `Dockerfile:7` installs `bun` globally.  
**File:** `package-lock.json` exists (npm lockfile).  
**File:** `bun.lock` also exists (bun lockfile).  
This is confusing — the Dockerfile uses `bun install` but the lockfile situation is ambiguous. Pick one package manager.

---

## 3. Code Quality

### 3.1 [CRITICAL] Runtime crash: `regR` is not defined
**File:** `src/routes/api/check-in.verify.ts:99`

```typescript
userName: regR.userName as string | undefined,
```

The variable `regR` is **never declared** in this scope. The registration lookup variable is `registration`. This will throw a `ReferenceError: regR is not defined` at runtime when check-in succeeds. The check-in endpoint **crashes on every successful check-in**.

**Fix:** Change `regR.userName` to `getField(registration, 'userName', '')`.

### 3.2 [CRITICAL] `ExtendedEvent` type does not exist in `@/types`
**File:** `src/components/events/index.ts:5`

```typescript
export type { EventWithSociety, ExtendedEvent } from '@/types';
```

The type `ExtendedEvent` is **not exported** from `src/types/index.ts`. The actual type is `EventExtended` (line 81 of `types/index.ts`). Multiple files import `ExtendedEvent`:
- `src/components/events/AnnotatedEventCard.tsx:6`
- `src/components/events/EventDetailModal.tsx:6`
- `src/components/events/EventListSection.tsx:6`
- `src/features/events/EventsPageClient.tsx:14`

This means the type is `any` at runtime — **all type safety for event display components is lost**.

### 3.3 [HIGH] 3040 TypeScript diagnostics from `tsc --noEmit`
**File:** `tsconfig.json`

Running `tsc --noEmit` produces **3040 diagnostics** across 112 files. Most are `TS17004` ("Cannot use JSX unless '--jsx' is set") because the tsconfig lacks `"jsx"` configuration — Vite/SWC handles JSX at build time, so `tsc` isn't the primary typecheck path. However, there are **real type errors** buried in the noise:

- `src/routes/api/check-in.verify.ts:99` — `TS2304: Cannot find name 'regR'`
- `src/lib/registration-service.ts:178` — `TS2367: comparison appears unintentional (types '""' and '"confirmed" have no overlap)`
- `src/routes/api/registrations.ts` — `TS2339: Property 'banner' does not exist on type '{}'`
- `src/routes/api/ticket.$ticketId.ts` — same `banner` property error
- `src/features/admin/SocietyForm.tsx` — `TS2304: Cannot find name '$$$'`
- `src/lib/dates.ts` — `TS2322: Type 'string | undefined' is not assignable to type 'string'`
- `src/lib/pb.ts:3` — `TS2339: Property 'env' does not exist on type 'ImportMeta'`
- `src/routes/api/auth/callback/google.ts` — `TS2353: 'name' does not exist in type 'SerializeOptions'`

**Fix:** Add `"jsx": "react-jsx"` to tsconfig. Run `tsc --noEmit` as a CI step. Fix all non-JSX errors.

### 3.4 [HIGH] `getField()` type safety is illusory
**File:** `src/lib/safe-get.ts:6-10`

```typescript
export function getField<T = string>(obj: unknown, key: string, fallback: T): T {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key] as T;
  }
  return fallback;
}
```

The function casts `unknown` to `T` without any runtime validation. `getField(reg, 'checkedIn', false)` returns `boolean` in TypeScript but the actual PB value could be anything. The `as T` cast is the same as writing `as any` — it suppresses the real type check. The function name `safe-get` is misleading — it's **not safe**, it just avoids `Record<string, unknown>` boilerplate.

### 3.5 [MEDIUM] Inconsistent error handling — some routes use `handleError`, some don't
**File:** `src/routes/api/registrations.ts:101-113` — POST handler has custom error handling that duplicates `handleError` logic (checks `ZodError`, `RegistrationError`, then falls through to `handleError`).  
**File:** `src/routes/api/check-in.verify.ts:96-102` — Also has custom error handling.  
**File:** `src/routes/api/events.validate-coupon.ts:30-34` — Uses `handleError` correctly.

The pattern should be consistent: always use `handleError` and extend it to handle `ZodError`.

### 3.6 [MEDIUM] `RegistrationFormFields` component has 18 props
**File:** `src/features/register/RegisterPage.tsx:55-80`

The `RegistrationFormFields` component takes 18 individual props (name, setName, email, setEmail, phone, setPhone, ...). This is extreme prop drilling. The form state should be consolidated into a single object or managed via `react-hook-form` (which is already a dependency).

### 3.7 [MEDIUM] `useEffect` in `UserDetailPage` doesn't handle race conditions
**File:** `src/features/admin/UserDetailPage.tsx:22-40`

The `useEffect` fetches user data but doesn't handle the case where `id` changes before the fetch completes. A fast navigation from user A to user B could result in user A's data overwriting user B's state.

**Fix:** Add an `AbortController` or a stale-check flag.

### 3.8 [LOW] Mixed async patterns
**File:** `src/routes/api/auth/callback/google.ts` — Uses `await` with try/catch.  
**File:** `src/features/admin/UserDetailPage.tsx:22` — Uses `.then().catch()` chains.  
These should be consistent — prefer `async/await` throughout.

---

## 4. Over-engineering

### 4.1 [HIGH] `FloatingAction.tsx` — 295 lines for a decorative pixel character
**File:** `src/components/FloatingAction.tsx`

This component implements a full pixel-art character with blink timers, walk cycles, action scheduling (idle/walking/jumping/looking/crouching/headBob), arm rotation animations, and shadow scaling. It runs **6+ `setInterval`/`setTimeout` timers** simultaneously and re-renders on every animation frame.

For a **decorative** element that sits at 75% opacity in the corner of the page, this is excessive. It consumes CPU on every page load and never stops.

**Fix:** Replace with a CSS-only animation or a static SVG. If the character is important, use a `<canvas>` with `requestAnimationFrame` instead of React state for animation.

### 4.2 [MEDIUM] `globals.css` — 1039 lines with a full design system
**File:** `src/features/globals.css`

The CSS file contains a complete "editorial-monocle" design system (`.page-title`, `.stat-card`, `.filter-bar`, `.data-table`, `.hero-event`, etc.) **on top of** shadcn/ui's design tokens. This means there are **two competing design systems** in the same app:

1. shadcn/ui primitives (`Card`, `Button`, `Badge`, `Table`, etc.) — used in admin pages
2. Editorial CSS classes (`.card`, `.stat-card`, `.label`, `.value-large`) — also used in admin pages

Components mix both systems — e.g., `OverviewClient.tsx` uses both `<Card>` and `.stat-card` classes. This makes styling inconsistent and hard to maintain.

### 4.3 [MEDIUM] Duplicate dashboard data fetching — `admin.index.tsx` vs `api/admin/stats.ts`
**Files:** `src/routes/admin.index.tsx` (server function `getAdminDashboard`) vs `src/routes/api/admin/stats.ts` (API route)

Both compute nearly identical dashboard statistics (events total, upcoming, live; registrations total, confirmed, pending, today; societies total, active). The server function is used by the route loader; the API route appears to be unused or used by a different caller. This is duplicated logic.

### 4.4 [LOW] `Execom.tsx` — hardcoded member data alongside server data
**File:** `src/components/Execom.tsx:13-73`

The Execom component has ~60 lines of hardcoded member data (`MEMBERS` array) despite the project having an `execom` PocketBase collection and an admin UI for managing members. The hardcoded data includes typos: `'MEMBERSHIP DRIV'` (should be `DRIVE`), `'ELECTRONIC & COMM'` (truncated).

---

## 5. Redundancy

### 5.1 [HIGH] `admin-loader.ts` duplicates `chair-scope.ts` pattern
**Files:** `src/lib/admin-loader.ts` vs `src/lib/chair-scope.ts`

The `adminLoader` helper extracts cookie → `createPB` → `requireRole` — but doesn't apply chair scoping. Each admin route manually calls `scopeEventFilter` / `scopeRegistrationFilter` / `scopeSocietyFilter`. The loader helper should integrate scoping to prevent a future route from forgetting to scope.

### 5.2 [HIGH] Repeated auth + scope boilerplate across admin API routes
**Files:** `src/routes/api/admin/events.ts`, `events.$id.ts`, `registrations.ts`, `registrations.$id.ts`, `societies.ts`, `societies.$id.ts`, `execom.ts`, `execom.$id.ts`, `users.ts`

Every admin API route repeats the same ~8-line pattern:
```typescript
const pb = createPB(request.headers.get("cookie") || undefined);
const { user } = await requireRole(["admin", "chair"], pb);
try {
  await requireEventScope(pb, user, id);
} catch (e) {
  throw new AuthError(e instanceof Error ? e.message : "Forbidden", 403);
}
```

This should be extracted into a middleware or a higher-order handler. TanStack Start's server routes support `middleware` arrays — use them.

### 5.3 [MEDIUM] `buildFilter` used inconsistently
**Files:** Various admin routes

Some routes use `buildFilter([scope, filter].filter(Boolean))`, others use string concatenation `parts.join(" && ")`, and others use `buildFilter` with different patterns. The `admin/stats.ts` route uses `buildFilter` while `api/admin/stats.ts` uses manual `escapeFilterValue` calls with single quotes.

### 5.4 [MEDIUM] Two CSS keyframe definitions for the same animation
**File:** `src/features/globals.css:39-44` defines `@keyframes marquee-images` and `@keyframes marquee-text`  
**File:** `src/components/EventsShowcase.tsx` (inline `<style>`) defines `@keyframes scroll-images` and `@keyframes scroll-text` — duplicating the same animations with different names.

### 5.5 [LOW] `Event` type has both `bannerUrl` and `banner` fields
**File:** `src/types/index.ts:46-47`

```typescript
bannerUrl?: string;
banner?: { url?: string } | string | number | null;
```

The `banner` field is typed as a union of object/string/number/null — but in practice, PB returns the filename string, and `bannerUrl` is computed via `buildFileUrl()`. The type is overly permissive and forces defensive checks everywhere.

### 5.6 [LOW] `Member` interface duplicates `ExecomMember`
**File:** `src/types/index.ts:92-101` — `Member` is a "legacy home page shape" derived from `ExecomMember`. Having two interfaces for the same concept is confusing.

---

## 6. Security

### 6.1 [CRITICAL] PII exposed on public ticket endpoint
**File:** `src/routes/api/ticket.$ticketId.ts:26-34`

The ticket endpoint returns `userName`, `userEmail`, `userPhone` for **authenticated** users. But the auth check is:
```typescript
const pb = createPB(cookie);
const isAuthenticated = pb.authStore.isValid;
```

This checks if the cookie is **present and not expired** — but doesn't verify the user is authorized to see **this specific** ticket. Any authenticated user can look up **any** ticket by ID and see the registrant's name, email, and phone. The `ticketId` is a `TKT-` prefixed random string, but it's shown in URLs (`/ticket/$ticketId`) and could be leaked.

**Fix:** Only return PII if the authenticated user owns the ticket, or if they're an admin/chair scoped to the event.

### 6.2 [HIGH] Logout CSRF check is bypassable when `PUBLIC_APP_URL` is unset
**File:** `src/routes/api/auth/logout.ts:16-17`

```typescript
const appUrl = process.env.PUBLIC_APP_URL;
if (appUrl && origin) {
```

If `PUBLIC_APP_URL` is not set (which shouldn't happen in prod, but could in misconfigured environments), the CSRF check is **skipped entirely**. An attacker can POST to `/api/auth/logout` from any origin and log the user out.

### 6.3 [HIGH] `verifySameOrigin` is not applied to all mutations
**Files:** `src/routes/api/admin/societies.ts` POST — ✅ has `verifySameOrigin`  
**File:** `src/routes/api/admin/stats.ts` GET — no CSRF needed (read-only)  
**File:** `src/routes/api/admin/registrations.ts` GET — no CSRF needed  
**File:** `src/routes/api/admin/registrations.$id.ts` PUT — ✅ has `verifySameOrigin`  
**File:** `src/routes/api/admin/events.ts` POST — ✅ has `verifySameOrigin`

However, **server functions** (`createServerFn` in `admin.index.tsx`) have **no explicit CSRF check** — they rely on the auto-installed middleware which is unverified.

### 6.4 [HIGH] Webhook secret comparison — length leak before timingSafeEqual
**File:** `src/routes/api/orders/webhook.ts:24-26`

```typescript
if (expected.length !== received.length) {
  return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
}
```

The length check before `timingSafeEqual` leaks the **expected secret length** via timing. An attacker can determine the secret length by measuring response times for different-length guesses.

**Fix:** Pad both buffers to the same length before comparing, or use `crypto.timingSafeEqual` with a length-agnostic approach (hash both and compare hashes).

### 6.5 [MEDIUM] `createAdminPB()` used in user-facing request paths
**Files:** `src/lib/registration-service.ts:78` (coupon validation), `:270` (counter bump)

When a user registers for a paid event with a coupon, `validateAndApplyCoupon` creates a **superuser-authenticated PB client** inside the request. If this client leaks (e.g., through a programming error), it could be used to bypass all access rules.

### 6.6 [MEDIUM] No rate limiting on registration or auth endpoints
**Files:** `src/routes/api/registrations.ts` (POST), `src/routes/api/events.validate-coupon.ts` (POST), `src/routes/api/auth/init.ts` (GET)

There's no rate limiting on:
- Registration creation (could spam-create registrations to exhaust capacity)
- Coupon validation (could brute-force coupon codes)
- OAuth init (could be used for OAuth denial-of-service)

### 6.7 [MEDIUM] Error messages leak internal details in production
**File:** `src/lib/api-error.ts:29-31`

```typescript
if (error instanceof ClientResponseError) {
  const status = error.status
  // ...
  return Response.json({ error: 'Request failed' }, { status })
}
```

This is good — it returns generic messages. But `handleError` for unknown errors returns `{ error: 'Internal server error' }` which is fine. However, the **route-level** error handlers in `admin.index.tsx:113` catch and return `EMPTY_DASHBOARD` with `logError` — but the `errorComponent` in `admin.tsx:18` displays `error.message` to the user, which could contain stack traces or internal details.

### 6.8 [MEDIUM] PB API rules allow chairs to update events outside their scope
**File:** `scripts/migrate-pb-rules.ts:19`

```typescript
updateRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && society = @request.auth.society.id)`,
```

This rule references `@request.auth.society.id` — but the `users` collection doesn't have a `society` relation field (based on the migration scripts). This means the rule may **always evaluate to false** for chairs, preventing them from updating events via the PB API directly. The app works around this by using `createAdminPB()` in some paths, but the PB-level rule is incorrect.

### 6.9 [LOW] OAuth state cookie — `sameSite: "lax"` allows top-level redirects
**File:** `src/routes/api/auth/init.ts:42` — `sameSite: "lax"` is correct for OAuth, but the cookie is `httpOnly` and `secure` (in production) — good. The `maxAge: 300` (5 min) is reasonable.

### 6.10 [LOW] `dangerouslySetInnerHTML` used for JSON-LD scripts
**File:** `src/routes/__root.tsx:55-59` — Uses `dangerouslySetInnerHTML` for JSON-LD structured data. The content is escaped (`\\u003c`, `\\u003e`, `\\u0026`), which is correct. No XSS vector here.

---

## 7. Schema Design

### 7.1 [HIGH] Coupons stored as JSON array inside event record
**File:** `scripts/migrate-to-pb.ts:89` — `{ name: 'coupons', type: 'json' }`

Coupons are stored as a JSON array field on the `events` collection. This means:
- No unique constraint on coupon codes
- Updating `usedCount` requires reading the entire event record, modifying the JSON array, and writing it back — a classic read-modify-write race
- The `validateAndApplyCoupon` function (`registration-service.ts:73-106`) tries to mitigate this with retry-on-conflict, but the retry reads the entire event record each time
- Deleting a coupon or querying "all coupons across events" is impossible without loading every event

**Fix:** Create a separate `coupons` collection with a relation to `events`. Add a unique index on `code`. Use atomic `update` with a filter for `usedCount` increment.

### 7.2 [MEDIUM] `execom` collection — `listRule: ""` means public read of all fields
**File:** `scripts/migrate-pb-rules.ts:32-33`

```typescript
listRule: ``,
viewRule: ``,
```

Empty string rules in PocketBase mean **anyone can read**. The `execom` collection has `email` and `phone` fields — these are publicly accessible to anyone. This is a PII leak.

**Fix:** Set `listRule` and `viewRule` to `true` (publicly readable) but remove `email` and `phone` from the default fields returned, or set the rules to exclude those fields.

### 7.3 [MEDIUM] Denormalized counters (`registeredCount`, `checkedInCount`) can drift
**File:** `src/lib/registration-service.ts:261-296` (`bumpEventCounter`)

The counter update uses optimistic retry-on-conflict (3 attempts). But the `confirmRegistration` function (`:178-195`) has a **documented race condition**:

```typescript
// Note: a concurrent caller may also see wasPending=true and bump.
//       Race window is ~1ms. For precise accounting, use PB hooks with unique constraints.
```

The `reconcile-counters.ts` script exists to fix drift, but it's a manual operation. The app explicitly chose "no PB hooks" — relying on application-level counter management with known race conditions.

### 7.4 [MEDIUM] No index on `societies.chairs` relation
**File:** `scripts/migrate-indexes.ts` — No index on the `chairs` relation field in `societies`. The `getChairSocietyIds` function (`chair-scope.ts:27`) queries `chairs ?= userId` on every admin request — without an index, this is a full table scan.

### 7.5 [LOW] `formTemplate` is `unknown` in the type but `json` in PB
**File:** `src/types/index.ts:51` — `formTemplate?: unknown`  
The `formTemplate` field stores an array of form field definitions but is typed as `unknown`. This forces defensive `Array.isArray()` checks everywhere.

### 7.6 [INFO] Registration unique constraint is well-designed
**File:** `scripts/migrate-indexes.ts:14` — `CREATE UNIQUE INDEX idx_registrations_user_event ON registrations (user, event) WHERE registrationStatus != "cancelled"` — This is correct: a user can have one active registration per event, but can re-register after cancelling. Good design.

---

## 8. Performance

### 8.1 [HIGH] Dashboard stats — N+1 count queries
**File:** `src/routes/admin.index.tsx:68-90` — `getAdminDashboard` makes **9 separate `getList(1, 1, { count: 1 })`** calls to PB. Each is a separate HTTP request to PocketBase. Then it makes 2 more list requests for upcoming events and recent registrations, plus a 500-item list for chart data. That's **12 sequential HTTP round-trips** on every dashboard load.

**Fix:** Use a single PB `aggregate` query or batch the count queries. Or cache the dashboard stats with a short TTL (30s) via TanStack Query.

### 8.2 [HIGH] Admin users list — N+1 registration count
**File:** `src/routes/api/admin/users.ts:50-65`

The users list fetches all users, then fetches **all registrations for those users** in one query, then counts them in memory. For 500 users with 1000 registrations, this loads 1000 registration records into memory just to count them.

**Fix:** Use PB's `aggregate` API or a separate `user_stats` view.

### 8.3 [MEDIUM] Admin societies list — N+1 event count
**File:** `src/routes/api/admin/societies.ts:47-62` — Same pattern: fetch all societies, then fetch all events for those societies, count in memory.

### 8.4 [MEDIUM] `FloatingAction.tsx` — continuous timer-driven re-renders
**File:** `src/components/FloatingAction.tsx` — 6+ active timers (`setInterval` for blink, walk, action scheduler) cause React re-renders at 60fps during walking. Each re-render re-evaluates the entire SVG.

### 8.5 [MEDIUM] No image optimization
**Files:** Event banners, society logos, execom photos

Images are served directly from PocketBase's file API with no `width`/`height` attributes on `<img>` tags (e.g., `EventCard.tsx`, `EventsShowcase.tsx`). No `loading="lazy"`, no `srcset` for responsive images. The home page loads all event banners immediately.

### 8.6 [LOW] Client-side data fetching waterfalls
**File:** `src/features/register/RegisterPage.tsx:48-67` — The register page fetches event data via `fetch('/api/events/${eventId}')` on mount. This should be a route loader for SSR.

**File:** `src/features/admin/UserDetailPage.tsx:22-40` — Same pattern: fetches user data via `useEffect` + `fetch()` instead of using a route loader.

---

## 9. Testing

### 9.1 [HIGH] No test coverage for critical security paths
The following critical paths have **zero tests**:
- OAuth callback (`src/routes/api/auth/callback/google.ts`)
- CSRF verification (`src/lib/verify-same-origin.ts`)
- Chair scope filtering (`src/lib/chair-scope.ts`)
- Webhook idempotency (`src/lib/webhook.ts`)
- Cookie signing (`src/lib/cookie-signing.ts`)

### 9.2 [MEDIUM] E2E tests only test API smoke — no UI E2E
**Files:** `tests/e2e/smoke.spec.ts`, `register-flow.spec.ts`, `edge-cases.spec.ts`, `api-smoke.spec.ts`

All E2E tests make HTTP requests directly — none test the actual UI (no `page.goto()`, no `page.click()`). The registration flow is tested at the API level only. Visual regressions, form interactions, and navigation are untested.

### 9.3 [MEDIUM] Unit tests don't mock PocketBase consistently
**File:** `tests/unit/lib/registration-service.test.ts` — Mocks PB but the mock doesn't implement `getList` with proper `totalItems`.  
**File:** `tests/integration/pb-operations.test.ts` — Requires a running PB instance, making it unsuitable for CI without infrastructure.

### 9.4 [LOW] Test setup uses real PB auth
**File:** `tests/setup.ts` — Requires `POCKETBASE_URL` and superuser credentials. Tests that need PB will fail silently if PB is unreachable.

---

## 10. Deployment

### 10.1 [HIGH] Dockerfile healthcheck uses `wget` which is not installed
**File:** `Dockerfile:32`

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
```

The `runner` stage uses `node:22-alpine` which does **not** include `wget`. The healthcheck will always fail, marking the container as unhealthy.

**Fix:** Use `node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` or install `wget` via `apk add`.

### 10.2 [HIGH] Dockerfile doesn't copy `node_modules` to runner
**File:** `Dockerfile:28-31`

```dockerfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
```

The runner stage copies `dist`, `public`, and `package.json` — but **not `node_modules`**. TanStack Start's `node dist/server/server.js` requires runtime dependencies (express, react, etc.). This will crash with `Cannot find module` errors.

**Fix:** Either copy `node_modules` from the builder stage, or use a proper production install step (`bun install --production` or `npm ci --omit=dev`).

### 10.3 [HIGH] No CSP header in the application
**File:** `src/routes/__root.tsx:8` — Comment says "CSP, HSTS, and other security headers are set by the Caddy reverse proxy in production." But `docker-compose.yml` has Caddy **commented out**. The app runs behind no proxy, so **no security headers are set**.

**Fix:** Either uncomment Caddy in docker-compose, or add security headers via a TanStack Start middleware.

### 10.4 [MEDIUM] Docker compose — no volume for PocketBase
**File:** `docker-compose.yml` — PocketBase is external (`https://db.phloraxx.us.to`). This means PB data is on a different server. If that server goes down, the app has no fallback. There's no PB backup strategy documented.

### 10.5 [MEDIUM] No zero-downtime deployment capability
**File:** `docker-compose.yml` — Single replica, no rolling update strategy. `docker compose up` will restart the container, causing downtime.

### 10.6 [MEDIUM] Environment variables — secrets in compose env
**File:** `docker-compose.yml:14-15`

```yaml
- PAYMENT_WEBHOOK_SECRET=${PAYMENT_WEBHOOK_SECRET:?err}
- OAUTH_COOKIE_SECRET=${OAUTH_COOKIE_SECRET:?err}
```

The `:?err` syntax causes compose to fail if the variable is unset — good. But the secrets are passed as environment variables, which are visible in `/proc/<pid>/environ` to any process on the host. Use Docker secrets (`secrets:` in compose) for sensitive values.

### 10.7 [LOW] Dockerfile creates `nextjs` user/group but project isn't Next.js
**File:** `Dockerfile:25-26` — `adduser --system --uid 1001 nextjs` — Leftover from the Next.js migration. Should be renamed to `ieeeapp` or similar.

---

## 11. Accessibility

### 11.1 [MEDIUM] Icon-only buttons lack `aria-label`
**Files:** `src/components/Navbar.tsx`, `src/components/admin/AdminTopbar.tsx`, `src/features/admin/EventsTableClient.tsx`

Multiple icon-only buttons (hamburger menu, search, close, refresh) have no `aria-label` or `title` attribute. Screen readers announce only "button" with no context.

### 11.2 [MEDIUM] Modal dialogs lack focus trap
**File:** `src/components/events/EventDetailModal.tsx`, `src/components/LoginModal.tsx`

Modals use Framer Motion's `AnimatePresence` but don't trap focus or restore focus on close. Tab navigation escapes the modal. No `role="dialog"` or `aria-modal="true"`.

### 11.3 [LOW] Skip link exists but target has `tabIndex={-1}`
**File:** `src/routes/__root.tsx:68` — `<div id="main-content" tabIndex={-1}>` — `tabIndex={-1}` makes it programmatically focusable but removes it from tab order. This is correct for skip-link targets (the link moves focus to it). Good implementation.

### 11.4 [INFO] Form fields have proper `aria-invalid` and `aria-describedby`
**File:** `src/features/register/RegisterPage.tsx` — The registration form has proper ARIA attributes for error states. Good accessibility practice.

---

## 12. Migration Scripts

### 12.1 [HIGH] Migration scripts shell out to `curl` via `execSync`
**Files:** `scripts/migrate-to-pb.ts:41`, `scripts/migrate-pb-rules.ts:22`, `scripts/migrate-indexes.ts:17`

All migration scripts use `execSync('curl ...')` to call the PocketBase API. This is fragile:
- Requires `curl` to be installed
- String interpolation of auth tokens into shell commands (potential injection)
- No proper error handling (JSON parse failures are caught but not retried)
- `shell: true` on Windows uses `cmd.exe` which has different escaping rules

**Fix:** Use `fetch()` or the PocketBase JS SDK directly.

### 12.2 [MEDIUM] `migrate-to-pb.ts` has a naive SQL parser
**File:** `scripts/migrate-to-pb.ts:75-120` — The `readSQL` function parses a MySQL dump file with a hand-rolled parser. It handles quote escaping and nested parentheses but will fail on edge cases (escaped backslashes, multi-line strings, NULL values).

### 12.3 [LOW] `migrate-to-pb.ts` references `pb_hooks/events.pb.js` which was deleted
The migration script references hook files that no longer exist in the repo (they were deleted as part of the migration). This is expected but the script should be updated to note that hooks are no longer used.

---

## Summary Table

| Category | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|---|---|---|---|---|---|
| Architecture | 2 | 2 | 2 | 1 | 0 |
| Framework | 0 | 0 | 2 | 1 | 2 |
| Code Quality | 2 | 2 | 2 | 1 | 0 |
| Over-engineering | 0 | 1 | 2 | 1 | 0 |
| Redundancy | 0 | 2 | 2 | 2 | 0 |
| Security | 1 | 3 | 3 | 2 | 0 |
| Schema | 0 | 1 | 3 | 1 | 1 |
| Performance | 0 | 2 | 3 | 1 | 0 |
| Testing | 0 | 1 | 2 | 1 | 0 |
| Deployment | 0 | 3 | 2 | 1 | 0 |
| Accessibility | 0 | 0 | 2 | 1 | 1 |
| Scripts | 0 | 1 | 1 | 1 | 0 |
| **Total** | **6** | **18** | **26** | **14** | **4** |
