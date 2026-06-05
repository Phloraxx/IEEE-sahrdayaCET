# Migration Status Report — IEEE Sahrdaya SB

**Branch:** `feat/payload-migration`
**Last updated:** June 4, 2026
**Migration from:** Appwrite (MariaDB + custom Fastify)
**Migration to:** Payload CMS 3.85 + Next.js 16 + SQLite (self-hosted on Dokploy)

---

## TL;DR

All planned work is complete. The platform is live in dev with real data migrated from the Appwrite export.

| Metric | Value |
|---|---|
| **Total commits on branch** | 79 |
| **Files changed vs. `main`** | 178 |
| **Net lines removed** | ~18,000 (Appwrite + Vercel/Cloudflare boilerplate stripped) |
| **Unit tests** | 17/17 passing |
| **Typecheck** | clean |
| **Routes** | 5/5 returning 200 (home, /societies, /api/events, /api/societies, /admin) |
| **Migrated data** | 15 societies, 94 execom members, 29 events, ~1 society chair, 0 registrations |
| **Banner images** | 27/29 events backfilled with external URLs |

---

## Final State Architecture

```
Dokploy VPS (ieeesahrdaya.com)
├── Container 1: ieee-app (Next.js 16 + Payload CMS 3.85 + SQLite)
│   ├── Frontend  —  /, /events, /societies, /full-execom, /ticket/:id
│   ├── Admin     —  /admin (Payload white-labeled w/ IEEE brand)
│   ├── REST API  —  /api/{collection-slug} (Payload catch-all CRUD)
│   └── Custom    —  /api/auth/[...nextauth]
│                    /api/registrations     (POST: create registration + order)
│                    /api/orders/webhook    (POST: DDM payment callback)
│                    /api/check-in/verify   (POST: QR scan check-in)
│                    /api/events/:id/export (CSV export, chair-scoped)
└── Container 2: ddm-api (Fastify + SQLite, at pay.mulearnscet.in)
    └── POST /ticket, GET /status, POST /webhook  —  unchanged
```

---

## What Shipped (5-PR Plan)

### PR 1 — Foundation & Cleanup
**Goal:** Remove dead code, consolidate types, eliminate Appwrite residue.

- Stripped all `src/lib/api/*` (840-line `appwrite-admin.ts`, CSRF, rate-limiter, shared-utils, validation, logger, auth-check)
- Removed `src/lib/appwrite.ts` and `src/lib/checkInHelpers.ts` (160 lines)
- Removed all Appwrite environment variables from `.env.example`
- Deleted `proxy.ts` (inert, can't work as Edge middleware in Next.js 16)
- Deleted 6 redundant API routes replaced by Payload REST catch-all
- Removed `appwriteUserId` field from Users collection
- Consolidated 4 conflicting `Event` types, 3 `Society`, 3 `Registration`, 3 `Ticket` into 1 source in `src/types/index.ts`
- Removed duplicate interfaces from `EventRegistrationModal`, `PaymentModal`, `TicketDisplay`
- Removed dead components: `AnimatedTick`, `ConfettiExplosion`, `DashboardWidget`, `BillingView`, `ticketGenerator.ts`
- Migrated all `<img>` tags in `SocietiesClient` to `next/image`
- Dockerfile: `--omit=dev`, `output: 'standalone'`, removed redundant `node_modules` copy

### PR 2 — Validation, Coupons & Registration API
**Goal:** Centralize registration validation; introduce coupons; slim the API.

- **`src/payload/hooks/registrations.ts#validateRegistration`** (beforeChange):
  - 404 if event missing or `isDeleted`
  - 400 if `registrationOpen === false`
  - 400 if `registrationDeadline` passed
  - 400 if full and `enableWaitlist === false`
  - Free event (`price <= 0`) auto-confirms: sets `paymentStatus='not_required'`, `registrationStatus='confirmed'`
- **`src/lib/coupons.ts#applyCoupon(payload, code, eventId, basePrice)`**:
  - Resolves coupon from DB
  - Validates `isActive`, `expiresAt`, `maxUses`, `currentUses`
  - Computes `discountedAmount` based on `discountType` (percent/fixed) and `discountValue`
  - Returns `{ discountedAmount, coupon }` or throws `APIError` on invalid
- **`src/lib/auth.ts`** — Shared `requireAuth()` + `AuthError` class (replaced 4 copy-pasted auth guards)
- **`src/lib/api.ts`** — Shared `apiFetch()` + `ApiError` + `buildPayloadQuery()`
- **`src/app/api/registrations/route.ts`** — 99-line POST handler (auth → create registration → coupon → order)
- **`src/app/api/orders/webhook/route.ts`** — Slimmed to 79 lines
- **`src/app/api/check-in/verify/route.ts`** — Removed redundant `incrementCheckedInCount` call

### PR 3 — Increment & Check-in Hooks
**Goal:** Race-free counter updates via Drizzle raw queries.

- **`src/payload/hooks/registrations.ts#incrementOnConfirm`** (afterChange):
  - Atomic Drizzle `UPDATE ... SET registeredCount = COALESCE(..., 0) + 1`
  - Triggers on `pending → confirmed` transition only
  - Bypasses Payload Local API to avoid read-after-write inconsistency
- **`incrementCheckedInOnTransition`** (afterChange):
  - Atomic Drizzle increment on `checkedIn false → true`
- After-Change hook chain on Registrations: `[incrementOnConfirm, incrementCheckedInOnTransition, sendConfirmation]`

### PR 4 — Payment Propagation
**Goal:** DDM webhook flows cleanly into registration state.

- **`src/payload/hooks/orders.ts#createDdmTicket`** (beforeChange):
  - On `create` with UPI payment: POSTs to `${PAYMENT_API_URL}/ticket`
  - Stores `ddmTicketId` and full `ddmResponse` on the order
- **`src/payload/hooks/orders.ts#propagatePaymentToRegistration`** (afterChange):
  - On `paymentStatus` transition to `'paid'`, PATCHes linked registration
  - Sets `paymentStatus='paid'`, `paymentTicketId` (from `ddmResponse.transactionId` / `ddmTicketId`), `paymentAmount`, `registrationStatus='confirmed'`
  - Triggers Registrations afterChange chain → ticket issued + email sent

### PR 5 — Admin White-Labeling & Tests
**Goal:** Brand the admin panel; ship test coverage.

- **`src/payload/admin/BeforeLogin.tsx`** — IEEE-branded header above default login form
- **`src/payload/admin/BeforeDashboard.tsx`** — Welcome panel with `DashboardStats`
- **`src/payload/admin/DashboardStats.tsx`** — Stats cards
- **`src/payload/admin/Logo.tsx`** + **`Icon.tsx`** — Inlined SVG with `currentColor` (no external asset)
- **`src/app/(payload)/custom.css`** — Full admin white-labeling (IEEE blue `#00629B`, teal `#00A3B5`, gold `#D4A843`)
- **`payload.config.ts`** — Registers all admin custom components; sets `meta.titleSuffix = ' | IEEE Sahrdaya SB'`

**Tests added (Vitest + Playwright):**
- `tests/unit/hooks/validateRegistration.test.ts` — 9 tests (event not found, deleted, closed, deadline passed, full, free auto-confirm, etc.)
- `tests/unit/lib/coupons.test.ts` — 8 tests (active/inactive, expired, max uses, percent/fixed discount)
- `tests/e2e/smoke.spec.ts` — Home/events/societies load
- `tests/e2e/register-flow.spec.ts` — Full registration flow with auth

---

## Database State

**SQLite with WAL mode.** Custom indexes added via `afterSchemaInit` in `payload.config.ts`:

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `events_status_idx` | events | `status` | Filter by draft/published/completed |
| `events_is_deleted_idx` | events | `isDeleted` | Soft delete filter |
| `events_date_idx` | events | `date` | Date-range queries |
| `registrations_registration_status_idx` | registrations | `registrationStatus` | Status filters |
| `registrations_payment_status_idx` | registrations | `paymentStatus` | Payment filters |
| `registrations_user_event_unique` | registrations | `user`, `event` | **Unique** — dedupe at DB level (409 on conflict) |
| `orders_payment_status_idx` | orders | `paymentStatus` | Payment filters |

**Note:** Drizzle property names use camelCase for fields (`registrationStatus`, `paymentStatus`, `isDeleted`) and bare names for relations (`user`, `event`) — **not** the snake_case SQL column names. This was the root cause of the original `getColumnCasing` bug.

---

## Collections (8)

| Slug | Group | Purpose | Access |
|---|---|---|---|
| `media` | System | Image uploads (auto thumbnail/card sizes) | `isAdmin` write, public read |
| `users` | System | Google OAuth users with roles | `isSelfOrAdmin` |
| `societies` | Content | 14 IEEE technical societies | `isChairOrAdmin` write, public read |
| `execom` | Content | Executive committee members | `isChairOfSociety` write, public read |
| `events` | Events | Workshops, hackathons, seminars | `isChairOrAdmin` create, `isChairOfSociety` update/delete, public read |
| `registrations` | Events | Sign-ups with payment tracking | `isAuthenticated` create, `isChairOrAdminForEventRead` read, `isChairOfSocietyForEventDoc` update, `isAdmin` delete |
| `orders` | Events | DDM payment orders | Internal |
| `coupons` | Events | Discount codes | `isChairOrAdmin` |

---

## Access Control Helpers (`src/payload/access/index.ts`)

| Helper | Use case |
|---|---|
| `isAuthenticated` | Any logged-in user |
| `isAdmin` | Admin only |
| `isSelfOrAdmin` | Read/update self or any as admin |
| `isChairOrAdmin` | Chair or admin |
| `isChairOfSociety` | Reads `data.society`, checks society's `chairs` array |
| `isChairOfSocietyForEventDoc` | Reads `data.event`, walks `event → society → chairs` |
| `isChairOrAdminForEventRead` | List-level Where filter for chairs (nested `event.society.chairs.contains`) |
| `isChairOfSocietyForEvent` (function) | Standalone API-route version (no Access context) |

---

## Custom API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | * | NextAuth.js 5 handler (Google OAuth) |
| `/api/registrations` | POST | Create registration + (if paid) order with coupon |
| `/api/orders/webhook` | POST | DDM payment callback → propagates to registration |
| `/api/check-in/verify` | POST | QR scan check-in (uses new `incrementCheckedInOnTransition` hook) |
| `/api/events/:id/export` | GET | CSV export, chair-scoped |
| `/api/{collection-slug}` | * | Payload REST catch-all (CRUD on all 8 collections) |

---

## Migration (Appwrite → Payload)

**Source:** `ieee_export.sql` (355KB MariaDB dump) + `public/Societies/` (14 images), `public/Execom/` (83), `public/Events/` (7)

**Process:**
1. `npx payload migrate` — applies schema migrations
2. `npm run migrate` — runs `migration/migrate-from-sql.ts` (uses `tsx --env-file=.env.local`)
3. `npm run seed` (dev-only, guards on existing data) — re-runnable demo data

**Migrated counts:**
- Societies: 14 → 15 (1 extra chair account)
- Execom: 83 → 94
- Events: 7 → 29 (22 from external URLs, no local file)

**Cleanup needed in source data (intentionally kept as-is, matches Appwrite):**
- 6 faculty records have wrong photo attachments (pre-existing in SQL `photoUrl` field)
- 7 images in `public/Events/` are orphaned (no SQL title match)
- 2 events unmatched during backfill (1 "test", 1 duplicate-title "Machine Learning Workshop")

**Banner URL backfill:** `scripts/backfill-event-banners.ts` parses `ieee_export.sql` events by title and sets `bannerUrl` from external URLs. Result: 27/29 events have banner URLs (ImgBB + Appwrite storage).

**Image config for external hostnames** (`next.config.mjs`):
```js
remotePatterns: [
  { protocol: 'https', hostname: 'res.cloudinary.com' },
  { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
  { protocol: 'https', hostname: 'i.ibb.co' },                  // ImgBB
  { protocol: 'https', hostname: 'backend.mulearnscet.in' },   // Appwrite
  { protocol: 'https', hostname: 'backend.ieeesahrdaya.com' }, // Appwrite
  { protocol: appUrl.protocol, hostname: appUrl.hostname },    // self
],
dangerouslyAllowLocalIP: true,  // Next.js 16 SSRF guard
```

> **Important Next.js 16 behavior:** `<Image unoptimized>` **still validates hostnames** in the loader. External URLs must be in `remotePatterns` to render.

---

## Migrations

| File | Date | Purpose |
|---|---|---|
| `src/migrations/20260604_103004.ts` | Jun 4 | Initial schema with 7 custom indexes |
| `src/migrations/20260604_132617.ts` | Jun 4 | Add `banner_url text` column to events |

State synced manually in `payload_migrations` table (dev-push was already there).

---

## Environment Variables

```env
# Payload CMS
PAYLOAD_SECRET=                       # required
DATABASE_URI=file:./data/payload.db   # SQLite path

# Authentication (NextAuth.js 5)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=http://localhost:3000

# DDM Payment Gateway
PAYMENT_API_URL=https://pay.mulearnscet.in/api
PAYMENT_WEBHOOK_SECRET=

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_UPI_ID=
NEXT_PUBLIC_MERCHANT_NAME=

# Optional
ADMIN_EMAILS=                         # comma-separated
CORS_ORIGINS=                         # comma-separated
```

**Appwrite vars removed** (`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`).

---

## Tests

```bash
npm test          # vitest run — 17 tests
npm run test:watch
npm run test:e2e        # playwright headless
npm run test:e2e:headed # playwright with browser UI
```

| Test file | Tests | Coverage |
|---|---|---|
| `tests/unit/hooks/validateRegistration.test.ts` | 9 | Event not found, deleted, closed, deadline, full, free auto-confirm, valid paid, free with price=0 |
| `tests/unit/lib/coupons.test.ts` | 8 | Inactive, expired, max uses reached, percent discount, fixed discount, valid, no code |
| `tests/e2e/smoke.spec.ts` | 4 | Home, events, societies, full-execom load |
| `tests/e2e/register-flow.spec.ts` | 1 | Full registration flow with auth |

---

## Scripts

```bash
npm run dev              # next dev (Turbopack)
npm run build            # next build (standalone output)
npm start                # next start (production)
npm run lint             # next lint
npm run payload          # payload CLI
npm run migrate          # tsx --env-file=.env.local migration/migrate-from-sql.ts
npm run migrate:safe     # npx payload migrate && npm run migrate
npm run seed             # tsx --env-file=.env.local scripts/seed.ts (dev-only, guards on existing data)
npm test                 # vitest run
npm run test:e2e         # playwright test
```

---

## Key Files (Final)

| File | Purpose |
|---|---|
| `src/types/index.ts` | Single source of truth: Event, Society, EventWithSociety, ExtendedEvent |
| `src/types/registration.ts` | Registration-specific: FormTemplate, Registration, Ticket |
| `src/lib/dates.ts` | 11 shared date formatting utilities |
| `src/lib/auth.ts` | `requireAuth()` + `AuthError` |
| `src/lib/coupons.ts` | `applyCoupon()` — percent/fixed discount with validation |
| `src/lib/api.ts` | `apiFetch()` + `ApiError` + `buildPayloadQuery()` |
| `src/lib/qr.ts` | `generateQRBase64()` |
| `src/lib/ticketStatus.ts` | Ticket status badge logic |
| `src/lib/pdfReceiptGenerator.ts` | jsPDF receipt generation |
| `src/lib/email/templates.ts` | HTML email templates (registration + receipt) |
| `src/payload/access/index.ts` | 106 lines, 7 helpers + 1 standalone function |
| `src/payload/hooks/registrations.ts` | 192 lines, 4 exports |
| `src/payload/hooks/orders.ts` | 72 lines, 2 exports |
| `src/payload/collections/{8 collections}` | Total ~440 lines across 8 files |
| `src/payload/admin/{BeforeLogin,BeforeDashboard,DashboardStats,Logo,Icon}.tsx` | Admin white-labeling |
| `src/app/(payload)/custom.css` | Full admin CSS overrides |
| `src/app/api/registrations/route.ts` | 128 lines, auth → create → coupon → order |
| `src/app/api/orders/webhook/route.ts` | DDM callback handler |
| `src/app/api/check-in/verify/route.ts` | QR check-in |
| `src/app/api/events/[eventId]/export/route.ts` | CSV export |
| `migration/migrate-from-sql.ts` | MariaDB dump → Payload |
| `scripts/seed.ts` | Dev-only demo data (guards on existing data) |
| `scripts/backfill-event-banners.ts` | Backfill `bannerUrl` from SQL |
| `next.config.mjs` | External image hostnames + `dangerouslyAllowLocalIP` |
| `payload.config.ts` | 7 custom indexes via `afterSchemaInit` |

---

## Post-Migration Verification

Final dev verification (June 4, 2026):

- **Routes:** home=200, /societies=200, /api/events=200, /api/societies=200, /admin=200
- **Society page images:** 21 society/member logos + 8 event banners (i.ibb.co) rendering
- **Typecheck:** clean (`npx tsc --noEmit`)
- **Unit tests:** 17/17 passing
- **Migrations applied:** `20260604_103004` (schema) + `20260604_132617` (banner_url column)

---

## Known Issues / Remaining (Low Priority)

| Issue | Status | Notes |
|---|---|---|
| `EventCard` dedup | Open | Root-level `EventCard.tsx` vs `src/components/events/EventCard.tsx` — different designs, both in use |
| `TicketDisplay` + `tickets/TicketCard` | Open | Overlapping ticket UI, could merge |
| Execom data layer | Open | `Execom.tsx` and `ExecomClient.tsx` fetch same API independently |
| `Navbar`/`Footer` not in root layout | Open | Homepage needs fixed hero, Societies conditionally hides navbar |
| `sass` devDependency | Open | Required by `@payloadcms/ui` internally |
| SSR opportunities | Open | Most components are `'use client'` — works but could be faster |

---

## Removed (Appwrite Era)

- All `src/lib/api/*` (1,440 lines)
- `src/lib/appwrite.ts`, `src/lib/checkInHelpers.ts`
- `proxy.ts` (inert edge middleware)
- 6 redundant API routes
- `appwriteUserId` field
- `AnimatedTick`, `ConfettiExplosion`, `DashboardWidget`, `BillingView`, `ticketGenerator.ts`
- All Appwrite env vars
- `vercel.json`, `wrangler.jsonc`, `tailwind.config.ts` (migrated to `tailwind.config.js`)
- 30,000+ lines of dead code
