# IEEE Sahrdaya — Prioritized Remediation Plan

**Date:** 2026-06-23  
**Ordering:** Severity (CRITICAL → HIGH → MEDIUM → LOW → INFO), then dependency

---

## CRITICAL

### C1. Fix `regR` undefined variable in check-in endpoint
**File:** `src/routes/api/check-in.verify.ts:99`  
**What's wrong:** `regR.userName` references an undeclared variable. The actual variable is `registration`. Every successful check-in crashes with `ReferenceError: regR is not defined`.  
**Fix:** Change line 99 from `userName: regR.userName as string | undefined` to `userName: getField(registration, 'userName', '')`.  
**Effort:** 5 minutes  
**Risk:** Low — single line change, no side effects

### C2. Fix `ExtendedEvent` type — doesn't exist in `@/types`
**Files:**  
- `src/types/index.ts:81` — rename `EventExtended` to `ExtendedEvent` (or add `ExtendedEvent` as an alias)  
- `src/components/events/index.ts:5` — re-export  
- All files importing `ExtendedEvent` — verify they use the correct type  
**What's wrong:** `ExtendedEvent` is imported from `@/types` in 4+ files but is not defined there. The actual type is `EventExtended`. All event display components lose type safety.  
**Fix:** Either rename `EventExtended` to `ExtendedEvent` in `types/index.ts` (preferred — it's used more widely), or update all imports to use `EventExtended`.  
**Effort:** 15 minutes  
**Risk:** Low — type-only change, no runtime impact

### C3. Add `beforeLoad` auth guard to admin layout route
**File:** `src/routes/admin.tsx`  
**What's wrong:** No `beforeLoad` guard. Auth is client-side only via `<AdminGuard>`. Loaders run without guaranteed auth, and `adminLoader` swallows errors silently.  
**Fix:** Add `beforeLoad` that calls a server function to verify auth and throws `redirect({ to: '/', search: { error: 'unauthorized' } })` on failure:
```typescript
export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const user = await getCurrentUser() // createServerFn
    if (!user || (user.role !== 'admin' && user.role !== 'chair')) {
      throw redirect({ to: '/', search: { error: 'unauthorized' } })
    }
  },
  // ...
})
```
**Effort:** 1 hour  
**Risk:** Medium — must ensure the server function works with SSR and doesn't break the admin layout

### C4. Create `src/start.ts` with explicit CSRF middleware
**File:** `src/start.ts` (new)  
**What's wrong:** No `src/start.ts` exists. TanStack Start auto-installs CSRF middleware, but this is unverified. Server functions have no explicit CSRF protection.  
**Fix:** Create `src/start.ts`:
```typescript
import { createStart, createCsrfMiddleware } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
  origin: process.env.PUBLIC_APP_URL,
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))
```
**Effort:** 30 minutes  
**Risk:** Medium — must verify all server functions work with CSRF middleware enabled. Test OAuth callbacks and webhook (these are API routes, not server functions, so should be unaffected).

### C5. Fix PII exposure on public ticket endpoint
**File:** `src/routes/api/ticket.$ticketId.ts:52-65`  
**What's wrong:** Any authenticated user can view any ticket's PII (name, email, phone) by knowing the ticketId. The auth check only verifies `pb.authStore.isValid`, not ownership.  
**Fix:** Add ownership check:
```typescript
if (isAuthenticated) {
  // Only return PII if the user owns this ticket or is admin/chair for the event
  const userId = pb.authStore.record?.id
  const isAdmin = pb.authStore.record?.role === 'admin'
  const isChair = pb.authStore.record?.role === 'chair'
  if (getField(reg, 'user', '') === userId || isAdmin || isChair) {
    response.registration = { /* PII fields */ }
  }
}
```
**Effort:** 30 minutes  
**Risk:** Low — adds a condition, doesn't change existing flow for owners

### C6. Fix Dockerfile — missing `node_modules` in runner stage
**File:** `Dockerfile:28-31`  
**What's wrong:** The runner stage copies `dist`, `public`, and `package.json` but not `node_modules`. The app will crash on startup with `Cannot find module`.  
**Fix:** Add production dependency install:
```dockerfile
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
RUN bun install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
```
**Effort:** 15 minutes  
**Risk:** Low — standard Docker pattern. Verify `bun install --production` works with the lockfile.

---

## HIGH

### H1. Fix Dockerfile healthcheck — `wget` not available
**File:** `Dockerfile:32`  
**What's wrong:** `node:22-alpine` doesn't include `wget`. Healthcheck always fails.  
**Fix:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```
**Effort:** 5 minutes  
**Risk:** Low

### H2. Fix logout CSRF — skip when `PUBLIC_APP_URL` unset
**File:** `src/routes/api/auth/logout.ts:16-17`  
**What's wrong:** `if (appUrl && origin)` — if `PUBLIC_APP_URL` is unset, CSRF check is skipped.  
**Fix:** Fail closed in production:
```typescript
if (!appUrl) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  // dev: skip check
} else if (origin) {
  // existing origin check
}
```
**Effort:** 10 minutes  
**Risk:** Low

### H3. Fix webhook secret timing leak
**File:** `src/routes/api/orders/webhook.ts:24-26`  
**What's wrong:** Length check before `timingSafeEqual` leaks the expected secret length.  
**Fix:** Hash both values and compare, or pad to same length:
```typescript
const expectedHash = crypto.createHash('sha256').update(webhookSecret).digest()
const receivedHash = crypto.createHash('sha256').update(headerSecret).digest()
if (!crypto.timingSafeEqual(expectedHash, receivedHash)) {
  return Response.json({ error: 'Invalid webhook secret' }, { status: 401 })
}
```
**Effort:** 10 minutes  
**Risk:** Low

### H4. Migrate admin API routes to server functions
**Files:** All `src/routes/api/admin/*.ts`  
**What's wrong:** Admin API routes use `fetch()` from client components — losing type safety, CSRF protection, and creating duplication with server functions.  
**Fix:** 
1. Convert each `api/admin/*` route to a `createServerFn` with `validator()`
2. Update client components to call the server function directly
3. Keep only `api/orders/webhook.ts`, `api/auth/*`, and `api/events.$id.export.ts` as API routes
**Effort:** 4-6 hours  
**Risk:** Medium — touches many files. Do incrementally: stats first, then events, then registrations, etc.

### H5. Add security headers middleware
**File:** `src/start.ts` (or Caddyfile)  
**What's wrong:** No CSP, HSTS, X-Content-Type-Options headers in the application. Caddy is commented out in docker-compose.  
**Fix:** Either uncomment Caddy in docker-compose, or add headers in `src/start.ts`:
```typescript
const securityHeaders = createMiddleware(() => ({
  onRequest: (ctx, next) => {
    const res = next()
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    return res
  }
}))
```
**Effort:** 1 hour  
**Risk:** Low — headers only affect response, no logic change

### H6. Fix PB rule for chair event updates
**File:** `scripts/migrate-pb-rules.ts:19`  
**What's wrong:** `@request.auth.society.id` references a field that doesn't exist on the `users` collection. Chairs can't update events via PB API.  
**Fix:** Either add a `society` relation to the `users` collection, or change the rule to use a subquery: `@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id`. Run `bun scripts/migrate-pb-rules.ts` after fixing.
**Effort:** 30 minutes  
**Risk:** Medium — changing PB rules affects all access. Test thoroughly.

### H7. Extract auth+scope boilerplate into middleware
**Files:** All `src/routes/api/admin/*.ts`  
**What's wrong:** Every admin route repeats 8-10 lines of auth + scope checking.  
**Fix:** Create a TanStack Start middleware that handles auth, role checking, and scope injection:
```typescript
const adminAuthMiddleware = createMiddleware().handler(async (ctx, next) => {
  const pb = createPB(getRequestHeader('cookie') || '')
  const { user } = await requireRole(['admin', 'chair'], pb)
  return next({ context: { pb, user } })
})
```
**Effort:** 2 hours  
**Risk:** Medium — touches all admin routes

### H8. Fix `execom` collection PII exposure
**File:** `scripts/migrate-pb-rules.ts:32-33`  
**What's wrong:** `listRule: ""` and `viewRule: ""` make all execom fields (including `email`, `phone`) publicly readable.  
**Fix:** Either remove `email` and `phone` from the collection, or set rules to only expose public fields. Update the migration script and re-run.
**Effort:** 30 minutes  
**Risk:** Low

### H9. Fix tsconfig — add `jsx` and run `tsc` in CI
**File:** `tsconfig.json`  
**What's wrong:** No `"jsx"` setting causes 2766 false-positive errors. Real type errors are buried.  
**Fix:** Add `"jsx": "react-jsx"` to `compilerOptions`. Add `tsc --noEmit` to CI. Fix all remaining non-JSX errors.
**Effort:** 2 hours (config + fixing real errors)  
**Risk:** Low — type checking only, no runtime impact

### H10. Move coupons to a separate collection
**Files:** `scripts/migrate-to-pb.ts`, `src/lib/registration-service.ts`, `src/types/index.ts`  
**What's wrong:** Coupons stored as JSON array on event record — causes read-modify-write races, no unique constraint on codes, can't query across events.  
**Fix:** Create a `coupons` collection with: `code` (unique index), `event` (relation), `discountType`, `discountValue`, `maxUses`, `usedCount`, `expiresAt`, `isActive`. Update `validateAndApplyCoupon` to use atomic `update` with a PB filter.
**Effort:** 3-4 hours  
**Risk:** Medium — schema migration, must update all coupon-related code

### H11. Fix dashboard N+1 count queries
**File:** `src/routes/admin.index.tsx:68-90`  
**What's wrong:** 12 separate HTTP round-trips to PB on every dashboard load.  
**Fix:** Use PB's aggregate API or a single query with computed fields. Cache results with TanStack Query (30s staleTime already set in `__root.tsx`).
**Effort:** 2 hours  
**Risk:** Low — optimization, same data returned

### H12. Add tests for critical security paths
**Files:** New test files in `tests/unit/lib/`  
**What's wrong:** Zero tests for OAuth callback, CSRF verification, chair scope, webhook idempotency, cookie signing.  
**Fix:** Add unit tests for:
- `verify-same-origin.ts` — origin matching, missing headers, production vs dev
- `chair-scope.ts` — admin unscoped, chair scoped, empty scope
- `cookie-signing.ts` — sign + verify roundtrip, tamper detection
- `webhook.ts` — idempotency logic, terminal status, transaction replay
**Effort:** 4 hours  
**Risk:** Low — test-only

### H13. Fix migration scripts — replace `curl` with `fetch`
**Files:** `scripts/migrate-to-pb.ts`, `scripts/migrate-pb-rules.ts`, `scripts/migrate-indexes.ts`  
**What's wrong:** Scripts use `execSync('curl ...')` — fragile, requires curl, potential injection.  
**Fix:** Use `fetch()` or PocketBase JS SDK. This also enables proper error handling and retries.
**Effort:** 2 hours  
**Risk:** Low — scripts are run manually, not in production

---

## MEDIUM

### M1. Simplify `FloatingAction.tsx`
**File:** `src/components/FloatingAction.tsx`  
**What's wrong:** 295-line decorative component with 6+ timers, continuous re-renders.  
**Fix:** Replace with a CSS-only animation (e.g., a simple bounce/fade) or a static SVG. Remove all React state and timers.  
**Effort:** 1 hour  
**Risk:** Low — decorative only

### M2. Consolidate design systems
**File:** `src/features/globals.css`  
**What's wrong:** Two competing design systems: shadcn/ui tokens + editorial-monocle CSS classes (1039 lines).  
**Fix:** Choose one system. If keeping shadcn/ui, remove the editorial classes and update admin components to use shadcn primitives. If keeping editorial, remove shadcn dependencies.  
**Effort:** 4-6 hours  
**Risk:** Medium — touches all admin components

### M3. Fix admin users list N+1
**File:** `src/routes/api/admin/users.ts:50-65`  
**What's wrong:** Loads all registrations into memory to count per-user.  
**Fix:** Use PB aggregate API or a `user_stats` materialized view.  
**Effort:** 1 hour  
**Risk:** Low

### M4. Fix admin societies list N+1
**File:** `src/routes/api/admin/societies.ts:47-62`  
**What's wrong:** Same pattern — loads all events to count per-society.  
**Fix:** Same as M3.  
**Effort:** 1 hour  
**Risk:** Low

### M5. Add image optimization
**Files:** `src/components/EventCard.tsx`, `src/components/EventsShowcase.tsx`, etc.  
**What's wrong:** No `loading="lazy"`, no `width`/`height`, no responsive `srcset`.  
**Fix:** Add `loading="lazy"` and explicit `width`/`height` to all `<img>` tags. Consider a CDN or image proxy for resizing.  
**Effort:** 2 hours  
**Risk:** Low

### M6. Add rate limiting
**Files:** `src/routes/api/registrations.ts`, `src/routes/api/events.validate-coupon.ts`, `src/routes/api/auth/init.ts`  
**What's wrong:** No rate limiting on registration, coupon validation, or OAuth init.  
**Fix:** Add a simple in-memory rate limiter (or use Caddy's rate limiting if enabled). 10 requests/minute per IP for registrations, 20/minute for coupon validation.  
**Effort:** 2 hours  
**Risk:** Low

### M7. Fix `UserDetailPage` race condition
**File:** `src/features/admin/UserDetailPage.tsx:22-40`  
**What's wrong:** `useEffect` fetch doesn't handle `id` changes during in-flight requests.  
**Fix:** Add `AbortController`:
```typescript
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/admin/users?id=${id}`, { signal: controller.signal })
    .then(...)
    .catch(err => { if (err.name !== 'AbortError') setError(...) })
  return () => controller.abort()
}, [id])
```
**Effort:** 15 minutes  
**Risk:** Low

### M8. Fix `RegisterPage` — use route loader instead of `useEffect` fetch
**File:** `src/routes/register.$eventId.tsx`, `src/features/register/RegisterPage.tsx`  
**What's wrong:** Event data fetched client-side via `useEffect` — causes loading flash and no SSR.  
**Fix:** Add a route loader that fetches event data server-side. Pass to component as prop.  
**Effort:** 1 hour  
**Risk:** Low

### M9. Add rate limiting / idempotency to registration creation
**File:** `src/lib/registration-service.ts:120-185`  
**What's wrong:** No protection against double-submission (user clicks "Register" twice). The unique index on `(user, event)` prevents duplicates, but the user gets an ugly error.  
**Fix:** Add a client-side debounce + server-side idempotency check (check for existing pending registration before creating).  
**Effort:** 1 hour  
**Risk:** Low

### M10. Add missing `aria-label` to icon-only buttons
**Files:** `src/components/Navbar.tsx`, `src/components/admin/AdminTopbar.tsx`, `src/features/admin/EventsTableClient.tsx`  
**What's wrong:** Icon-only buttons have no accessible name.  
**Fix:** Add `aria-label` to all icon-only `<button>` elements.  
**Effort:** 30 minutes  
**Risk:** Low

### M11. Add focus trap to modals
**Files:** `src/components/events/EventDetailModal.tsx`, `src/components/LoginModal.tsx`  
**What's wrong:** Modals don't trap focus, no `role="dialog"` or `aria-modal`.  
**Fix:** Use Radix Dialog (already available via shadcn) which handles focus trapping, or add `role="dialog" aria-modal="true"` and manual focus management.  
**Effort:** 1 hour  
**Risk:** Low

### M12. Add index on `societies.chairs`
**File:** `scripts/migrate-indexes.ts`  
**What's wrong:** No index on the `chairs` relation — every admin request does a full table scan.  
**Fix:** Add `CREATE INDEX idx_societies_chairs ON societies (chairs)` to the migration script.  
**Effort:** 10 minutes  
**Risk:** Low

### M13. Fix docker-compose — rename from "3 replicas" to single instance
**File:** `docker-compose.yml`  
**What's wrong:** Comment says "3 app replicas + Caddy" but it's a single instance with Caddy commented out.  
**Fix:** Update documentation. If 3 replicas are needed, use `deploy: replicas: 3` (requires Swarm) or run 3 services.  
**Effort:** 10 minutes  
**Risk:** Low

### M14. Pick one package manager — `bun` or `npm`
**Files:** `Dockerfile`, `package-lock.json`, `bun.lock`  
**What's wrong:** Both lockfiles exist. Dockerfile uses `bun`.  
**Fix:** Remove `package-lock.json` if using `bun`. Update CI to use `bun`.  
**Effort:** 10 minutes  
**Risk:** Low

### M15. Add UI E2E tests
**Files:** `tests/e2e/` — new spec files  
**What's wrong:** All E2E tests are API-level. No UI interaction testing.  
**Fix:** Add Playwright specs for: home page load, events page navigation, registration form flow, admin login redirect, admin dashboard render.  
**Effort:** 4 hours  
**Risk:** Low

---

## LOW

### L1. Remove dead `<div>` in Navbar
**File:** `src/components/Navbar.tsx:63-65`  
**Fix:** Delete the empty `<div>` with `onKeyDown`.  
**Effort:** 2 minutes

### L2. Replace `<a href="/admin">` with `<Link to="/admin">`
**File:** `src/components/Navbar.tsx:80`  
**Fix:** Use TanStack Router `Link` for SPA navigation.  
**Effort:** 5 minutes

### L3. Remove hardcoded execom data
**File:** `src/components/Execom.tsx:13-73`  
**Fix:** Fetch from `execom` collection instead of using hardcoded `MEMBERS` array. Fix typos (`DRIV` → `DRIVE`).  
**Effort:** 1 hour

### L4. Remove duplicate CSS keyframes
**File:** `src/components/EventsShowcase.tsx`  
**Fix:** Remove inline `<style>` blocks, use global classes from `globals.css`.  
**Effort:** 15 minutes

### L5. Fix Dockerfile user name from `nextjs` to `ieeeapp`
**File:** `Dockerfile:25-26`  
**Effort:** 5 minutes

### L6. Consolidate `Event` type — remove `banner` union type
**File:** `src/types/index.ts:46-47`  
**Fix:** Type `banner` as `string | null` (PB filename) only. Compute `bannerUrl` via `buildFileUrl()`.  
**Effort:** 30 minutes

### L7. Remove `Member` interface — use `ExecomMember` everywhere
**File:** `src/types/index.ts:92-101`  
**Effort:** 1 hour

### L8. Fix `useEffect` async patterns — use `AbortController` everywhere
**Files:** All components with `useEffect` + `fetch()`  
**Effort:** 1 hour

### L9. Add `loading="lazy"` to all images
**Effort:** 30 minutes

### L10. Fix `pb.ts` — `import.meta.env` type error
**File:** `src/lib/pb.ts:3`  
**Fix:** Add `vite-env.d.ts` with `/// <reference types="vite/client" />` or use `process.env`.  
**Effort:** 10 minutes

---

## INFO

### I1. Consider adding a `src/server.ts` for custom server entry
This enables global middleware, custom error handling, and request-scoped context. Not urgent but recommended for production.

### I2. Document the PocketBase backup strategy
PB is external (`db.phloraxx.us.to`). No backup strategy is documented. Add at minimum a cron-based `pb_backup` script.

### I3. Consider adding Sentry or similar error tracking
`logError` writes to `console.error` — errors are lost in container logs. Add a Sentry integration for production error tracking.

### I4. Consider adding a sitemap generator to CI
`scripts/generate-sitemap.ts` exists but isn't run in CI. Add it to the build step.

---

## Implementation Order

```
Phase 1 (Immediate — fix breakage):
  C1 → C2 → C6 → H1

Phase 2 (Security hardening):
  C3 → C4 → C5 → H2 → H3 → H5 → H6 → H8

Phase 3 (Architecture cleanup):
  H4 → H7 → H9 → H10

Phase 4 (Performance):
  H11 → M3 → M4 → M5 → M1

Phase 5 (Quality):
  H12 → H13 → M6-M15 → L1-L10
```

**Total estimated effort:** 40-50 hours
