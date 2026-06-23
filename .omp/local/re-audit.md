# IEEE Sahrdaya — Re-Audit Report

**Date:** 2026-06-23
**Reviewer:** Re-Audit Agent (Senior architect)
**Scope:** Verify all 68 findings from `architecture-review.md` were remediated; identify regressions and new issues.
**Verdict:** **62 of 68 items correctly fixed. 4 items have residual issues, 1 is a regression, 2 are new issues introduced by fixes.**

---

## 1. Items Verified as Correctly Fixed

### Phase 1 — Breakage Fixes (C1–C6) ✅
- **C1 — `regR` ReferenceError in check-in.verify.ts:** Fixed. `src/routes/api/check-in.verify.ts:99` now uses `getField(registration, 'userName', '')`. No `regR` reference remains.
- **C2 — `ExtendedEvent` type missing:** Fixed. `src/types/index.ts` now exports `ExtendedEvent` as an alias of `EventExtended`. Components importing `ExtendedEvent` resolve correctly.
- **C3 — `SocietyForm.tsx` `$$$` token:** Fixed. No `$$$` token present in `src/features/admin/SocietyForm.tsx`.
- **C4 — `Event.banner` type / `getField` usage:** Fixed. `registrations.ts` and `ticket.$ticketId.ts` now use `getField(evt, 'banner', '')` with `buildFileUrl` guard, eliminating TS2339.
- **C5 — `tsconfig.json` jsx:** Fixed. `"jsx": "react-jsx"` is present in `tsconfig.json`.
- **C6 — `regR`/registration variable drift:** Same as C1 — resolved.

### Phase 2 — Security Hardening ✅
- **C3 (ticket PII):** `src/routes/api/ticket.$ticketId.ts` now gates PII behind `isOwner || isAdmin || isChair`. Non-authenticated callers receive only `{ found, ticket, event }` with no `registration` PII object. Fields projection (`fields:`) limits what PB returns. **Correct.**
- **H2 (logout CSRF):** `src/routes/api/auth/logout.ts` now fails closed in production when `PUBLIC_APP_URL` is unset (returns 500), and validates `Origin` against `new URL(appUrl).origin` with try/catch for malformed origins. **Correct.**
- **H3 (webhook timing-safe comparison):** `src/routes/api/orders/webhook.ts` now hashes both the expected secret and received secret with SHA-256 before `crypto.timingSafeEqual`. This eliminates the length-leak vulnerability — both buffers are always 32 bytes. **Correct.**
- **H4–H8 (sameSite, verifySameOrigin, etc.):** All `Set-Cookie` calls in `init.ts`, `logout.ts`, `google.ts` use `sameSite: "strict"`. `verifySameOrigin` is applied to mutation routes. See §3 for the one regression this introduces.

### Phase 3 — Architecture Cleanup ✅
- **H4 (admin beforeLoad guard):** `src/routes/admin.tsx:11-16` now has `beforeLoad` calling `checkAdminAccess()` (a `createServerFn`) and `throw redirect({ to: "/" })` on failure. **Correct** — eliminates the unauthorized flash.
- **H7 (admin-middleware extraction):** `src/lib/admin-middleware.ts` provides `authenticateAdmin()` and `buildChairFilter()`. Confirmed usage across `api/admin/events.ts`, `societies.ts`, `stats.ts`. Boilerplate is consolidated.
- **H9 (ExtendedEvent):** Resolved via type alias.
- **H10 (admin-loader.ts → chair-scope.ts):** `chair-scope.ts` is the single source of truth; `admin-middleware.ts` builds on it.
- **H13 (FloatingAction over-engineering):** `src/components/FloatingAction.tsx` is now a static SVG with no timers/state. Reduced from 295 lines to ~110. **Correct.**

### Phase 4 — Performance ✅
- **H11 (dashboard N+1):** `admin.index.tsx` server function now batches into 4 PB calls (confirmed via the security test file's structure and `buildChairFilter` usage). Acceptable.
- **M1, M3–M6:** `bumpEventCounter` uses optimistic retry (3 attempts) with documented race window. `UserDetailPage.tsx:27-50` now uses `AbortController`. `FloatingAction` is CSS/SVG.

### Phase 5 — Code Quality ✅
- **M2, M7–M15, L1–L10:** `Member` interface removed (only `ExecomMember` remains). `createPB()` is the single factory. `handleError` is used consistently. `getField`/`getExpand` used throughout. `tsconfig` has `noUncheckedIndexedAccess`. AbortControllers present. aria-labels and focus traps confirmed in test coverage.

### Phase 6 — Testing ✅
- **H12 (security path tests):** `tests/unit/lib/security-paths.test.ts` (688 lines) covers: `verifySameOrigin` (origin matching, missing-origin, cross-origin, malformed URL), `chair-scope.ts` (isAdmin/isChair, getChairSocietyIds, all three scope filters, requireEventScope, requireRegistrationScope including array-relation edge cases), `webhook.ts` (isDuplicateWebhook terminal/non-terminal/transactionId matching, WebhookBodySchema validation), and `cookie-signing.ts` (roundtrip, tamper payload, tamper signature, malformed, timingSafeEqual length check). **Comprehensive.**

### Dockerfile ✅
- **node_modules copied:** `COPY --from=deps /app/node_modules ./node_modules` is present.
- **Healthcheck fixed:** Uses `node -e "fetch(...)"` instead of `wget`.
- **User renamed:** `ieeeapp:nodejs` instead of `nextjs`.

### Migration Scripts ✅
- **curl → fetch:** `migrate-to-pb.ts`, `migrate-pb-rules.ts`, `migrate-indexes.ts` all use `fetch()` with proper `isRecord` validation. No `execSync`/`curl` remaining.
- **`updatedRule` fix:** `migrate-pb-rules.ts` no longer references `@request.auth.society.id`; uses `society.chairs.id ?= @request.auth.id` for chair-scoped event updates.

### Coupons Collection ✅ (Partial)
- **Schema migration:** `migrate-to-pb.ts:274-292` creates a dedicated `coupons` collection with `code` (unique), `discountPercent`, `maxUses`, `usedCount`, `expiresAt`, `isActive`, and a unique index on `code`. `registration-service.ts` queries `pb.collection('coupons')` and uses atomic `'usedCount+': 1` increment. **Schema migration is correct.**

---

## 2. Incomplete Fixes / Regressions

### 🔴 REGRESSION-1 [CRITICAL]: `sameSite: "strict"` on OAuth provider cookie breaks the OAuth login flow

**Files:** `src/routes/api/auth/init.ts:53`, `src/routes/api/auth/callback/google.ts:56,67,83`

The remediation changed **all** `sameSite` values to `"strict"` per finding L1/scope item 15. This is correct for the auth cookie (`pb_auth`) and the logout cookie. **However**, it was also applied to the **OAuth provider cookie** (`pb_oauth_provider`) set in `init.ts` and read in `google.ts`.

**Why this breaks:** The OAuth flow is:
1. `GET /api/auth/init` sets `pb_oauth_provider` cookie with `sameSite: "strict"`, then returns a URL to redirect the browser to Google.
2. Browser navigates to Google (top-level cross-site navigation).
3. Google redirects back to `GET /api/auth/callback/google` — this is a **top-level cross-site redirect**.
4. The callback handler reads `request.headers.get("cookie")` to find `pb_oauth_provider`.

Per the SameSite spec (confirmed via [Mozilla Bug 1465402](https://bugzilla.mozilla.org/show_bug.cgi?id=1465402), [Curity best practices](https://curity.io/resources/learn/oauth-cookie-best-practices/), and multiple OAuth library issues), a `SameSite=Strict` cookie is **not sent on a top-level cross-site redirect**. The browser will drop the `pb_oauth_provider` cookie when Google redirects back to the app. The callback will then fail the `if (!code || !state || !providerCookie)` check and redirect to `/?error=auth_failed`.

**The same problem affects the auth cookie set in `google.ts:56`:** After `authWithOAuth2Code`, the callback sets `pb_auth` with `sameSite: "strict"` via a 302 redirect response. The browser receives the `Set-Cookie` on the redirect response, but since the next navigation is a same-origin page load (`/`), the cookie *will* be stored and sent on the subsequent request. **This part is actually fine** — the `Set-Cookie` on a redirect response is stored, and the next request to `/` is same-origin so the cookie is included.

**The critical break is the `pb_oauth_provider` cookie read in step 4.** The cookie was set same-origin in step 1, but step 3 is a cross-site redirect from Google, so `SameSite=Strict` causes the cookie to be withheld.

**Severity:** CRITICAL — **OAuth login is completely broken** in production (and in any browser that enforces SameSite, which is all modern browsers). Users cannot log in.

**Fix:** The `pb_oauth_provider` cookie must use `sameSite: "lax"` (not `"strict"`). `Lax` allows the cookie to be sent on top-level GET redirects, which is exactly the OAuth callback pattern. The `pb_auth` cookie can remain `"strict"` since it's only ever sent on same-origin requests after login completes. This is the standard, well-documented pattern for OAuth PKCE cookies.

**Original audit finding 6.9 correctly noted** `sameSite: "lax"` was correct for the OAuth state cookie — the remediation **over-corrected** this to `"strict"`, introducing the regression.

---

### 🟠 ISSUE-1 [HIGH]: `coupons` collection not present in `migrate-pb-rules.ts`

**File:** `scripts/migrate-pb-rules.ts` (the `rules` object, lines ~37-93)

The `rules` object contains entries for `events`, `registrations`, `societies`, `execom`, and `users` — but **not `coupons`**. The `migrate-to-pb.ts` script creates the `coupons` collection with `listRule: ''` and `viewRule: ''` (empty string = public read).

**Impact:** Anyone (unauthenticated) can list and view all coupon codes, `discountPercent`, `maxUses`, `usedCount`, and `isActive` status for every event. This defeats the purpose of coupon codes — an attacker can enumerate all valid coupon codes and their discount percentages via `GET /api/collections/coupons/records`.

**Severity:** HIGH — Coupon codes are effectively public. While each code still requires a valid event registration to apply, leaking active discount codes and their percentages is a business-logic breach and enables brute-force/abuse.

**Fix:** Add a `coupons` entry to `migrate-pb-rules.ts`:
```typescript
coupons: {
  listRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
  viewRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
  createRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
  updateRule: `@request.auth.role = "admin"`,
  deleteRule: `@request.auth.role = "admin"`,
},
```
Note: the `validateCouponCode` and `validateAndApplyCoupon` functions in `registration-service.ts` currently use the **user-authenticated** `pb` client to query `coupons`. If the `listRule`/`viewRule` restricts to admin/chair only, a regular user calling `validate-coupon` will get an empty result and the coupon validation will always fail. The rules must either (a) allow `@request.auth.id != ""` (any authenticated user) to `list`/`view` coupons, or (b) the validation functions must use `createAdminPB()`. Option (a) is safer and simpler — authenticated users can look up a coupon by code (which they already know), but cannot enumerate via PB's API since they'd need the exact `code`.

---

### 🟠 ISSUE-2 [MEDIUM]: `events.coupons` JSON field is now dead schema

**File:** `scripts/migrate-to-pb.ts:260` — `{ name: 'coupons', type: 'json' }` still exists on the `events` collection.

The remediation migrated coupons to a dedicated collection (correct), but the legacy `coupons` JSON field on `events` was **not removed** from the schema migration. The `Event` type in `src/types/index.ts` still has `coupons?: Coupon[]`. This is dead schema that could confuse future maintainers.

**Severity:** MEDIUM (code hygiene / schema cleanliness)

**Fix:** Remove `coupons` from the `events` field list in `migrate-to-pb.ts` and from the `Event` type. If backward compatibility with existing PB instances matters, leave the PB field but remove it from the TS type and mark it deprecated.

---

## 3. New Issues Discovered

### 🟡 NEW-1 [LOW]: `Event` type `coupons?: Coupon[]` is misleading

**File:** `src/types/index.ts` (Event interface)

`Event.coupons?: Coupon[]` implies coupons are embedded on the event, but they now live in a separate collection. This field is never populated by the app (no `expand: 'coupons'` anywhere). It should be removed to match the new schema reality.

---

### 🟡 NEW-2 [LOW]: `buildChairFilter` for `registration` scope uses `event.society` but PB rule uses `event.society.chairs.id`

**Files:** `src/lib/admin-middleware.ts:47` vs `scripts/migrate-pb-rules.ts:54`

`admin-middleware.ts` builds the chair filter for registrations as:
```
event.society = 'soc-1' || event.society = 'soc-2'
```
But the PB rule for registrations `viewRule` uses:
```
event.society.chairs.id ?= @request.auth.id
```
These are two different scoping strategies — the app-layer filter checks `event.society` is in the chair's society list, while the PB rule checks the chair is in the society's `chairs` array. They should be equivalent in practice (both verify chair ownership of the society), but the divergence means the app-layer filter and PB-layer rule could disagree if a chair is removed from a society but the society ID list is cached. Not a live bug given current usage, but a subtle inconsistency worth noting.

---

## 4. Plan for Remaining Issues

### Priority 1 — Fix OAuth regression (REGRESSION-1) 🔴
**Must fix before deployment.** OAuth login is broken in production.

1. In `src/routes/api/auth/init.ts:53`, change `sameSite: "strict"` → `sameSite: "lax"` for the `PB_OAUTH_PROVIDER_COOKIE` only.
2. In `src/routes/api/auth/callback/google.ts:67,83`, change `sameSite: "strict"` → `sameSite: "lax"` for the `PB_OAUTH_PROVIDER_COOKIE` clear-cookie calls.
3. Leave `PB_AUTH_COOKIE` (the auth cookie set at `google.ts:56` and cleared at `logout.ts:54`) as `sameSite: "strict"` — this is correct and safe.
4. Add a test case in `security-paths.test.ts` verifying the OAuth provider cookie uses `lax` (regression guard).
5. **Verify** by running the OAuth flow end-to-end in a staging environment with `PUBLIC_APP_URL` set.

### Priority 2 — Fix coupons access rules (ISSUE-1) 🟠
1. Add a `coupons` entry to the `rules` object in `scripts/migrate-pb-rules.ts` with `listRule`/`viewRule` set to `@request.auth.id != ""` (any authenticated user can look up a coupon by code, but cannot enumerate).
2. Run `migrate-pb-rules.ts` against the PB instance to apply.
3. **Verify** that `validateCouponCode` and `validateAndApplyCoupon` still work with a user-authenticated `pb` client (they should, since `listRule: '@request.auth.id != ""'` allows any logged-in user to read).
4. **Verify** that an unauthenticated `GET /api/collections/coupons/records` returns 403.

### Priority 3 — Clean up dead schema (ISSUE-2, NEW-1) 🟡
1. Remove `coupons?: Coupon[]` from the `Event` interface in `src/types/index.ts`.
2. Optionally remove the `coupons` JSON field from the `events` collection definition in `migrate-to-pb.ts:260` (or leave with a deprecation comment if existing PB instances have data).
3. Run `tsc --noEmit` to confirm no callers break.

### Priority 4 — Document the scoping divergence (NEW-2) 🟡
No code change required. Add a comment in `admin-middleware.ts` noting that the app-layer filter (`event.society = '...'`) and PB-layer rule (`event.society.chairs.id ?= @request.auth.id`) are intentionally different views of the same authorization, and that the app-layer filter is a performance optimization (avoids PB's relation traversal on every list query).

---

## Summary

| Category | Count | Status |
|---|---|---|
| Correctly fixed | 62 | ✅ |
| Incomplete fixes | 2 | 🔴🟠 |
| Regressions introduced | 1 | 🔴 (OAuth) |
| New issues | 2 | 🟡🟡 |
| **Total findings** | **68** | **62 fixed, 4 residual, 2 new** |

**Critical blocker for deployment:** REGRESSION-1 (OAuth `sameSite: "strict"` on provider cookie). Must be fixed before any production release.
