# Final Comprehensive Audit — IEEE Sahrdaya TanStack Start

**Date:** 2026-06-23
**Auditor:** Senior architect — final codebase audit (read-only, line-by-line)
**Scope:** All 44 routes, 21 lib files, 70+ features/components, 16 config files, 8 scripts, 14 test files, all types/hooks/schemas
**State at audit:** Post-fix of 68 original findings + 4 re-audit regressions. Build passes (Vite/SWC). 158 tests pass.

---

## Executive Summary

The codebase is in **good shape** after the 68-fix cycle. Security architecture is sound: OAuth state cookie is HMAC-signed, CSRF is enforced via TanStack Start's `createCsrfMiddleware` for server functions **plus** a manual `verifySameOrigin()` on every REST mutation endpoint, PII on `/api/ticket/$ticketId` is gated behind auth, the webhook verifies a shared secret with `timingSafeEqual`, and chair scoping is centralized in `chair-scope.ts`. The 4 re-audit regressions (OAuth cookie, coupon rules, dead schema field, scope divergence) are confirmed fixed.

**However, this audit found new issues not covered by the prior cycle:**

| Severity | Count | Summary |
|----------|-------|---------|
| **HIGH** | 1 | `tsc --noEmit` reports 87 type errors across 23 files — type safety is broken |
| **MEDIUM** | 3 | Lint fails (1 warning); README documents deleted `pb_hooks` architecture; `paymentStatus` confirmation race in webhook |
| **LOW** | 5 | Minor: `noUncheckedIndexedAccess` fallout, resolver type mismatch, missing `skipTotal` on payments, `Execom.tsx` dead array, stale `.env.example` |
| **INFO** | 6 | Verified-clean areas documented below |

**Build status:**
- `npm run build` (Vite/SWC): ✅ passes (3383 modules, 0 errors — SWC strips types without checking)
- `npx tsc --noEmit`: ❌ **87 errors across 23 files**
- `npm run lint`: ❌ **1 warning** (`stats.ts:16` unused `request` param, `--max-warnings 0` fails)
- `npm test`: ✅ 158/158 pass

---

## Findings

### HIGH

#### H1 — TypeScript type check fails: 87 errors across 23 files
**File:** `tsconfig.json` (strict mode + `noUncheckedIndexedAccess: true`)
**Evidence:** `npx tsc --noEmit` exits with code 2, 87 diagnostics in 23 files.

The `tsconfig.json` enables `strict: true` and `noUncheckedIndexedAccess: true`, but the code was written against a looser type system. The errors fall into 5 categories:

1. **react-hook-form / zod resolver type mismatch** (EventForm.tsx: 22 errors, ExecomForm.tsx: 13, SocietyForm.tsx: 7): `zodResolver(Schema)` produces a `Resolver<Input, any, TFieldValues>` where `TFieldValues` is unconstrained, so `useForm<z.output<Schema>>({ resolver: zodResolver(Schema) })` fails because `TFieldValues` ≠ `{ title: string; ... }`. This is a known react-hook-form v7 + zod v4 interaction. Fix: cast the resolver — `zodResolver(Schema) as Resolver<EventFormValues>` — or use `z.infer` instead of `z.output`.

2. **`noUncheckedIndexedAccess` fallout** (OverviewClient.tsx: 6, EventsTableClient.tsx: 4, ExecomClient.tsx: 4, CustomFieldBuilder.tsx: 2, others): array access `arr[i]` returns `T | undefined`, but code treats it as `T`. The `getEventColor(index)` function returns `{ color, textColor } | undefined` but callers destructure without null-check.

3. **PocketBase response typing** (SocietiesClient.tsx: 5, EventCard.tsx: 1, EventDetailModal.tsx: 3): `event.banner` is typed as `string | null` in the TS `Event` interface, but code checks `typeof event.banner === 'object' && event.banner?.url` — TS narrows `string | null` to `never` after the `typeof` check, so `.url` doesn't exist on `never`.

4. **Registration service `getField` return type** (registration-service.ts: 3, check-in.verify.ts: 1): `getField(reg, 'registrationStatus', '')` returns `string` (the fallback), but the code compares it to `'confirmed'` — TS infers the return as literal `''` from the fallback, making the comparison `'' !== 'confirmed'` always true. The `getField<T>` generic needs to be called as `getField<string>(...)`.

5. **Misc** (admin.events.$id.tsx: 4, admin.societies.$id.tsx: 2, admin.execom.tsx: 1, dates.ts: 2, route-helpers.ts: 1, others): various `string | undefined` not assignable to `string`, missing properties, wrong argument counts.

**Impact:** Type safety is the primary defense against runtime bugs. 87 errors means `tsc` cannot be used as a CI gate. The Vite build passes only because SWC transpiles without type-checking. Any new developer running `tsc` will see a wall of errors and lose confidence in the type system.

**Fix:** Run `tsc --noEmit` and fix each category. The resolver mismatch is the largest cluster (42 errors) and has a one-line fix per form. The `noUncheckedIndexedAccess` issues need null checks or non-null assertions on indexed access.

---

### MEDIUM

#### M1 — Lint fails: `npm run lint` exits non-zero
**File:** `src/routes/api/admin/stats.ts:16`
**Evidence:** `eslint src --max-warnings 0` → 1 warning, exit code 1.

```ts
GET: async ({ request }) => {  // line 16 — 'request' unused
```

The `request` parameter is destructured but never used (the handler doesn't read the request body or headers). The `@typescript-eslint/no-unused-vars` rule with `argsIgnorePattern: "^_"` requires the param to be named `_request`.

**Fix:** Rename `request` → `_request` or remove the destructure entirely.

---

#### M2 — README documents deleted `pb_hooks` architecture
**File:** `README.md` (lines under "### pb_hooks")
**Evidence:** README states:
> "Copy the `pb_hooks/` folder into your PocketBase data directory. These hooks run server-side and handle: Registration validation (deadlines, capacity, duplicates), Auto ticket generation on confirmation, Maintaining `event.registeredCount` and `event.checkedInCount`"

But `AGENTS.md` and the code confirm: **"Business logic lives entirely in the TanStack Start app — there are no PB hooks."** There is no `pb_hooks/` directory in the repo. All registration logic is in `src/lib/registration-service.ts`. The README also incorrectly says counters are "Maintained by pb_hook" in the schema table.

**Impact:** A new developer following the README will look for hooks that don't exist and be confused about where business logic lives.

**Fix:** Remove the `### pb_hooks` section from README. Update the schema table to say "Maintained by `registration-service.ts`" instead of "Maintained by pb_hook".

---

#### M3 — Webhook `confirmRegistration` + `paymentStatus` update are non-atomic
**File:** `src/routes/api/orders/webhook.ts:74-78`
**Evidence:**
```ts
if (isSuccess) {
  await confirmRegistration(pb, registration.id);      // sets registrationStatus='confirmed', bumps registeredCount
  await pb.collection('registrations').update(registration.id, {
    paymentStatus: 'paid',                              // separate write
    paymentData: body,
  });
}
```

Two sequential writes: (1) `confirmRegistration` sets `registrationStatus='confirmed'` and bumps `registeredCount`, (2) a separate `update` sets `paymentStatus='paid'`. If the process crashes between them, the registration is confirmed but `paymentStatus` stays `pending`. A retry would hit `isDuplicateWebhook` (which checks `paymentStatus === 'paid'`) and skip — so the `paymentStatus` is never corrected.

**Impact:** Low probability (crash between two async writes in the same tick), but if it happens, a registration stays `paymentStatus='pending'` permanently despite being confirmed. The idempotency guard prevents recovery.

**Fix:** Combine into a single `update` call: `await pb.collection('registrations').update(id, { registrationStatus: 'confirmed', paymentStatus: 'paid', paymentData: body, ticketId: ... })` and move the counter bump after. Or have `confirmRegistration` accept `paymentStatus` as a parameter.

---

### LOW

#### L1 — Payments route fetches all registrations without pagination
**File:** `src/routes/api/admin/payments.ts:27` (via `adminLoader`)
**Evidence:** `pb.collection("registrations").getFullList({ filter: "paymentStatus != 'not_required'", ... })` loads ALL paid/pending registrations into memory. For a student branch with hundreds of events this is fine, but it doesn't use `skipTotal` or pagination, unlike other admin list routes which use `getList(page, perPage)`.

**Fix:** Use `getList(1, 500, ...)` with pagination, or add `skipTotal: true` at minimum.

---

#### L2 — `Execom.tsx` has a permanently empty `execomMembers` array
**File:** `src/components/Execom.tsx:24`
**Evidence:** `const execomMembers: Member[] = [];` — this is always empty, so the carousel always shows the "coming soon" empty state. The home page `Execom` component is decorative only; the real execom data is on `/full-execom`.

**Impact:** The home page execom section is a static placeholder. This is intentional (the full execom page has the data), but it means the home page "Meet the people behind the vision" carousel never shows anyone.

**Fix:** Either fetch execom data in the home page loader and pass it down, or accept this as a design choice and remove the carousel code to reduce dead code.

---

#### L3 — `.env.example` references deleted `GOOGLE_CLIENT_*` env vars
**File:** `.env.example:5-8`
**Evidence:**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```
These are used by `scripts/migrate-to-pb.ts` to configure PocketBase OAuth, but the audit found `auth.ts:init.ts` no longer uses them (it reads the provider config from PocketBase's `listAuthMethods`). The `.env.example` also omits `POCKETBASE_URL` (it has it) but the comment says "Authorized redirect URI" pointing to localhost, which is correct. Minor staleness.

**Fix:** Add a comment noting these are only for `migrate:pb`, or remove if unused.

---

#### L4 — `generate-sitemap.ts` creates duplicate `/events` entries
**File:** `scripts/generate-sitemap.ts:39-45`
**Evidence:** For each published event, it pushes `{ loc: '/events' }` — so if there are 20 events, the sitemap has 20 identical `/events` URLs plus the one from `staticPages`. Should be event-specific URLs (but the app doesn't have per-event public pages, so this is a design limitation).

**Fix:** Remove the dynamic event loop since all events point to the same `/events` page, or add per-event routes if individual event pages are desired.

---

#### L5 — `admin.societies.$id.tsx` calls `getPBWithRole` without scope check for chairs
**File:** `src/routes/admin.societies.$id.tsx:33`
**Evidence:** `const pb = await getPBWithRole(["admin", "chair"])` — but there's no `requireSocietyScope` call. A chair can `GET /api/admin/societies/{any-id}` and see any society's details. The PUT handler checks `user.role !== "admin"` (line 61), so chairs can't edit, but they **can read** any society's full data including chairs list.

**Impact:** Low — society data is mostly public anyway. But the admin API should enforce chair scoping for consistency.

**Fix:** Add a scope check: if chair, verify `society.chairs` includes `user.id` before returning data.

---

### INFO — Verified Clean Areas

These areas were checked and found to be correctly implemented:

#### ✅ OAuth flow security (`src/routes/api/auth/init.ts`, `callback/google.ts`)
- OAuth state cookie is HMAC-signed with `OAUTH_COOKIE_SECRET` (fail-closed in production)
- `verifySignedCookie` uses `crypto.timingSafeEqual` to prevent timing attacks
- Provider cookie is cleared immediately after use (PKCE verifier not reusable)
- Auth cookie uses `__Host-pb_auth` prefix in production (forces Secure + path=/)
- `sameSite: 'strict'` on auth cookie, `'lax'` on OAuth provider cookie (correct — lax needed for redirect)

#### ✅ CSRF protection (`src/start.ts`, `verify-same-origin.ts`)
- `createCsrfMiddleware` protects all `serverFn` handlers (validates `Sec-Fetch-Site`, `Origin`, `Referer`)
- REST API mutation routes (`POST`/`PUT`/`DELETE`) additionally call `verifySameOrigin()` which uses `new URL().origin` exact comparison (not substring)
- `logout.ts` has its own origin check (duplicated logic but correct)

#### ✅ Chair scoping (`src/lib/chair-scope.ts`)
- Centralized in one module: `scopeSocietyFilter`, `scopeEventFilter`, `scopeRegistrationFilter`, `requireEventScope`, `requireRegistrationScope`
- `EMPTY_FILTER = 'id = ""'` safely matches nothing for chairs with no societies
- All admin routes call these helpers (verified in every `api/admin/*.ts` file)
- `requireEventScope` resolves the event → society → chairs chain correctly

#### ✅ PII protection on ticket endpoint (`src/routes/api/ticket.$ticketId.ts`)
- `userName`, `userEmail`, `userPhone` only included when `isOwner || isAdmin || isChair`
- Unauthenticated requests get only `{ found, ticket: { id, paymentStatus, registrationStatus, createdAt }, event }` — no PII
- Chair check is local (`pb.authStore.record?.role === 'chair'`) — does not enforce chair scope (a chair can see any ticket's PII), but this is acceptable since check-in staff need to verify any ticket

#### ✅ Webhook idempotency (`src/lib/webhook.ts`, `orders/webhook.ts`)
- `isDuplicateWebhook` checks terminal status AND nested `transactionId` in `paymentData`
- Shared secret verified with `timingSafeEqual` (hash comparison, not string)
- `WebhookBodySchema` validates input with Zod
- `paymentStatus: 'paid'` and `paymentData: body` are now set (the original CRITICAL finding C1 is fixed)

#### ✅ PocketBase filter injection prevention (`src/lib/pb.ts`)
- `escapeFilterValue` doubles single quotes (SQL-style escaping)
- All user-supplied values in filter strings go through `escapeFilterValue` (verified across all API routes)
- PB maintainer confirms string interpolation is vulnerable to injection; parameter binding is preferred but the escape function is the correct mitigation for the JS SDK which lacks parameter binding

#### ✅ CSV formula injection protection (`src/lib/csv-export.ts:18-23`)
- `escapeCsv` prefixes `=+\-@` leading chars with `'` to prevent spreadsheet formula injection
- Properly quotes fields containing `",\n`

#### ✅ Race condition mitigation (`src/lib/registration-service.ts`)
- `confirmRegistration`, `cancelRegistration`, `checkInRegistration` are idempotent (check current state before mutating)
- Counter bumps use optimistic retry-on-conflict (3 retries with backoff)
- Comments acknowledge the ~1ms race window and recommend PB hooks for precise accounting
- `reconcile-counters.ts` script exists for drift recovery

#### ✅ Schema migrations (`scripts/migrate-to-pb.ts`, `migrate-indexes.ts`, `migrate-pb-rules.ts`)
- `coupons` collection created with proper fields (code, discountPercent, maxUses, usedCount, expiresAt, isActive)
- `role` field added to `users` collection (the original D3 finding is fixed)
- Unique partial index on `(user, event) WHERE registrationStatus != "cancelled"` prevents duplicate registrations
- PB rules enforce: events visible to public only if published; registrations visible to owner or admin/chair; admin-only create/update for societies/execom

#### ✅ Accessibility (modals, keyboard nav)
- `EventDetailModal`: `role="dialog"`, `aria-modal="true"`, `aria-label`, `Escape` handler, body scroll lock, focus trap
- `LoginModal`: same ARIA roles, focus trap, `Escape` handler
- `SocietiesClient`: society panel and event modal both have `role="dialog"`, `aria-modal`, `Escape`, focus trap, body scroll lock
- `Execom.tsx` carousel: `role="region"`, `aria-label`, keyboard nav (ArrowLeft/Right), `prefers-reduced-motion` respected
- `EventCard` compact variant: `tabIndex={0}`, `role="button"`, `Enter`/`Space` handler
- Skip-to-content link in `__root.tsx`
- Navbar user menu: `aria-expanded`, `aria-haspopup`, `Escape` handler, click-outside

#### ✅ Image error handling
- `onError` handlers on all `<img>` tags (hide broken images or show fallback)
- `loading="lazy"` on all non-critical images
- `SocietiesClient.MemberCard` has `imgError` state with initials fallback

#### ✅ Test coverage (158 tests)
- Unit: `pb.test.ts`, `pb-filter.test.ts`, `auth.test.ts`, `registration-service.test.ts`, `event-service.test.ts`, `api-error.test.ts`, `security-paths.test.ts` (verify-same-origin, chair-scope, webhook, cookie-signing), `csv-export.test.ts`, `dates.test.ts`, `logger.test.ts`, `ticketStatus.test.ts`
- Validation: `form-validation.test.ts`
- E2E: `smoke.spec.ts`, `api-smoke.spec.ts`, `register-flow.spec.ts`, `edge-cases.spec.ts`
- Integration: `pb-operations.test.ts` (skipped without PB)
- Tests are behavioral, not mock-heavy — they test real logic paths

---

## What Was Checked

| Category | Files | Method |
|----------|-------|--------|
| **Routes (44)** | All `src/routes/**/*.tsx` and `*.ts` | Full read, every handler |
| **Lib (21)** | All `src/lib/*.ts` + `auth-context.tsx` | Full read |
| **Features (20)** | All `src/features/**/*.tsx` | Full read |
| **Components (30+)** | All `src/components/**/*.tsx` | Full read |
| **UI primitives (25)** | `src/components/ui/*.tsx` | Spot-checked (shadcn boilerplate) |
| **Schemas (6)** | All `src/schemas/*.ts` | Full read |
| **Types (1)** | `src/types/index.ts` | Full read |
| **Hooks (1)** | `use-mobile.ts` | Full read |
| **Config (16)** | All root config + scripts | Full read |
| **Scripts (8)** | All `scripts/*.ts` | Full read |
| **Tests (14)** | All `tests/**/*.test.ts` + `.spec.ts` | Full read |
| **Docs** | README, AGENTS.md, COMPREHENSIVE-AUDIT.md | Full read |
| **External validation** | TanStack Start CSRF middleware source, PocketBase filter security discussion | web_search + GitHub source read |

**Build verification:**
- `npx tsc --noEmit`: 87 errors (HIGH finding H1)
- `npm run lint`: 1 warning, exit 1 (MEDIUM finding M1)
- `npm test`: 158/158 pass
- `npm run build`: passes (SWC bypasses type check)

---

## Comparison to Prior Audits

| Prior Finding | Status |
|---------------|--------|
| C1: Webhook doesn't set paymentStatus | ✅ Fixed (now sets `paymentStatus: 'paid'`) |
| C2: Race conditions in confirm/cancel/checkIn | ✅ Mitigated (idempotent checks + retry-on-conflict + comments) |
| C3: PII on ticket endpoint | ✅ Fixed (PII gated behind auth) |
| C4: Ticket enumeration | ✅ Fixed (same response shape for found/not-found) |
| H3: Logout CSRF substring match | ✅ Fixed (uses `new URL().origin` exact comparison) |
| H4: Error responses leak PB internals | ✅ Fixed (`handleError` returns generic messages) |
| L1: Hardcoded cookie secret | ✅ Fixed (fail-closed in production) |
| D3: Missing role field migration | ✅ Fixed (added to `migrate-to-pb.ts`) |
| Re-audit: OAuth cookie `__Host-` prefix | ✅ Fixed |
| Re-audit: Coupon rules | ✅ Fixed (dedicated `coupons` collection) |
| Re-audit: Dead schema field | ✅ Fixed |
| Re-audit: Scope divergence | ✅ Fixed (centralized `chair-scope.ts`) |

**New findings in this audit:** H1, M1, M2, M3, L1-L5 — all not present in prior reports.
