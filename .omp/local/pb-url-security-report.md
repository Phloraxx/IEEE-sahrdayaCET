# PocketBase URL Exposure — Security Architecture Report

**Scope:** Keep the PocketBase server URL server-side only (never in the client JS bundle) while preserving TanStack Start isomorphic route-loader behavior during client-side navigation.

**Date:** 2026-06-29
**Stack:** TanStack Start v1.168.26 · React 19 · PocketBase 0.39.1 · Vite

---

## 1. Current Exposure Surface (exactly what is exposed, and where)

The PB URL leaks through **three distinct mechanisms**. All three must be closed; closing only one leaves the URL in the bundle.

### 1.1 Direct `import.meta.env.VITE_POCKETBASE_URL` reads in client components (PRIMARY leak)

These files run **in the browser** and read the public env var directly. Vite substitutes `import.meta.env.VITE_*` with the literal string at build time, so the URL is baked into the shipped JS chunk:

| File | Line | Code |
|---|---|---|
| `src/features/events/EventsPageClient.tsx` | 45 | `const pbUrl = import.meta.env.VITE_POCKETBASE_URL;` then `fetch(\`${pbUrl}/api/collections/events/records?...\`)` |
| `src/features/societies/SocietiesClient.tsx` | 169 | `const pbUrl = import.meta.env.VITE_POCKETBASE_URL;` then `fetch(\`${pbUrl}/api/collections/societies/records?...\`)` |

These are **client-side fallback fetches** triggered when the route loader returned an empty array (which happens on client-side navigation today because the isomorphic loader fails on the client — see 1.3). They fetch the PB REST API directly from the browser, exposing the URL **and** bypassing the app's own proxy/auth layer.

### 1.2 `getPBUrl()` in the shared `pb.ts` module

`src/lib/pb.ts:5-11`:

```ts
export function getPBUrl(): string {
  const url = import.meta.env.VITE_POCKETBASE_URL || process.env.POCKETBASE_URL
  if (!url) throw new Error('POCKETBASE_URL is not configured')
  return url
}
```

`pb.ts` is imported by **client components** (`EventsPageClient`, `SocietiesClient`, `SocietiesClient`'s `MemberCard` — all import `buildFileUrl` from `@/lib/pb`). Therefore the whole `pb.ts` module is part of the client bundle. Vite performs `import.meta.env.VITE_*` literal substitution **at transform time, before tree-shaking**, so the PB URL string is inlined into the `getPBUrl` function body even if `getPBUrl`/`createPB` are later dead-code-eliminated. Reliance on tree-shaking to scrub a secret is a known unsafe pattern (the TanStack execution-model docs explicitly warn: module-level `import.meta.env`/`process.env` reads of secrets are wrong).

### 1.3 Isomorphic route loaders call `createPB()` directly (FUNCTIONAL + LEAK risk)

TanStack Start loaders are **isomorphic** — they run on the server during SSR/hard-reload **and** in the browser during client-side navigation (confirmed by the [Execution Model guide](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model): *"Route loaders are ISOMORPHIC — they run on both server and client"*).

These four public route loaders call `createPB()` directly inside the loader body (not inside a `createServerFn`):

| File | Loader line | Behavior on client-side nav |
|---|---|---|
| `src/routes/events.tsx` | 69 `const pb = createPB();` | `process.env.POCKETBASE_URL` is `undefined` in browser → falls back to `VITE_POCKETBASE_URL` (leak) or throws |
| `src/routes/index.tsx` | 81 `const pb = createPB();` | same |
| `src/routes/societies.tsx` | ~96 `const pb = createPB();` (route loader) | same |
| `src/routes/register.$eventId.tsx` | 6 `const pb = createPB();` | same |

On a hard reload these run on the server and use `process.env.POCKETBASE_URL` (safe). On client-side navigation they run in the browser; today they "work" only because `getPBUrl()` falls back to the public `VITE_` var — which is precisely the leak. Remove `VITE_POCKETBASE_URL` without fixing the loaders and client-side nav breaks (loader throws → error boundary).

### 1.4 Build/deploy configuration that publishes the URL

| File | Lines | Issue |
|---|---|---|
| `.env.local` | 11 | `VITE_POCKETBASE_URL=http://ieee-pocketbase-8wt381-14074c-144-24-114-90.sslip.io` (public-by-convention var) |
| `Dockerfile` | 20, 38-39, 53 | `ARG VITE_POCKETBASE_URL` + `ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL` baked into the image so Vite inlines it at build |
| `.env.example` | — | Does **not** list `VITE_POCKETBASE_URL` (good) but also does not warn against adding it |

### 1.5 What is ALREADY safe (do not break these)

- **`src/routes/full-execom.tsx`** — the loader calls `fetchExecomData()`, a `createServerFn()`. On the server it runs directly; on the client it becomes an RPC call to the server. PB URL never leaves the server. ✅ **This is the reference pattern.**
- **`src/routes/societies.tsx`** — `fetchSocietyMembers` / `fetchSocietyEvents` are `createServerFn()` (used by the client on demand). ✅ (But the *route loader itself* in the same file is still a direct `createPB()` call — see 1.3.)
- **Admin routes** — `src/lib/admin-guard.ts` `checkAdminAccess` and the `adminLoader`/`createServerFn` pattern used by `admin.*.tsx` loaders already wrap PB access in server functions. ✅
- **All `src/routes/api/**` server routes** (`server.handlers`) — these run server-side only (server routes are not isomorphic). They use `createPB()` which reads `process.env` on the server. ✅ Examples already in place: `/api/events/$id`, `/api/society/$slug`, `/api/ticket/$ticketId`, `/api/files/$`, `/api/auth/*`.
- **`src/routes/api/auth/init.ts`** — reads `process.env.POCKETBASE_URL` directly inside a server-route handler (server-only). ✅
- **`src/features/blog/BlogClient` / `src/routes/blog.tsx`** — no loader; fetches via same-origin `/api` routes. ✅
- **`src/lib/auth-context.tsx`** — client auth checks call same-origin `/api/auth/me`. ✅

### 1.6 Summary of leak inventory

```
PRIMARY (baked into client bundle):
  - EventsPageClient.tsx:45      (direct VITE_ read + direct PB REST fetch)
  - SocietiesClient.tsx:169      (direct VITE_ read + direct PB REST fetch)
  - pb.ts:6  getPBUrl()          (VITE_ literal inlined at transform time)

SECONDARY (functional breakage on client nav once VITE_ removed):
  - events.tsx loader (createPB direct)
  - index.tsx loader   (createPB direct)
  - societies.tsx loader (createPB direct)
  - register.$eventId.tsx loader (createPB direct)

BUILD/DEPLOY:
  - .env.local, Dockerfile ARG/ENV VITE_POCKETBASE_URL
```

---

## 2. Evaluation of Each Candidate Approach

### Approach 1 — Wrap loader PB access in `createServerFn()` (RPC)

**Mechanism:** Move each loader's PB query into a `createServerFn().handler(...)`. The loader becomes `loader: () => fetchEventsData()`. On SSR the server fn runs in-process; on client nav TanStack replaces the implementation with an RPC stub that POSTs to the same origin — PB URL stays server-side.

**Pros**
- This is the **framework-blessed pattern**. The Execution Model guide's "Incorrect Loader Assumptions" anti-pattern is *exactly* this bug, and the prescribed fix is "Use server function for server-only operations." ([server-functions docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions): *"Call server functions from route loaders — Perfect for data fetching."*)
- Already proven in this codebase (`full-execom.tsx`, `fetchSocietyMembers`).
- Type-safe serialization across the network boundary (TanStack validates inputs/outputs).
- No extra HTTP hop on the server (in-process call during SSR).
- CSRF is already enforced for server fns via `createCsrfMiddleware` in `src/start.ts` (same-origin RPC).
- Lets you delete the `VITE_POCKETBASE_URL` fallback entirely.

**Cons**
- Every isomorphic loader needs a one-time refactor (4 loaders here).
- Server-fn output must be serializable (no `Map`, `Date` objects, PB `Record` instances) — already satisfied by the current mapping code, which returns plain objects.
- One network round-trip per client-side navigation (unavoidable for any approach that keeps PB off the client).

**Verdict:** ✅ **Recommended.**

### Approach 2 — Server routes (`/api/*` with `createFileRoute` `server.handlers`) as a proxy

**Mechanism:** Add public server routes (e.g. `/api/events`) and have loaders do `fetch('/api/events')`. Server routes are server-only, so `createPB()` inside them reads `process.env`. `fetch('/api/events')` is same-origin and works on both server and client.

**Pros**
- Server routes already exist for the on-demand client needs (`/api/events/$id`, `/api/society/$slug`). Reusing them is consistent.
- Pure HTTP — easy to cache with `Cache-Control` (already done on the existing routes).
- Decouples client from PB SDK entirely.

**Cons**
- The [server-routes docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) explicitly say: *"Server routes are meant for endpoints that need to be called from outside your Start app. If you only need to call server-side logic from within your app, use server functions."* Using them for internal loader data fights the framework's intent.
- **Double hop on the server**: during SSR the loader runs on the server and `fetch('/api/events')` makes an HTTP request *back to its own origin* — extra latency and a self-referential request that can deadlock on single-worker runtimes if not careful.
- Loses TanStack's automatic serialization/type-safety; you hand-roll JSON `Response.json()` and parse it back.
- More boilerplate (method handlers, error→status mapping) than a server fn.

**Verdict:** ⚠️ **Use for external/cross-origin or on-demand client fetches only** (already the case for `/api/events/$id` etc.), not as the loader data source.

### Approach 3 — `createServerOnlyFn()` for PB access

**Mechanism:** Wrap `getPBUrl`/`createPB` in `createServerOnlyFn`. Per the Execution Model docs, `createServerOnlyFn` "Throws error" if called from the client.

**Pros**
- Hard fence: if any future code accidentally calls `createPB()` from a client path, it crashes loudly instead of leaking.
- Documents intent — "this is server-only."

**Cons**
- It does **not** make client-side navigation work. A server-only fn called from an isomorphic loader *throws on the client* — you still need a server fn (Approach 1) to provide the RPC path. Server-only fns cannot be RPC'd.
- It's a **guardrail**, not a solution. Useful as a complement to Approach 1, not a replacement.

**Verdict:** ✅ **Use as a hardening layer alongside Approach 1** — make `getPBUrl`/`createPB` server-only so the build fails fast if anyone imports them into client code.

### Approach 4 — Remove `VITE_POCKETBASE_URL` entirely; use only `process.env.POCKETBASE_URL` + server fns

**Mechanism:** Delete the `VITE_` var from `.env.local`, `Dockerfile`, `docker-compose.yml`, and remove the `import.meta.env.VITE_POCKETBASE_URL` branch from `getPBUrl()`.

**Pros**
- Eliminates the *convention* that permits the leak. There is no public env var to accidentally read.
- Forces every PB access to go through server-side `process.env`, which is only available where Approach 1's server fns run.
- Smallest config surface.

**Cons**
- **Breaks client-side navigation on its own** — without Approach 1, the isomorphic loaders would throw on the client (no `VITE_` fallback). Must be done *together with* Approach 1, not instead of it.
- Also requires removing the two client-component direct fetches (1.1), or they silently no-op (the `if (!pbUrl) return;` guard already handles absence gracefully — but the data would never load).

**Verdict:** ✅ **Required companion to Approach 1.** This is the *security* half; Approach 1 is the *functionality* half. Neither is sufficient alone.

### Approach 5 — Configure TanStack Start SSR mode to force loaders server-side only

**Mechanism:** Some frameworks expose a "loaders always server" mode.

**Pros / Cons**
- TanStack Start's execution model is **isomorphic-by-design**; there is no documented toggle to force loaders server-side only. The framework's stated direction is to *use server functions* to express server-only intent, not to disable isomorphism.
- Relying on an undocumented/absent flag is fragile and version-coupled.
- Even if it existed, it would not remove the `import.meta.env.VITE_*` literals already inlined into client components (1.1, 1.2).

**Verdict:** ❌ **Reject.** Not a real lever in TanStack Start v1.168, and doesn't address the bundle-literal leaks.

---

## 3. Recommended Approach

**Adopt Approach 1 (server functions for all loader data) + Approach 4 (remove `VITE_POCKETBASE_URL`) + Approach 3 (server-only guard on `getPBUrl`/`createPB`).**

This mirrors the **already-working** `full-execom.tsx` pattern, follows the framework's own guidance for the exact anti-pattern present here, and removes every leak vector. Server routes (Approach 2) remain in their correct role — external/on-demand client endpoints — and are reused to replace the two client-component direct PB fetches.

### Design decisions

1. **Split `pb.ts` into client-safe + server-only halves** (per the server-functions "File Organization" guidance: `.server.ts` for server-only, plain `.ts` for client-safe).
   - `src/lib/pb.ts` keeps `buildFileUrl`, `escapeFilterValue` (client-safe; `buildFileUrl` returns `/api/files/...` same-origin paths — no PB URL).
   - `src/lib/pb.server.ts` holds `getPBUrl`, `createPB`, and the `pocketbase` import, guarded by `import '@tanstack/react-start/server-only'`. `getPBUrl` reads **only** `process.env.POCKETBASE_URL`.
2. **Server-fn wrappers per public loader**, colocated with their route (matching `full-execom.tsx`/`societies.tsx` convention) or in a `src/lib/queries/*.functions.ts` module. Keep it simple: colocate, since there are only four.
3. **Replace the two client-component direct PB fetches** with calls to the existing same-origin server routes (`/api/events/$id`-style) — or simply remove them, since the loader (now reliable on the client via RPC) makes the fallback unnecessary. Recommendation: remove the fallback `useEffect` and keep the loader as the single source; if a manual refetch is ever wanted, call the server fn from the component.
4. **Delete `VITE_POCKETBASE_URL`** from `.env.local`, `Dockerfile` (ARG/ENV), `docker-compose.yml`, and add an anti-pattern note to `.env.example`.
5. **Hydration**: server fns return plain serializable objects (already the case). The loader data shape is unchanged, so `useLoaderData()` hydration is unaffected — no `useHydrated` gymnastics needed.
6. **Caching**: keep the `Cache-Control` headers the loaders already set via `context.response.headers` during SSR. On client-side nav the RPC response is not browser-cached by default; TanStack Router caches the loader result in memory for the route instance, which is the desired UX. No change needed.
7. **Error handling**: server-fn errors are serialized to the client and surface via the route's `errorComponent` (already defined on every affected route). Keep the existing try/catch that returns safe-empty only where graceful degradation is intended (home page), but **log** the error so PB outages aren't fully silent (the architecture review flagged silent swallowing).

---

## 4. Exact File Changes

### 4.1 NEW `src/lib/pb.server.ts` (server-only client factory)

```ts
import 'pocketbase'
import PocketBase from 'pocketbase'
import '@tanstack/react-start/server-only' // build-time fence: import fails in client bundle
import { PB_AUTH_COOKIE } from './constants'
import { logError } from './logger'

/**
 * Server-only. Reads the PB URL from the server environment.
 * Throws at build/import time if this module is pulled into a client bundle.
 */
export function getPBUrl(): string {
  const url = process.env.POCKETBASE_URL
  if (!url) {
    throw new Error('POCKETBASE_URL is not configured')
  }
  return url
}

export function createPB(cookieString?: string) {
  const pb = new PocketBase(getPBUrl())
  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, PB_AUTH_COOKIE)
  }
  return pb
}
```

> `import '@tanstack/react-start/server-only'` is the framework-provided import-protection side-effect (Execution Model guide: "achieve the same effect with a side-effect import"). Vite errors if a client chunk tries to bundle this file.

### 4.2 `src/lib/pb.ts` — strip server-only code, keep client-safe helpers

```ts
import { logError } from './logger'

export function buildFileUrl(collection: string, recordId: string, filename: string): string {
  if (!recordId || !filename) {
    logError('buildFileUrl', 'Missing recordId or filename', { collection, recordId, filename })
    return ''
  }
  if (filename.startsWith('http')) {
    try {
      const url = new URL(filename)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
      return filename
    } catch { return '' }
  }
  return `/api/files/${collection}/${recordId}/${filename}`
}

export function escapeFilterValue(value: string | number | boolean): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${value.replace(/\0/g, '').replace(/'/g, "''")}'`
}

// Re-export so existing `import { createPB } from '@/lib/pb'` keeps working
// during migration. REMOVE this re-export once all call-sites point at pb.server.
export { createPB, getPBUrl } from './pb.server'
```

> The re-export is a **temporary migration bridge only**. Because `pb.server.ts` carries the `server-only` fence, any client file that imports `createPB` from `@/lib/pb` will fail the build — which is exactly the safety net we want. The final step (4.8) deletes the re-export so `pb.ts` contains zero server code.

### 4.3 Update every server-side `createPB` import to `@/lib/pb.server`

Mechanical change across all files that currently `import { createPB } from "@/lib/pb"` **and run on the server** (server routes, admin guard, admin middleware, the new server fns). Files (from the grep inventory):

```
src/lib/admin-guard.ts
src/lib/admin-middleware.ts
src/routes/api/files.$.tsx
src/routes/api/auth/me.ts
src/routes/api/registrations.ts
src/routes/api/check-in.verify.ts
src/routes/api/events.$id.ts
src/routes/api/events.$id.export.ts
src/routes/api/events.validate-coupon.ts
src/routes/api/society.$slug.ts
src/routes/api/ticket.$ticketId.ts
src/routes/api/admin/*.ts   (events, events.$id, execom, execom.$id, registrations, registrations.$id, societies, societies.$id, users)
src/routes/societies.tsx            (fetchSocietyMembers, fetchSocietyEvents handlers)
src/routes/full-execom.tsx          (fetchExecomData handler)
```

Change:
```diff
- import { createPB } from "@/lib/pb"
+ import { createPB } from "@/lib/pb.server"
```

Client files that import **only** `buildFileUrl`/`escapeFilterValue` from `@/lib/pb` keep their import unchanged (they must NOT switch to `pb.server`, or the build fence fires):
```
src/features/events/EventsPageClient.tsx   (uses buildFileUrl — but see 4.5)
src/features/societies/SocietiesClient.tsx  (uses buildFileUrl)
```

### 4.4 Convert the four isomorphic loaders to server functions

Each follows the `full-execom.tsx` template. Example for `src/routes/events.tsx` (replace the inline loader body):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createPB, buildFileUrl } from "@/lib/pb.server"; // server-only import
import { getField, getExpand } from "@/lib/safe-get";
import type { EventItem } from "./events"; // (move EventItem to a types file if circular)
import EventsPageClient from "@/features/events/EventsPageClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";

const fetchEvents = createServerFn().handler(async (): Promise<EventItem[]> => {
  try {
    const pb = createPB();
    const result = await pb.collection("events").getList(1, 20, {
      filter: 'status="published"',
      sort: "date",
      expand: "society",
      skipTotal: true,
      fields: "id,title,description,date,endDate,venue,price,banner,status,registrationOpen,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember",
    });
    return (result.items || []).map((raw: Record<string, unknown>) => {
      // ... identical mapping logic that exists today ...
      return { /* EventItem */ };
    });
  } catch {
    return [];
  }
});

export const Route = createFileRoute("/events")({
  head: () => ({ /* unchanged */ }),
  loader: async (): Promise<EventItem[]> => fetchEvents(),
  component: EventsPage,
});
```

Apply the same shape to:
- **`src/routes/index.tsx`** → `fetchHomeData` server fn returning `HomeData`. Keep the `Promise.allSettled` + safe-empty logic; the `context.response.headers.set('Cache-Control', ...)` stays in the **loader** (it has access to `context`), wrapping the `await fetchHomeData()` call. (Server fns don't receive the router `context`, so cache headers must be set in the loader, not the fn.)
- **`src/routes/societies.tsx`** → `fetchSocieties` server fn; the route loader calls it. `fetchSocietyMembers`/`fetchSocietyEvents` already are server fns — leave them.
- **`src/routes/register.$eventId.tsx`** → `fetchEventForRegistration(eventId)` server fn with a `.validator((id: string) => id)`; loader calls `await fetchEventForRegistration({ data: eventId })`.

> **Cache-Control caveat:** `context.response.headers` is only available during SSR. On client-side nav the loader runs in the browser and `context.response` is absent — the existing `response?.headers?.set(...)` optional-chain already no-ops safely. Keep that pattern.

### 4.5 Remove the client-component direct PB fetches

**`src/features/events/EventsPageClient.tsx`** — delete the fallback `useEffect` (lines ~43-71) that reads `import.meta.env.VITE_POCKETBASE_URL` and fetches PB REST. The loader now reliably returns data on client nav via RPC, so the fallback is dead weight. Keep `useState(initialEvents)` seeded from `useLoaderData()`. If a manual refetch is desired later, expose a `refetchEvents` server fn and call it.

**`src/features/societies/SocietiesClient.tsx`** — delete the fallback `useEffect` (lines ~166-184) reading `VITE_POCKETBASE_URL`. Same reasoning.

If you want to preserve a "refetch on demand" UX, call the **existing** same-origin server routes instead:
```ts
// replacement (optional) — same-origin, no PB URL
const res = await fetch('/api/events?...'); // would require a list server route
```
But the simplest correct move is: **delete the fallbacks; trust the loader.**

### 4.6 `.env.local` — remove the public var

```diff
- VITE_POCKETBASE_URL=http://ieee-pocketbase-8wt381-14074c-144-24-114-90.sslip.io
  POCKETBASE_URL=http://ieee-pocketbase-8wt381-14074c-144-24-114-90.sslip.io
```

### 4.7 `Dockerfile` — drop the VITE build arg

```diff
- ARG VITE_POCKETBASE_URL
  ...
- ARG VITE_POCKETBASE_URL
- ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
```
The runtime container already receives `POCKETBASE_URL` via `docker-compose.yml` (line 23) — the server reads it from `process.env` at request time. The build no longer needs any PB URL.

> If `docker-compose.yml` passes `VITE_POCKETBASE_URL` as a build arg, remove that line too. (`docker-compose.yml:23` only sets `POCKETBASE_URL` — good.)

### 4.8 `.env.example` — add a guardrail note

```diff
  # PocketBase
  POCKETBASE_URL=http://127.0.0.1:8090
+ # NOTE: Do NOT create a VITE_POCKETBASE_URL. The PB URL must stay server-side;
+ # route loaders fetch via createServerFn (see src/routes/full-execom.tsx).
```

### 4.9 Final cutover — delete the migration bridge in `pb.ts`

After 4.3 is complete (no client file imports `createPB`/`getPBUrl` from `@/lib/pb`), remove the re-export line from `src/lib/pb.ts` so the client-safe module contains zero server code:

```diff
- // Re-export ...
- export { createPB, getPBUrl } from './pb.server'
```

---

## 5. Migration Strategy (ordering)

The order matters: removing `VITE_POCKETBASE_URL` too early breaks client navigation; refactoring loaders without removing `VITE_` leaves the leak.

1. **Split `pb.ts` → add `pb.server.ts`** (4.1, 4.2 with the temporary re-export). Build still works; nothing functionally changes. ✅ safe checkpoint.
2. **Convert the four isomorphic loaders to server fns** (4.4). At this point loaders work on client nav via RPC **even though `VITE_` still exists** — the server fn uses `process.env`, so `VITE_` is no longer read by the loaders. Verify client-side navigation loads data.
3. **Remove the two client-component direct PB fetches** (4.5). They were only needed because the isomorphic loader failed on the client; step 2 removed that failure mode.
4. **Repoint every server-side `createPB` import to `@/lib/pb.server`** (4.3). Run a full build + typecheck — the `server-only` fence will flag any client file that accidentally imports `createPB`.
5. **Delete the re-export bridge in `pb.ts`** (4.9). Build again; any remaining `import { createPB } from '@/lib/pb'` becomes a compile error, confirming full cutover.
6. **Remove `VITE_POCKETBASE_URL` from env/build config** (4.6, 4.7, 4.8) — `.env.local`, `Dockerfile`, `docker-compose.yml` if present. Rebuild the Docker image and verify the staging URL no longer appears in the client bundle.
7. **Final verification** (section 6).

> Why this order: each step is independently buildable and leaves the app functional. The leak is closed at step 3 (no more client reads of `VITE_`); the *capability* of leaking is removed at steps 4-6 (no more `VITE_` var and no client import path to PB).

---

## 6. Verification / Testing Strategy

### 6.1 Build-time: prove the URL is gone from the bundle

```bash
bun run build
# Search every emitted client chunk for the PB host. MUST return nothing.
grep -r "phloraxx\|sslip.io\|pocketbase-8wt" dist/client/assets/ && echo "LEAK FOUND" || echo "clean"
# Confirm VITE_ var is gone:
grep -r "VITE_POCKETBASE_URL" dist/ .env.local Dockerfile && echo "STILL PRESENT" || echo "clean"
```

### 6.2 Server-only fence test

Add a temporary client import of `createPB` (e.g. in a scratch client component) and confirm `bun run build` **fails** with a server-only import error. Remove the scratch. This proves the guardrail works.

### 6.3 Functional — hard reload (SSR path)

- Visit `/events`, `/`, `/societies`, `/register/<id>`, `/full-execom` via full page load. Data renders. Server logs show PB queries using `process.env.POCKETBASE_URL`.
- Confirm `Cache-Control: public, max-age=300` header on the SSR HTML response for `/events` and `/`.

### 6.4 Functional — client-side navigation (the regression risk)

- From `/`, click a client-side `<Link>` to `/events` (no full reload). Confirm the events list populates — this exercises the server-fn RPC path. Repeat for `/societies`, `/full-execom`, and a `/register/<id>` link.
- Open DevTools → Network → the navigation should issue a POST to the server-fn RPC endpoint (same origin), **not** a request to the PB host. Filter Network by the PB hostname → must be empty.
- DevTools → Sources → search all JS for the staging/production PB hostname → must return zero hits.

### 6.5 Hydration

- After client nav to `/events`, view-source vs DOM should match (no hydration warning in console). Server-fn returns plain serializable objects identical to the prior loader shape, so `useLoaderData()` hydration is byte-for-byte unchanged.

### 6.6 Error handling

- With PB briefly unreachable, hit `/events` via client nav: loader's `errorComponent` renders (or the safe-empty fallback for `/`). No PB URL in any thrown error message surfaced to the client.
- Confirm `logError` is called for PB failures on the home loader (currently swallowed silently — add logging per the design decision in §3.7).

### 6.7 Existing on-demand client fetches still work

- `/societies` → open a society panel → `fetchSocietyMembers` / `fetchSocietyEvents` server fns fire (RPC). Members + events render. No PB URL in the request.
- Event detail modal (if it uses `/api/events/$id`) → same-origin request only.

### 6.8 Auth/file proxy unaffected

- `/api/files/...` still proxies (uses `createPB` from `pb.server` now). Authenticated file download works. Anonymous download returns 401.
- `/api/auth/me`, OAuth flow (`/api/auth/init`, `/api/auth/callback/google`) unaffected — they already use `process.env`.

---

## 7. Edge Cases & Pitfalls

| Case | Handling |
|---|---|
| **Server fn output must be serializable** | All four loaders already map PB records to plain objects (strings/numbers/booleans/arrays). No `Date`, `Map`, or PB `Record` instances cross the boundary. Verify no `record` objects leak through. |
| **Cache headers only on SSR** | `context.response.headers` is undefined on client nav. The existing `response?.headers?.set(...)` optional chain no-ops safely — keep it; don't move cache logic into the server fn (fns have no `context`). |
| **Circular imports** | `EventItem`/`HomeData` types live in the route file. If a server fn in the same file references them, fine. If you extract fns to `src/lib/queries/*.functions.ts`, move the types to `src/types/` to avoid import cycles. |
| **`register.$eventId.tsx` param** | Server fn needs the `eventId`. Use `.validator((id: string) => id)` and call `fetchEventForRegistration({ data: eventId })`. Validator input must be serializable (a string — fine). |
| **Admin loaders** | Already use `createServerFn` (admin-guard/adminLoader). Only their `createPB` import path changes to `pb.server`. No logic change. |
| **`api/auth/init.ts` & `callback/google.ts`** | These use `new PocketBase(url)` directly (not via `createPB`). Optionally migrate to `createPB` from `pb.server` for consistency (the architecture review flagged this bypass), but it's not security-critical since they're server-only. |
| **PB 0.39.1 `routerAdd` broken (404)** | Out of scope for this change — server fns and server routes don't rely on PB custom routes. The app's own `/api/*` routes replace what PB hooks would have done. |
| **Dokploy/Docker rebuild** | After removing the `VITE_` build arg, rebuild the image. The runtime `POCKETBASE_URL` env is injected by `docker-compose.yml` at container start — the server reads it fresh per request, no rebuild needed for URL changes. |
| **`.env.local` also contains `POCKETBASE_SUPERUSER_TOKEN` & `POCKETBASE_ADMIN_TOKEN`** | Separate secret-hygiene concern (these are runtime secrets; ensure they are NOT prefixed `VITE_` and not echoed into client code). This report does not change them, but verify they never appear in `dist/client/`. |
| **Silent PB outage on home page** | `index.tsx` catches all errors and returns safe-empty. Add `logError('home-loader', err)` so outages are observable — otherwise users see an empty hero with no signal. |

---

## 8. Critical Files to Read Before Implementing

- `src/lib/pb.ts` — current `getPBUrl`/`createPB`/`buildFileUrl` (the split point).
- `src/routes/full-execom.tsx` — **the reference server-fn-loader pattern to copy.**
- `src/routes/societies.tsx` — mixed: route loader (direct `createPB`, to fix) + `fetchSocietyMembers`/`fetchSocietyEvents` (server fns, to keep).
- `src/routes/events.tsx`, `src/routes/index.tsx`, `src/routes/register.$eventId.tsx` — the four isomorphic loaders to convert.
- `src/features/events/EventsPageClient.tsx` (lines 43-71), `src/features/societies/SocietiesClient.tsx` (lines 166-184) — client PB fetches to delete.
- `src/lib/admin-guard.ts`, `src/lib/admin-middleware.ts` — existing `createServerFn` + `createPB` usage (import path only).
- `src/routes/api/files.$.tsx` — existing same-origin file proxy (proof the `/api/files/...` URL pattern works without exposing PB).
- `src/start.ts` — `createCsrfMiddleware` already protects server fns (same-origin RPC); no change needed, but understand it covers the new RPC calls.
- `.env.local`, `Dockerfile`, `docker-compose.yml`, `.env.example` — env/build config to clean.
- Docs: [Execution Model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model) · [Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) · [Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).

---

## 9. TL;DR

- The leak is **three-pronged**: two client components read `VITE_POCKETBASE_URL` and fetch PB directly; `getPBUrl()` inlines the `VITE_` literal into the client bundle; four isomorphic loaders call `createPB()` directly and only "work" on client nav because of the `VITE_` fallback.
- **Fix:** copy the existing `full-execom.tsx` pattern — wrap every loader's PB query in `createServerFn()`; split `pb.ts` into `pb.ts` (client-safe `buildFileUrl`/`escapeFilterValue`) + `pb.server.ts` (server-only `createPB`/`getPBUrl` reading only `process.env`); delete the two client-component PB fetches; remove `VITE_POCKETBASE_URL` from env and Docker build.
- **Order:** split first → convert loaders → delete client fetches → repoint server imports → drop the re-export bridge → remove `VITE_` config → verify the bundle is clean.
- **Verify:** `grep` the built `dist/client/assets/` for the PB hostname (must be empty), confirm client-side navigation loads data via same-origin RPC, confirm the `server-only` fence fails the build on any accidental client import of `createPB`.
