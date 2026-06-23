# Architectural Review & Remediation Plan — IEEE Sahrdaya Student Branch

**Author:** Senior Architect (PlannerAudit)  
**Date:** 2026-06-23  
**Codebase:** https://github.com/Phloraxx/IEEE-sahrdayaCET  
**Stack:** TanStack Start 1.x + React 19 + TypeScript 5.8 + Tailwind CSS 4 + PocketBase 0.39.1 + Framer Motion

---

## 1. Executive Opinion

This is a **remarkably well-architected student project** that has clearly been through multiple audit-and-fix cycles. The codebase shows real craftsmanship: type-safe in most places, good test coverage for a college project, thoughtful security patterns (HMAC-signed OAuth state, admin PB elevation, CSRF origin checks), and clean separation in the service layer around `registration-service.ts`. The dual API pattern (server functions for reads, REST for mutations) is defensible — it's not the over-engineering the prior audit claims.

**Where the prior audit went wrong:** Many of its "Critical" and "High" findings were already fixed or were incorrect. The audit missed several material issues I found in 30 minutes of reading. This suggests the audit was thorough but the recheck was incomplete, or the delta between versions was large.

**Biggest concerns (real):**
1. Dashboard stats are hardcoded to 0 — layout renders but shows meaningless data
2. `buildChairFilter` bypasses `escapeFilterValue` (injection inconsistency)
3. No CI/CD, no pre-commit type checking, no lint enforcement in PR flow
4. Zero E2E tests for the critical registration → payment → check-in flow
5. Monolith feature files (700-900 lines) hurt maintainability
6. Fails-open auth in `adminLoader`

**What's genuinely fine and doesn't need rewrites:**
- TanStack Start for this use case (correct choice — see §2)
- Dual API layer (pragmatic, not debt)
- The `bumpEventCounter` retry logic (fine for student-scale)
- Most of the "over-engineering" findings are either fixed or reasonable

---

## 2. Architecture: Framework Choice

### TanStack Start vs Alternatives

| Criterion | TanStack Start | Next.js | Remix | SPA (Vite-only) |
|-----------|---------------|---------|-------|-----------------|
| SSR | Native (React Streaming) | Native | Native | None |
| Auth/RBAC | Server functions + cookies | Middleware | Loader `context` | Proxy API |
| File-based routes | ✓ Dot-delimited | ✓ App Router | ✓ Flat | Manual |
| Bundle size | Moderate | Heavy | Light | Lightest |
| Learning curve | Steep (new) | Moderate | Moderate | Low |
| Ecosystem maturity | Low (pre-1.0ish) | Very high | High | N/A |
| DB integration | Manual PB | Prisma/Drizzle | native | N/A |
| Student-friendly | ✗ (poor docs, churn) | ✓ | ✓ | ✓✓ |

**Verdict:** TanStack Start is **not the wrong choice** for a production app, but it's a **riskier choice** for a student project. The team has managed it well given the framework's early stage. The real cost is the tight coupling: `createServerFn`, `getRequestHeader`, TanStack Router's loader pattern, and `@tanstack/react-query` permeate every file. Porting to another framework would be expensive.

**However** — since it works and the team is productive, I would NOT recommend a rewrite. The opportunity cost is too high for a student branch. Double down on finishing features, not porting frameworks.

### Dual API Pattern: createServerFn + REST

The existing audit flags this as "biggest architectural debt." I disagree.

```
Reads (admin):   createServerFn → adminLoader → PB getList
Mutations:       REST route (api/admin/events/POST) → authenticateAdmin → PB update
Reads (public):  TanStack Router loader → createPB → PB getList
Mutations:       REST route (api/registrations/POST) → requireAuth → createRegistration
```

This is the **TanStack Start recommended pattern**: server functions for data loading, API routes for mutations. The slight inconsistency (admin reads use server functions, admin mutations use REST) is cosmetic, not structural. The auth helpers (`adminLoader` vs `authenticateAdmin`) differ but both enforce the same policy. This is fine.

**What's actually wasteful**: `adminLoader` duplicates cookie extraction, PB creation, and role check in every admin server function. It's already extracted to a shared wrapper — that's good. The remaining boilerplate in each route is 5 lines, which is acceptable.

---

## 3. Findings

### CRITICAL (0 remaining)

All original Criticals have been addressed. The webhook sets `paymentStatus`, the ticket route requires auth, race conditions have idempotency guards, and the `role` migration exists.

### HIGH (3)

#### H1: Dashboard stats hardcoded to zero

**File:** `src/routes/admin.index.tsx:105-108`  
**Severity:** High (functional bug, not security)  
**Evidence:**
```typescript
const stats: DashboardStats = {
  events: { total: 0, upcoming: upcomingRes.totalItems, live: eventsLiveCount },
  registrations: { total: 0, confirmed: 0, pending: 0, today: 0 },
  societies: { active: 0, total: 0 },
};
```
All `total`, `confirmed`, `pending`, `today`, `active` are hardcoded to 0. The type promises them, the frontend lays out slots for them, but they're always zero. This is dead UI — the dashboard shows "0 events total", "0 registrations total", "0 societies."

**Impact:** Admin users see empty/misleading stats despite having real data.

**Fix:** Populate from queries — `total` from `getList(1, 1, { fields: 'id', count: true })` or a dedicated count endpoint.

---

#### H2: Chair filter injection bypass in `buildChairFilter`

**File:** `src/lib/admin-middleware.ts:42-46`  
**Severity:** High  
**Evidence:**
```typescript
case 'event':
  return societyIds.map(id => `society = '${id}'`).join(' || ')   // NO escapeFilterValue
```
Compare with `src/lib/chair-scope.ts:23-28` which correctly uses:
```typescript
return ids.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
```

The `admin-middleware.ts` version interpolates society IDs directly into PB filter strings without `escapeFilterValue`. While society IDs come from PB queries (UUIDs with no quotes), this violates defense-in-depth. If a `society` record were ever compromised to have a crafted ID, this becomes filter injection.

**Impact:** Low in practice (UUIDs can't contain single quotes), but sets a dangerous pattern. When this function is extended for other filterable fields that DO accept user input, the author will copy the raw interpolation pattern.

**Fix:** Use `escapeFilterValue(id)` in `buildChairFilter`, same as `chair-scope.ts`.

---

#### H3: Fails-open auth in `adminLoader`

**File:** `src/lib/admin-loader.ts:61-71`  
**Severity:** High  
**Evidence:**
```typescript
export async function adminLoader<T>(fn, empty: T, opts): Promise<T> {
  try {
    const cookie = getRequestHeader("cookie") || "";
    const pb = createPB(cookie);
    await requireRole(roles, pb);
    return await fn(pb);
  } catch (e) {
    logError(opts.context, e);
    return empty; // ← silently returns empty data on ANY error
  }
}
```
Auth errors (401/403), PB connection failures, and code bugs all result in the same silent empty fallback. The admin routes render empty tables with no error message.

**Impact:** Confusing UX — an admin whose session expired sees "0 events" instead of a login prompt. Masked bugs in admin loaders.

**Fix:** Only catch specific non-auth errors, or re-throw AuthError so the error boundary can redirect. Use a hybrid approach: return empty for PB errors but rethrow for AuthError.

---

### MEDIUM (8)

#### M1: Registration PB `createRule` allows arbitrary `user` field

**File:** `scripts/migrate-to-pb.ts:303`  
**Severity:** Medium  
**Evidence:**
```json
"createRule": "@request.auth.id != \"\""
```
The rule only checks the user is authenticated — it doesn't validate `user = @request.auth.id`. The server-side code (`src/routes/api/registrations.ts:105`) correctly passes `user.id`, so in practice this is safe. But without the PB-level constraint, a direct PB API call could create registrations under any user ID.

**Impact:** Low (server-side prevents it), but a defense-in-depth gap that could matter if `createAdminPB()` is ever used to create registrations without the service layer.

**Fix:** Change to `createRule: '@request.auth.id != "" && user = @request.auth.id'`.

---

#### M2: No CI/CD pipeline

**Files:** `.github/workflows/` — directory does not exist  
**Severity:** Medium  
**Evidence:** No CI/CD configuration. No automated type checking, linting, or test execution on push/PR.

**Impact:** Every deploy is a manual risk. Type errors that pass local `npm run build` (possible with different versions) silently reach production. No enforcement of `npm test` before merge.

**Fix:** Add GitHub Actions workflow for `npm run build` + `npm test` + `npm run lint` on every PR and push to main.

---

#### M3: `buildFileUrl` ignores failed file lookups silently

**File:** `src/lib/pb.ts:36-41`  
**Severity:** Medium  
**Evidence:**
```typescript
export function buildFileUrl(collection, recordId, filename): string {
  if (!url || !recordId || !filename) return ''
  return `${url}/api/files/${collection}/${recordId}/${filename}`
}
```
Returns empty string for missing data but doesn't warn. The component receives an empty `bannerUrl` or `logoUrl` — most components handle this gracefully (conditional rendering), but several don't have `onError` handlers on `<img>` tags.

**Impact:** Broken images silently showing alt text or broken icon, depending on the component.

**Fix:** Add logger warning when inputs are empty, and audit all `<img>` tags for `onError` fallbacks.

---

#### M4: Zero E2E tests for the registration → payment → check-in flow

**Files:** `tests/e2e/register-flow.spec.ts`, `tests/e2e/smoke.spec.ts`, `tests/e2e/api-smoke.spec.ts`  
**Severity:** Medium  
**Evidence:** E2E tests exist but cover only smoke-level navigation and basic API responses. No test exercises the full registration flow with coupon validation, webhook callback, ticket generation, and QR check-in.

**Impact:** The most critical user-facing flow has no automated regression coverage. A refactor to `registration-service.ts` (358 lines) goes unchecked.

**Fix:** Add a Playwright test that creates an event, registers a user, simulates the webhook, views the ticket, and checks in.

---

#### M5: `ExecomClient` modal missing accessibility roles

**File:** `src/features/execom/ExecomClient.tsx:220-224`  
**Severity:** Medium  
**Evidence:** The member detail modal has `className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"` but lacks `role="dialog"`, `aria-modal="true"`, `aria-label`, Escape key handler, and focus trap. Compare with `SocietiesClient.tsx:508-512` which has all of these.

**Other a11y gaps:**
- `EventForm.tsx` dynamic field label linking potentially broken
- `AdminGuard` uses `navigate()` during render (antipattern per FullAudit4 A-1)
- No focus trap in any modal (including EventDetailModal and LoginModal)

**Impact:** Keyboard-only users cannot close or interact with the member detail modal. Screen readers won't announce it as a dialog.

**Fix:** Add `role="dialog"`, `aria-modal`, `aria-label`, Escape key handler, and a `useFocusTrap` hook (or implement with `tabIndex` loop).

---

#### M6: `hasMore` never populated in list routes

**Files:** All admin list API routes (e.g. `src/routes/api/admin/events.ts`, `src/routes/api/admin/users.ts`, etc.)  
**Severity:** Medium  
**Evidence:** List API responses return `page`, `perPage`, `total`, `totalPages` but no `hasMore` boolean. Some frontends implement their own derived check, others use `totalPages > page`.

**Impact:** Minor inconsistency — if the frontend ever paginates literally, it needs to know whether more pages exist. Currently some consumers use `totalPages > 1` which breaks when total = 0 (shows 1 empty page).

**Fix:** Add `hasMore: result.totalPages > result.page` to all paginated responses, or ensure frontend handles the 0-case.

---

#### M7: No server-side response caching

**Files:** All `src/routes/` and `src/routes/api/`  
**Severity:** Medium (performance)  
**Evidence:** No `Cache-Control` headers set on any GET response. Public pages (home, events, execom) that rarely change are re-fetched on every SSR request.

**Impact:** Unnecessary PocketBase load. Each SSR home page render makes 2 PB queries. At scale (100+ concurrent users) this adds latency.

**Fix:** Add `Cache-Control: public, max-age=300` to public page loaders and `s-maxage=60` for CDN-cacheable API routes.

---

#### M8: Docker healthcheck discrepancy

**File:** `Dockerfile:48` (healthcheck uses Node fetch), `docker-compose.yml:26` (healthcheck uses wget)  
**Severity:** Medium  
**Evidence:**
```
Dockerfile: CMD node -e "fetch('http://localhost:3000/')..."
docker-compose.yml: test: ["CMD", "wget", ...]
```
Two different healthchecks. The Dockerfile's `node -e "fetch(...)"` uses Node's native fetch (available in Node 22), but the docker-compose version overwrites it with `wget` (not installed in the `node:22-alpine` runner image — `wget` is NOT listed in the `apk add` anywhere).

**Impact:** If using docker-compose (the documented deployment method), the healthcheck silently fails — `wget` doesn't exist in the container, so the healthcheck always returns unhealthy. The service restarts in a loop.

**Fix:** Remove the docker-compose healthcheck override (let Dockerfile's define it), or install `wget` in the runner stage.

---

### LOW (7)

1. **`env.example` and `docker-compose.yml` don't match** — `PAYMENT_API_URL` differs (`nerdpixel.workers.dev` vs `pay.mulearnscet.in`). Source of confusion for new contributors.

2. **Homepage SSR loader has no error boundary** — `src/routes/index.tsx:79` silences ALL errors to empty arrays. A user sees blank sections instead of error states.

3. **`eslint-plugin-import` configured but import order inconsistent** — 30+ files with mixed group order. Config exists at `eslint.config.mjs` but isn't enforced consistently.

4. **README says "TanStack Start 1.x" — should be specific** — `package.json` shows `@tanstack/react-start: ^1.168.26`. Pin the major version.

5. **No `Content-Type` validation on mutation endpoints** — Every POST/PUT accepts `application/json` but never checks the header. Content-type sniffing is a security edge.

6. **`routeTree.gen.ts` in `as any` spam** — Generated file, but 44 `as any` casts mean the generated types don't align with actual signatures. Root cause is likely a TanStack Router type bug; monitor when upgrading.

7. **`src/lib/logger.ts` doesn't handle BigInt/Error serialization** — `JSON.stringify` fails on `BigInt` and `Error` objects. `logError` catches `err` objects but `JSON.stringify(err)` gives `{}`.

---

## 4. Issues the Existing Audit Got Wrong

This section corrects the COMPREHENSIVE-AUDIT.md. Many findings were already fixed before my review. The report's conclusion that "Original 11 CRITICAL + 49 HIGH findings are resolved" is accurate — the fixes were thorough. However, several findings were incorrect at the time of the audit:

| Audit Finding | Claim | Reality | Correction |
|--------------|-------|---------|------------|
| C1 (Critical) | Webhook doesn't set `paymentStatus` | Does set `paymentStatus: 'paid'` at webhook.ts:83 | Already fixed |
| C3 (Critical) | PII leak without auth | Checks `isAuthenticated` at ticket.ts:56 | Already fixed |
| H3 (High) | Logout CSRF uses `origin.startsWith` | Uses `new URL(origin).origin` exact compare | Already fixed |
| H6 (High) | No CSRF tokens on mutations | `verifySameOrigin` on all mutation routes | Already fixed |
| D1 (Critical) | Phantom fields `short_title`/`event_type` | Home query uses `id,title,description,date,banner` | Already fixed |
| D4 (Critical) | `whatsappLink` missing from Event | Present in `src/types/index.ts` | Already fixed |
| D3 (Critical) | Missing `role` migration | Present at migration.ts:419-428 | Already fixed |
| P1/P2 (High) | rAF loops waste CPU | CSS `animation: scroll-* 40s linear infinite` | Already fixed |
| OE1 (High) | 155-line DragCarousel rAF physics | `Execom.tsx` is 54 lines, carousel removed | Already fixed |
| F13 (High) | RegisterPage missing `aria-invalid` | Present on all fields | Already fixed |
| F16 (High) | No `prefers-reduced-motion` | Present in `globals.css:1051` | Already fixed |
| F18 (High) | No Escape handlers on modals | EventDetailModal and SocietiesClient have them | Already fixed |
| P8 (Medium) | `@base-ui/react` competing with radix | Not in package.json — never was? | Removed or never existed |
| P16 (Low) | `next-themes` unused | Not in package.json | Removed or never existed |
| P17 (Low) | `shadcn` in `dependencies` | In `devDependencies` | Comment was incorrect |

Additionally, the following cross-cutting findings are incorrect:
- FullAudit3 C2: "OAuth state not cryptographically bound to session" — **is bound** via HMAC-signed cookie storing `provider.state`, verified on callback
- FullAudit6: "Auth provider re-mounts on every navigation" — AuthProvider is at `__root.tsx` root level, does not remount
- FullAudit4 A-1: "AdminGuard navigate()-in-render" — this IS a real antipattern but it's a minor UX glitch (nothing breaks, just a redundant render)

## 5. Issues the Existing Audit MISSED

1. **Dashboard stats hardcoded to 0** — functional bug, the most impactful unfixed issue
2. **buildChairFilter bypasses escapeFilterValue** — security inconsistency
3. **No CI/CD pipeline** — zero automated gates
4. **Registration PB createRule too permissive** — defense-in-depth gap
5. **E2E coverage doesn't cover the core flow** — registration→payment→checkin untested
6. **Docker healthcheck conflict** — `wget` in docker-compose but not installed in image
7. **No Cache-Control headers** — unoptimized SSR
8. **`env.example` / `docker-compose.yml` mismatch** — confusing onboarding
9. **hasMore never returned from paginated APIs** — frontend boundary bug
10. **No Content-Type validation** — security edge
11. **logger.ts can't serialize Error/BigInt** — correctness gap

---

## 6. Remediation Plan

### Phase 0: Critical Bugfix (1 hour)
| Step | Task | Files |
|------|------|-------|
| 0.1 | Populate dashboard stats totals, confirmed, pending, today, societies | `src/routes/admin.index.tsx:105-108` |
| 0.2 | Fix buildChairFilter to use escapeFilterValue | `src/lib/admin-middleware.ts:42-46` |

### Phase 1: Security Hardening (2 hours)
| Step | Task | Files |
|------|------|-------|
| 1.1 | Change registration PB createRule to enforce `user = @request.auth.id` | `scripts/migrate-to-pb.ts:303` |
| 1.2 | Fix adminLoader to rethrow AuthError (not silently return empty) | `src/lib/admin-loader.ts:61-71` |
| 1.3 | Add Content-Type header validation to mutation handlers | All `api/admin/*.ts`, `api/registrations.ts` |
| 1.4 | Add `Cache-Control` to public SSR routes and API GET responses | `src/routes/index.tsx`, `events.tsx`, `full-execom.tsx`, admin API routes |

### Phase 2: A11y & UX (1.5 hours)
| Step | Task | Files |
|------|------|-------|
| 2.1 | Add dialog roles, Escape handler, focus trap to ExecomClient modal | `src/features/execom/ExecomClient.tsx:220-224` |
| 2.2 | Add focus trap to EventDetailModal and LoginModal | `src/components/events/EventDetailModal.tsx`, `src/components/LoginModal.tsx` |
| 2.3 | Fix AdminGuard to use useEffect for navigation (not render-time) | `src/components/admin/AdminGuard.tsx` |
| 2.4 | Add `onError` handlers to `<img>` tags missing them | Audit with `grep -rn '<img' src/ \| grep -v onError` |

### Phase 3: Testing & CI (2 hours)
| Step | Task | Files |
|------|------|-------|
| 3.1 | Create GitHub Actions workflow (build + test + lint on PR) | `.github/workflows/ci.yml` |
| 3.2 | Add E2E test for full registration → webhook → ticket → check-in flow | `tests/e2e/register-flow.spec.ts` |
| 3.3 | Add unit test for `buildChairFilter` escaping | `tests/unit/lib/admin-middleware.test.ts` |
| 3.4 | Fix Docker healthcheck (remove docker-compose override) | `docker-compose.yml:26-30` |

### Phase 4: Maintainability (3 hours)
| Step | Task | Files |
|------|------|-------|
| 4.1 | Add `hasMore` to all paginated admin API responses | All `src/routes/api/admin/*.ts` |
| 4.2 | Normalize `env.example` to match docker-compose | `.env.example:10` |
| 4.3 | Audit and fix inconsistent import order (or remove eslint-plugin-import config) | `eslint.config.mjs` + 30+ files |
| 4.4 | Fix logger BigInt/Error serialization | `src/lib/logger.ts` |
| 4.5 | Consider splitting ExecomClient (719 lines) into sections/filter + member list + modal | `src/features/execom/ExecomClient.tsx` |

### Phase 5: Performance & Polish (2 hours)
| Step | Task | Files |
|------|------|-------|
| 5.1 | Add `React.memo` to MemberCard if re-render storms persist | `src/features/execom/ExecomClient.tsx` |
| 5.2 | Add `preconnect` for PocketBase origin in root layout head | `src/routes/__root.tsx` |
| 5.3 | Audit unused lucide-react icon imports | `src/features/execom/ExecomClient.tsx` |
| 5.4 | Add `preload` for hero banner image on home page | `src/routes/index.tsx` head |

---

## 7. Summary

**Strengths:** Solid architecture, cleaned up from prior audits, good auth patterns, properly typed in most places, working tests, pragmatic use of TanStack Start features.

**Don't fix that aren't broken:** Dual API layer is fine. `bumpEventCounter` retry logic is fine. Monolith files are okay for a student project. Framework choice is defensible.

**Fix immediately:** Dashboard stats (functional bug). `buildChairFilter` escaping (security inconsistency). CI/CD pipeline (gating quality).

**Total remaining critical:** 0. **Total remaining high:** 3. **Total medium:** 8. **Total low:** 7.

This codebase is in genuinely good shape for a college student branch project. Focus on the stats bug, the filter injection gap, and CI/CD — everything else is polish or already tracked.
