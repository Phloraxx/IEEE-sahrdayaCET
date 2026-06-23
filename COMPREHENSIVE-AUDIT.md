# IEEE Sahrdaya — Comprehensive Codebase Audit Report

**Date:** 2026-06-23
**Auditors:** 8 subagents (Security, Performance, Architecture, Code Quality, Frontend/UI, Backend/API, TypeScript, Infrastructure)
**Files audited:** 98+ across `src/`, `server-entry.mjs`, `Dockerfile`, `Caddyfile`, config files
**Total issues found:** ~200 (including duplicates across domains)

---

## CRITICAL ISSUES (Must Fix)

### C1. `createAdminPB()` missing `return pb` — all admin operations broken

| Field | Value |
|-------|-------|
| **File** | `src/lib/pb.ts:27` |
| **Severity** | 🔴 Critical |
| **Found by** | Security, Architecture, CodeQuality, Backend, TypeScript |

**Description:** `createAdminPB()` creates a PocketBase client, saves the superuser token via `pb.authStore.save(token, null)`, but never `return pb`. Every caller receives `undefined` and crashes on `.collection()`:

- `src/lib/event-service.ts:9` — event soft-delete
- `src/lib/registration-service.ts:327` — `bumpEventCounter`
- `src/routes/api/orders/webhook.ts:38` — webhook event lookup
- `src/routes/api/orders/webhook.ts:119` — webhook `bumpEventCounter`

**Fix:** Add `return pb;` at the end of the function body.

### C2. Coupon filter injection (2 locations)

| Field | Value |
|-------|-------|
| **File** | `src/lib/registration-service.ts:41,77` |
| **Severity** | 🔴 Critical |
| **Found by** | Security |

**Description:** User-supplied `code` parameter is interpolated directly into PocketBase filter strings without escaping. An attacker can provide a coupon code like `' \|\| true \|\| '` to bypass validation or enumerate coupons. The project already has `escapeFilterValue()` but it's not used here.

**Fix:** Replace `'${code}'` with `${escapeFilterValue(code)}` in both `validateCouponCode` and `validateAndApplyCoupon`.

### C3. Static assets excluded by `.dockerignore`

| Field | Value |
|-------|-------|
| **File** | `.dockerignore:27` |
| **Severity** | 🔴 Critical |
| **Found by** | Infrastructure |

**Description:** `.dockerignore` excludes `*.png`, `*.webp`, `*.ico`, `*.svg`, `*.woff*`, `*.eot`, `*.ttf`, `*.otf`. This strips ALL image/icon/font assets from the build context. `public/` content (favicon, logos, social images) is missing in production.

**Fix:** Either remove the broad asset exclusion from `.dockerignore` or switch to a whitelist-only approach.

### C4. Missing static asset caching headers

| Field | Value |
|-------|-------|
| **File** | `server-entry.mjs:17-32` |
| **Severity** | 🔴 Critical |
| **Found by** | Performance |

**Description:** The production server sets NO `Cache-Control` headers for static assets. Build artifacts with content-hashed filenames (JS, CSS) should be cached aggressively (`max-age=31536000, immutable`). Currently every page load re-downloads the ~1MB+ JS bundle.

**Fix:** Add per-MIME-type Cache-Control headers in the static file handler.

---

## HIGH-SEVERITY ISSUES

### H1. Missing chair scope filtering in 6+ SSR admin routes

| Files | Description |
|-------|-------------|
| `src/routes/admin.events.$id.tsx:13` | Event detail — chair can view any event's details + all registration PII |
| `src/routes/admin.registrations.$id.tsx:9` | Registration detail — chair can view any registration's PII |
| `src/routes/admin.events.tsx:15` (server fn) | Events list — chair sees ALL events |
| `src/routes/admin.registrations.tsx:35` (server fn) | Registrations list — no scope filter for chairs |
| `src/routes/admin.societies.tsx:14` (server fn) | Societies list — no scope filter for chairs |
| `src/routes/admin.users.tsx:23` (server fn) | Users list — chairs can list all users |
| `src/routes/admin.execom.tsx:15` (server fn) | Execom list — chairs can see all members |
| **Found by** | Security, Backend |

**Fix:** Apply `scopeEventFilter` / `scopeRegistrationFilter` / `scopeSocietyFilter` from `chair-scope.ts` in each SSR server function, matching the REST API routes' behavior.

### H2. Duplicated `bumpEventCounter` in webhook

| Field | Value |
|-------|-------|
| **File** | `src/routes/api/orders/webhook.ts:113-141` |
| **Severity** | High |
| **Found by** | Architecture, Backend, CodeQuality |

**Description:** The webhook route inlines a complete copy of `bumpEventCounter` from `registration-service.ts` (24 lines including retry loop). The comment says "Inlined to avoid SSR code-split issues." Both copies call the broken `createAdminPB()` (C1). Any fix to the canonical version must be manually duplicated.

**Fix:** Extract to a shared SSR-safe module (e.g., `lib/event-counters.ts`) that both `registration-service.ts` and `webhook.ts` can import.

### H3. TOCTOU race — coupon `usedCount` incremented before registration creation

| Field | Value |
|-------|-------|
| **File** | `src/lib/registration-service.ts:178` |
| **Severity** | High |
| **Found by** | Security |

**Description:** `validateAndApplyCoupon()` atomically increments `usedCount+` on the coupon BEFORE creating the registration. If registration creation fails (capacity, validation, network), the coupon's usage counter has been permanently incremented, causing DoS against that coupon code.

**Fix:** Move `usedCount` increment AFTER successful registration creation, or wrap both in a PB transaction.

### H4. Weak OAuth cookie signing secret in dev mode

| Field | Value |
|-------|-------|
| **File** | `src/lib/cookie-signing.ts:14` |
| **Severity** | High |
| **Found by** | Security |

**Description:** Fallback HMAC secret uses `PUBLIC_APP_URL` which is publicly known. An attacker who knows the app URL can forge OAuth state cookies, enabling CSRF on the OAuth callback and potentially account takeover.

**Fix:** Always require `OAUTH_COOKIE_SECRET`; remove the dev fallback that uses a known value.

### H5. Path traversal risk in static file serving

| Field | Value |
|-------|-------|
| **File** | `server-entry.mjs:44` |
| **Severity** | High |
| **Found by** | Security |

**Description:** File server checks `!url.pathname.includes('..')` but does not resolve the joined path against `CLIENT_DIR`. Encoded sequences (`%2e%2e`), symlinks, or null-byte injection could leak files outside the static directory.

**Fix:** Verify resolved path is within `CLIENT_DIR` using `path.resolve()` + `path.startsWith()`.

### H6. Missing security headers when deployed without reverse proxy

| Field | Value |
|-------|-------|
| **File** | `server-entry.mjs:34` |
| **Severity** | High |
| **Found by** | Security |

**Description:** The app sets no HSTS, CSP, X-Frame-Options, or X-Content-Type-Options headers. Caddy (which provides these) is commented out in docker-compose.yml. When deployed to PaaS without a reverse proxy, the app is vulnerable to clickjacking, MIME sniffing, and downgrade attacks.

**Fix:** Add security headers middleware to `server-entry.mjs`.

### H7. 5 different auth+PB patterns — extreme inconsistency

| Field | Value |
|-------|-------|
| **Files** | `admin-middleware.ts`, `admin-loader.ts`, 13 inline patterns |
| **Severity** | High |
| **Found by** | Architecture |

**Description:** Auth/PB creation done 5 ways across the codebase. `admin-middleware.ts` and `admin-loader.ts` overlap 90%. API routes under `routes/api/admin/` ignore both abstractions and inline everything.

**Fix:** Consolidate into a single `authenticateRequest(roles?)` utility all routes use.

### H8. `buildChairFilter` duplicates `chair-scope.ts` scope builders

| Field | Value |
|-------|-------|
| **File** | `src/lib/admin-middleware.ts:31` |
| **Severity** | High |
| **Found by** | Architecture |

**Description:** `admin-middleware.ts` `buildChairFilter()` duplicates `chair-scope.ts` `scopeEventFilter()`, `scopeRegistrationFilter()`, `scopeSocietyFilter()`. Same logic, different wrapper.

**Fix:** Remove `buildChairFilter` from `admin-middleware.ts`; have callers use `chair-scope.ts` functions directly.

### H9. Passwordless scroll listener in Navbar

| Field | Value |
|-------|-------|
| **File** | `src/components/Navbar.tsx:58-78` |
| **Severity** | High |
| **Found by** | Performance |

**Description:** Scroll event listener fires on every frame, calling `setIsVisible` which triggers React re-render. Missing `{ passive: true }` option blocks scroll optimization.

**Fix:** Add `{ passive: true }` to scroll listener. Consider using CSS visibility classes or framer-motion's `useScroll`.

### H10. Hardcoded `registrationsCount: 0` in admin users

| Field | Value |
|-------|-------|
| **File** | `src/routes/admin.users.tsx:37` |
| **Severity** | High |
| **Found by** | CodeQuality |

**Description:** The `registrationsCount: 0` field is always set to 0 and never populated. If displayed in the UI, it's misleading.

**Fix:** Actually count registrations per user, or remove the field from the interface/UI.

---

## MEDIUM-SEVERITY ISSUES

### M1. Content-type check boilerplate in 13+ files
- **Files:** Multiple API routes (`logout.ts`, `validate-coupon.ts`, `check-in.verify.ts`, 10 admin handlers)
- **Found by:** Architecture, CodeQuality
- **Fix:** Create `requireJsonContentType(request)` helper

### M2. Missing CSRF on coupon validation endpoint
- **File:** `src/routes/api/events.validate-coupon.ts:13`
- **Found by:** Security
- **Fix:** Call `verifySameOrigin(request)` before processing

### M3. 11 concurrent PB queries on admin dashboard
- **File:** `src/features/admin/admin.index.tsx:52-229`
- **Found by:** Performance
- **Fix:** Combine count queries; cache with 30s TTL

### M4. Duplicate CSV export endpoints
- **Files:** `admin.events.$id.registrations-csv.ts` + `events.$id.export.ts`
- **Found by:** Architecture, Backend
- **Fix:** Merge into one canonical endpoint

### M5. EventForm has 6 redundant field representations
- **File:** `src/features/admin/EventForm.tsx:50-261`
- **Found by:** Architecture
- **Fix:** Derive types from single Zod schema

### M6. Event type sprawl — 8+ overlapping interfaces
- **File:** `src/types/index.ts` + route files
- **Found by:** Architecture
- **Fix:** Pick from single canonical Event type

### M7. AdminGuard client-side guard is redundant
- **File:** `src/components/admin/AdminGuard.tsx`
- **Found by:** Architecture
- **Fix:** Remove; server-side `beforeLoad` is sufficient

### M8. API routes as TanStack Route files — antipattern
- **File:** `src/routes/api/*`
- **Found by:** Architecture
- **Fix:** Move API handlers to `server/api/` outside router

### M9. 4 different data-fetching patterns in admin
- **File:** `src/routes/admin.*.tsx`
- **Found by:** Architecture
- **Fix:** Standardize on server functions

### M10. Missing Zod validation on validate-coupon body
- **File:** `src/routes/api/events.validate-coupon.ts:22`
- **Found by:** Security
- **Fix:** Define and use Zod schema for request body

### M11. No rate limiting on auth init endpoint
- **File:** `src/routes/api/auth/init.ts:10`
- **Found by:** Security
- **Fix:** Add rate limiting middleware

### M12. No body size limit on reverse proxy
- **File:** `Caddyfile:27`
- **Found by:** Infrastructure
- **Fix:** Add `request_body` size limit

### M13. Missing `loading=lazy` on some images
- **File:** Multiple components
- **Found by:** Performance
- **Fix:** Add `loading="lazy"` to below-fold images

### M14. Client-side PocketBase calls in SocietiesClient
- **File:** `src/features/societies/SocietiesClient.tsx:244-333`
- **Found by:** Performance, Security
- **Fix:** Cache fetched data; route through server API

### M15. Framer Motion scroll transforms — heavy animation
- **File:** `src/components/Hero.tsx:6-88`
- **Found by:** Performance
- **Fix:** Consider CSS transforms instead of framer-motion useScroll

### M16. SVG feTurbulence noise filter — very expensive
- **File:** `src/components/GridBackground.tsx`
- **Found by:** Performance
- **Fix:** Replace inline SVG filter with small PNG image

### M17. `DragCarousel` missing `setPointerCapture`
- **File:** `src/components/Execom.tsx:317`
- **Found by:** Frontend
- **Fix:** Add `setPointerCapture`/`releasePointerCapture`

### M18. Missing role="alert" on error boundary
- **File:** `src/components/ErrorBoundary.tsx:27`
- **Found by:** Frontend
- **Fix:** Add `role="alert"` to error container

### M19. Modal in LoginModal doesn't lock scroll
- **File:** `src/components/LoginModal.tsx:67`
- **Found by:** Frontend
- **Fix:** Add `useEffect` for `body.style.overflow`

### M20. Focus trap doesn't auto-focus on open
- **File:** `src/components/LoginModal.tsx:80`
- **Found by:** Frontend
- **Fix:** Move focus to first focusable element when modal opens

### M21. Nav dropdown missing ARIA attributes
- **File:** `src/components/Navbar.tsx:142`
- **Found by:** Frontend
- **Fix:** Add `role="menu"` and `role="menuitem"`

### M22. Execom social links render `href="#"` when no data
- **File:** `src/components/Execom.tsx:177`
- **Found by:** Frontend
- **Fix:** Conditionally render links only when data exists

### M23. DragCarousel ignores `prefers-reduced-motion`
- **File:** `src/components/Execom.tsx:356`
- **Found by:** Frontend
- **Fix:** Check `prefers-reduced-motion` in animate callback

### M24. Events marquee images have repetitive alt text
- **File:** `src/components/EventsShowcase.tsx:47`
- **Found by:** Frontend
- **Fix:** Change to `alt=""` for decorative marquee images

### M25. SocietyStrip infinite scroll ignores reduced motion
- **File:** `src/components/SocietyStrip.tsx:88`
- **Found by:** Frontend
- **Fix:** Use `useReducedMotion()` from framer-motion

### M26. Admin dashboard lacks chair scope for societies count
- **File:** `src/routes/admin.index.tsx:161-169`
- **Found by:** Backend
- **Fix:** Apply `scopeSocietyFilter` to societies count query

### M27. Missing Safety — POCKETBASE_SUPERUSER_TOKEN exposed in build
- **File:** `src/lib/pb.ts:22-23`
- **Found by:** Backend
- **Fix:** Use runtime env var instead of compile-time references where possible

### M28. `bun@latest` unpinned in Dockerfile
- **File:** `Dockerfile:14`
- **Found by:** Infrastructure
- **Fix:** Pin bun version (e.g., `bun@1.3.14`)

### M29. Dev dependencies shipped to production image
- **File:** `Dockerfile:49`
- **Found by:** Infrastructure
- **Fix:** Use `bun install --production` in runner stage

### M30. HSTS preload without confirmation
- **File:** `Caddyfile:11`
- **Found by:** Infrastructure
- **Fix:** Remove preload directive until submitting to HSTS preload list

---

## LOW-SEVERITY ISSUES

### L1. Unused `getErrorStatus` duplicate dispatch chain
- **File:** `src/lib/api-error.ts:41-55`
- **Found by:** Architecture
- **Fix:** Inline into single caller

### L2. `toIso` one-line wrapper adds no value
- **File:** `src/lib/dates.ts:4-6`
- **Found by:** Architecture
- **Fix:** Inline `date.toISOString()` at call sites

### L3. `getField/safe-get` encourages untyped access
- **File:** `src/lib/safe-get.ts`
- **Found by:** Architecture
- **Fix:** Replace with direct typed property access where interfaces exist

### L4. 16 files for 4-entity CRUD — excessive
- **File:** `src/routes/admin.*.tsx`
- **Found by:** Architecture
- **Fix:** Use parameterized `EntityFormPage` component

### L5. Unused `ExecomUpdate` type export
- **File:** `src/schemas/execom.ts:21`
- **Found by:** Architecture
- **Fix:** Remove unused export

### L6. Scope builders each call `getChairSocietyIds` independently
- **File:** `src/lib/chair-scope.ts:30-93`
- **Found by:** Architecture
- **Fix:** Accept optional pre-resolved `societyIds` parameter

### L7. `PageTransition mode="wait"` adds admin nav latency
- **File:** `src/components/admin/PageTransition.tsx:11`
- **Found by:** Architecture
- **Fix:** Use `mode="popLayout"` instead

### L8. Auth context `fetchUser` dependency confusing
- **File:** `src/lib/auth-context.tsx:59`
- **Found by:** Architecture
- **Fix:** Call `fetchUser()` directly with `[]` dependency

### L9. Unused null check after PocketBase `getOne`
- **File:** `src/routes/register.$eventId.tsx:9`
- **Found by:** CodeQuality
- **Fix:** Remove unreachable null check

### L10. Duplicate error components across 20 admin routes
- **File:** All `admin.*.tsx` routes
- **Found by:** CodeQuality
- **Fix:** Create shared `AdminErrorComponent`

### L11. Leftover `NEXT_PUBLIC_APP_URL` from Next.js era
- **File:** `src/lib/cookie-signing.ts:14`
- **Found by:** CodeQuality
- **Fix:** Remove dead reference

### L12. `libc6-compat` likely unnecessary in Alpine
- **File:** `Dockerfile:19`
- **Found by:** Infrastructure
- **Fix:** Remove, test without

### L13. Stale EXDEV cache mount comment in Dockerfile
- **File:** `Dockerfile:32`
- **Found by:** Infrastructure
- **Fix:** Remove misleading comment

### L14. No resource limits on app container
- **File:** `docker-compose.yml:13`
- **Found by:** Infrastructure
- **Fix:** Add `deploy.resources.limits`

### L15. Double port exposure risk with Caddy
- **File:** `docker-compose.yml:19`
- **Found by:** Infrastructure
- **Fix:** Remove app port exposure when Caddy is enabled

---

## PER-AGENT SUMMARY

### Security (18 issues)
- 3 critical (createAdminPB return, 2× coupon injection)
- 9 high (missing chair scopes, TOCTOU race, weak OATH secret, path traversal, missing headers, no rate limiting)
- 6 medium (missing CSRF, no Zod validation, auto-parsing form data)

### Performance (31 issues)
- 6 critical (11× PB queries on admin dashboard, repeated PB client creation, missing cache headers)
- 9 high (sequential ticket+QR, unnecessary Execom fetch, bumpEventCounter retry waste, scroll handler, 7× same collection queries)
- 10 medium (missing React.memo, no cache headers on routes, double-fetch patterns, heavy framer-motion animations, SVG noise filter, image marquee)
- 6 low (passive listener, unused keys, auto-scroll without pause, inline functions)

### Architecture (20 issues)
- 1 critical (createAdminPB return)
- 4 high (5× auth patterns, buildChairFilter duplication, webhook duplication, duplicate CSV endpoints)
- 10 medium (content-type boilerplate, 6× EventForm representations, event type sprawl, AdminGuard redundancy, API routes as router files, 4× data-fetching patterns)
- 5 low (unused types, scope builder inefficiency, PageTransition latency, auth context warts)

### Code Quality (8 findings)
- 1 critical (createAdminPB return)
- 2 high (chair scope in registrations, hardcoded registrationsCount=0)
- 4 medium (unreachable null check, 20× duplicate error components, nonsensical content-type check, cookie-signing leftover)
- 1 low

### Frontend / UI / Accessibility (20 issues)
- 0 critical
- 2 high (LoginModal no scroll lock, MemberCard social links with href="#")
- 16 medium (ARIA roles, focus traps, reduced motion, alt text, touch targets, pointer capture)
- 2 low

### Backend / API / Data (30+ issues)
- 1 critical (createAdminPB return)
- 5 high (chair scope in SSR routes, admin dashboard scope, inlined webhook, hardcoded domain logic, script credentials)
- 12 medium (auth consistency, missing safety, webhook idempotency)
- Remaining low

### TypeScript / Build Config (17 findings)
- 5 critical (createAdminPB return × 4 callers)
- 4 high (fabricated context types in 4 route loaders)
- 8 medium (unsafe casts, null checks, unused deps, ESLint config gaps)

### Infrastructure / CI-CD (54 items)
- 3 critical (.dockerignore strips assets, no cache headers, bun@latest unpinned)
- 8 high (HSTS preload, Caddy body limit, rate limiting, health check, stale comment)
- 12 medium (resource limits, depends_on, port exposure, dockerignore gaps)
- 26 info/warnings

---

## TOP 10 ACTIONS

| # | Issue | Effort | Impact | File |
|---|-------|--------|--------|------|
| 1 | Add `return pb` to `createAdminPB()` | 1 min | 🔴 Critical — all admin operations broken | `src/lib/pb.ts:27` |
| 2 | Escape coupon codes with `escapeFilterValue()` | 5 min | 🔴 Critical — filter injection | `src/lib/registration-service.ts:41,77` |
| 3 | Fix `.dockerignore` to include assets | 5 min | 🔴 Critical — missing images/favicon in prod | `.dockerignore` |
| 4 | Apply chair scope filters to 6 SSR admin routes | 30 min | 🟠 High — data leak | `src/routes/admin.*.tsx` |
| 5 | Consolidate `bumpEventCounter` + fix webhook | 20 min | 🟠 High — duplicated code | `webhook.ts`, `registration-service.ts` |
| 6 | Add Cache-Control headers to static assets | 15 min | 🟠 High — performance | `server-entry.mjs` |
| 7 | Fix TOCTOU race in coupon apply | 15 min | 🟠 High — coupon DoS | `registration-service.ts:178` |
| 8 | Consolidate auth patterns into single utility | 1 hour | 🟠 High — consistency | `admin-middleware.ts`, `admin-loader.ts` |
| 9 | Add security headers to server-entry.mjs | 10 min | 🟠 High — missing CSP/HSTS | `server-entry.mjs` |
| 10 | Reduce admin dashboard from 11 to 4 queries | 30 min | 🟡 Medium — performance | `admin.index.tsx` |
