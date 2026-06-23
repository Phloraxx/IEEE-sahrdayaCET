# IEEE Sahrdaya Student Branch — Full Codebase Summary

## Project
Event management platform for 14 IEEE technical societies under Sahrdaya College of Engineering & Technology, Kerala.

## Stack
- **Framework:** TanStack Start (file-based routes, server functions, SSR) + React 19 + TypeScript 5.8
- **Styling:** Tailwind CSS v4 + shadcn/ui primitives + CSS custom properties in globals.css (1059 lines)
- **Animation:** Framer Motion v12
- **Backend:** PocketBase 0.39.1 (embedded SQLite, Google OAuth, file storage, REST API)
- **Charts:** Recharts
- **Auth:** Google OAuth2 via PocketBase — roles: admin, chair, user
- **Forms:** react-hook-form + zod v4
- **Build:** Vite + bun package manager
- **Infra:** Docker (multi-stage Node 22-alpine build), optional Caddy reverse proxy
- **Testing:** Vitest (unit/integration) + Playwright (e2e)

## Architecture

### Route Structure (TanStack Start file-based)
```
src/routes/
├── __root.tsx              # HTML shell, AuthProvider, QueryClient, head/SEO
├── index.tsx               # Home page (hero, events showcase, execom, societies, etc.)
├── events.tsx              # Events listing with filters
├── societies.tsx           # Societies listing
├── full-execom.tsx         # Full execom directory
├── register.$eventId.tsx   # Event registration page
├── ticket.$ticketId.tsx    # Ticket view page
├── admin.tsx               # Admin layout (guard, sidebar, topbar)
├── admin.*.tsx             # Admin routes (events, registrations, societies, etc.)
└── api/*                   # API routes (auth, registrations, webhook, admin CRUD, etc.)
```

### Data Flow
```
Browser → Caddy/Cloudflare → TanStack Start (SSR + server functions) → PocketBase REST API
                                     │
                               Server functions (createServerFn)
                                     │
                               PocketBase (direct fetch with PB token)
```

### Dual API Pattern
The codebase has TWO API layers that overlap:
1. **createServerFn** — TanStack Start server functions (used in admin.*.tsx routes for loader data)
2. **REST route handlers** — Express-style handlers in src/routes/api/* (used for mutations and detail endpoints)

Both do the same thing — fetch data from PocketBase — but with different patterns, error handling, and data shapes.

## Key File Inventory

### Lib (Business Logic)
- `src/lib/pb.ts` — PocketBase client factories (createPB, createAdminPB, buildFileUrl, escapeFilterValue)
- `src/lib/auth.ts` — Server-side auth: requireAuth(), requireRole(), AuthError
- `src/lib/auth-context.tsx` — Client-side AuthProvider + useAuth() hook
- `src/lib/constants.ts` — Enums (registration/event/payment status, user roles), pagination limits
- `src/lib/registration-service.ts` — 358 lines. Core business logic: create/confirm/cancel/checkIn, coupon validation, ticket generation, counter bumping
- `src/lib/event-service.ts` — Soft-delete helper
- `src/lib/chair-scope.ts` — Role-based filtering: isAdmin, isChair, scope filters for events/registrations/societies
- `src/lib/admin-middleware.ts` — authenticateAdmin(), buildChairFilter()
- `src/lib/admin-loader.ts` — Reusable loader wrapper for admin server functions
- `src/lib/admin-guard.ts` — ServerFn-based auth guard for admin beforeLoad
- `src/lib/api-error.ts` — Centralized error → HTTP response mapper
- `src/lib/safe-get.ts` — Type-safe field accessor for PB response objects
- `src/lib/route-helpers.ts` — parsePagination(), buildFilter()
- `src/lib/cookie-signing.ts` — HMAC sign/verify for OAuth provider cookie
- `src/lib/verify-same-origin.ts` — CSRF defense via Origin header check
- `src/lib/logger.ts` — Structured error logger
- `src/lib/dates.ts` — Date formatting utilities
- `src/lib/csv-export.ts` — CSV generation
- `src/lib/webhook.ts` — Webhook body schema, duplicate detection
- `src/lib/parse-form-data.ts` — Multipart form parsing

### Schemas (Zod)
- `src/schemas/events.ts` — EventCreateSchema, EventUpdateSchema, CouponSchema
- `src/schemas/execom.ts` — ExecomCreateSchema, ExecomUpdateSchema
- `src/schemas/societies.ts` — SocietyCreateSchema
- `src/schemas/admin-registrations.ts` — AdminRegistrationUpdateSchema
- `src/schemas/registrations.ts` — RegistrationBodySchema

### Types
- `src/types/index.ts` — Society, Coupon, Event, EventWithSociety, AuthUser, ExecomMember, Registration interfaces

### Routes (46 route files total)

#### Public SSR Pages (top-level routes)
- `index.tsx` — Home page: hero, societies strip, events showcase, execom carousel, footer. Loads all components statically.
- `events.tsx` — Events listing with EventHeroSection + EventListSection
- `societies.tsx` — Societies listing
- `full-execom.tsx` — Full execom directory
- `register.$eventId.tsx` — Event registration (loader fetches event by ID)
- `ticket.$ticketId.tsx` — Ticket display page (client-only, fetches from API)

#### API Routes
- `api/auth/init.ts` — OAuth2 init (returns Google auth URL, sets signed provider cookie)
- `api/auth/callback/google.ts` — OAuth2 callback (validates state, exchanges code, sets auth cookie)
- `api/auth/logout.ts` — Logout (clears auth cookie, CSRF via Origin check)
- `api/auth/me` — Returns current user (used by AuthProvider)
- `api/registrations.ts` — GET (list user's registrations), POST (create registration)
- `api/events/$id.ts` — Public event detail
- `api/events/validate-coupon.ts` — Coupon validation
- `api/ticket/$ticketId.ts` — Ticket lookup (PII leak: returns name/email/phone without auth)
- `api/society/$slug.ts` — Society detail with events and execom members
- `api/check-in/verify.ts` — QR check-in verification
- `api/orders/webhook.ts` — Payment webhook (CRITICAL: doesn't set paymentStatus)
- `api/admin/*` — 10+ CRUD handlers for events, societies, users, execom, registrations, stats

#### Admin Routes
- `admin.tsx` — Layout with AdminGuard, AdminSidebar, AdminTopbar, AdminKeyboardShortcuts, PageTransition
- `admin.index.tsx` — Dashboard with stats, upcoming events, recent registrations, charts
- `admin.events.tsx` — Events table
- `admin.events.new.tsx` — Create event (lazy loaded)
- `admin.events.$id.tsx` — Event detail
- `admin.events.$id.edit.tsx` — Edit event
- `admin.registrations.tsx` — Registrations table
- `admin.registrations.$id.tsx` — Registration detail
- `admin.societies.tsx` — Societies list
- `admin.societies.new.tsx` — Create society
- `admin.societies.$id.tsx` — Society detail
- `admin.societies.$id.edit.tsx` — Edit society
- `admin.users.tsx` — Users list
- `admin.users.$id.tsx` — User detail
- `admin.execom.tsx` — Execom members list
- `admin.execom.new.tsx` — Create execom member
- `admin.execom.$id.edit.tsx` — Edit execom member
- `admin.check-in.tsx` — Check-in page (lazy loaded)
- `admin.payments.tsx` — Payments overview

### Components

#### UI Primitives (shadcn/ui — ~25 files)
button, card, dialog, input, badge, table, select, dropdown-menu, sidebar, sheet, tabs, calendar, command, avatar, label, popover, separator, skeleton, sonner, status-badge, textarea, tooltip, chart, etc.

#### Admin Components
- `AdminSidebar.tsx` — Navigation sidebar (mobile-responsive)
- `AdminTopbar.tsx` — Top bar with user info
- `AdminGuard.tsx` — Client-side auth guard wrapper
- `PageTransition.tsx` — Framer Motion page transitions
- `CustomFieldBuilder.tsx` — Dynamic form field builder
- `CouponManager.tsx` — Coupon CRUD UI
- `KeyboardShortcuts.tsx` — Admin keyboard shortcuts

#### Public Components
- `Navbar.tsx` — Navigation bar (scroll-aware, glass effect, user menu)
- `Hero.tsx` — Home page hero section
- `Footer.tsx` — Site footer
- `Execom.tsx` — 495 lines. Home page execom section with custom rAF drag carousel physics
- `EventsShowcase.tsx` — 103 lines. Two independent rAF loops for marquee animations
- `WhatsHappening.tsx` — Upcoming events strip
- `FloatingIcons.tsx` — Animated floating icons
- `SocietyStrip.tsx` — Societies logo strip
- `ErrorBoundary.tsx` — React error boundary + RouteError component
- `FloatingAction.tsx` — Floating WhatsApp/social button
- `LoginModal.tsx` — Login prompt modal
- `EventCard.tsx` — Event card component

#### Feature Components
- `execom/ExecomClient.tsx` — 720 lines. Monolithic full execom directory with filters, search, modals
- `societies/SocietiesClient.tsx` — 821 lines. Monolithic societies page
- `register/RegisterPage.tsx` — 822 lines. Monolithic registration page with dynamic fields
- `ticket/TicketPage.tsx` — Ticket display
- `events/EventsPageClient.tsx` — Events page with detail modal

#### Event Sub-components
- `events/EventDetailModal.tsx` — 125 lines. Modal showing event details (no focus trap, no aria)
- `events/AnnotatedEventCard.tsx` — Card variants
- `events/EventHeroSection.tsx` — Events page hero
- `events/EventListSection.tsx` — Events list with loading/error states

### Feature Admin Pages (~15 files)
- `OverviewClient.tsx` — 486 lines. Dashboard with charts, stats summary, recent registrations table
- `EventsTableClient.tsx` — Events CRUD table
- `RegistrationsClient.tsx` — Registrations table with filters
- `ExecomPage.tsx`, `ExecomEditPage.tsx`, `ExecomNewPage.tsx` — Execom management
- `SocietiesContent.tsx`, `SocietyEditPage.tsx`, `SocietyNewPage.tsx` — Society management
- `EventForm.tsx`, `EventEditPage.tsx`, `EventDetailClient.tsx` — Event forms
- `UsersContent.tsx`, `UserDetailPage.tsx` — User management
- `PaymentsContent.tsx` — Payment tracking
- `CheckInPage.tsx` — QR check-in

### Styles
- `globals.css` — 1059 lines. Tailwind v4 + CSS custom properties for shadcn/ui + editorial utility classes + animations

## Existing Audit (COMPREHENSIVE-AUDIT.md)

An 8-pass audit was already done finding 235+ issues:

### Critical (11)
1. Webhook doesn't set paymentStatus: 'paid' — replay attacks
2. Race conditions in confirmRegistration/cancelRegistration/checkInRegistration — double-counting
3. PII exposed on /api/ticket/$ticketId without auth
4. Missing role field migration for users collection — auth broken on fresh deploy
5. (7 more data model issues)

### High (49)
- No rate limiting, missing CSP/security headers, no CSRF tokens, weak logout CSRF, error leaks PB schema
- rAF loops wasting CPU, missing fields filters on admin APIs, N+1 queries
- Dual API architecture, god functions, no data layer, tight framework coupling, leaky PB casts
- 8 admin routes with identical boilerplate, Record<string, unknown> casts everywhere
- DragCarousel custom rAF physics over-engineering, ExecomClient monolith (720 lines)
- No focus traps/ARIA on ANY modal, no keyboard navigation, no prefers-reduced-motion

### Medium (70)
- Various type safety, consistency, redundancy, over-engineering, data model, and UI issues

## Security Model

### Auth Flow
1. User clicks Sign In → GET /api/auth/init → redirects to Google OAuth URL, sets signed provider cookie (PKCE)
2. Google redirects to /api/auth/callback/google → validates state cookie, exchanges code for token
3. Auth cookie set via PB's authStore.exportToCookie (__Host-pb_auth in production)
4. AuthProvider on client calls /api/auth/me periodically to check session
5. Logout clears cookie, CSRF via origin check

### Admin Auth
- beforeLoad on /admin route calls checkAdminAccess() (createServerFn)
- AdminGuard wraps layout client-side
- Server functions use adminLoader() which calls requireRole(["admin", "chair"])
- API routes use authenticateAdmin() or requireRole() directly
- Chair scope enforced per-query via chair-scope.ts (scopeEventFilter, scopeRegistrationFilter, etc.)

### CSRF
- verifySameOrigin() used on some mutation endpoints (not all)
- Origin comparison via URL.origin (exact match, not substring)
- No CSRF tokens

### Weaknesses
- No CSP, HSTS, X-Frame-Options headers on app responses (Caddy handles them optionally, commented out by default)
- Some admin lazy routes have no beforeLoad or server-side auth in route loader
- No rate limiting anywhere
- Error responses leak PocketBase field names
- createAdminPB() creates global superuser context
- OAuth state not cryptographically bound to session (signed cookie but uses PUBLIC_APP_URL as dev fallback)

## Known Technical Debt

### Architecture
1. **Dual API layer** — Both createServerFn and REST handlers for overlapping functionality
2. **No data layer** — Raw PB queries in 20+ files, no repository pattern
3. **God functions** — createRegistration (109 lines, 9 responsibilities), getAdminDashboard (126 lines)
4. **Tight framework coupling** — TanStack Start + PB SDK everywhere
5. **Leaky PB abstractions** — Record<string, unknown> casts in 15+ files

### Code Quality
1. Pervasive Record<string, unknown> casting instead of typed PB queries
2. 3 different error handling patterns
3. Mixed export styles (React.FC vs function vs default)
4. No semicolon consistency
5. Props-in-state antipattern in 3 components
6. Math.random() for IDs instead of crypto.randomUUID()
7. Phantom fields queried from PB that don't exist in schema

### Over-Engineering
1. DragCarousel with custom rAF physics engine for 12 cards (155 lines) — Framer Motion `drag="x"` would work
2. EventsShowcase uses two rAF loops — CSS @keyframes would be GPU-composited
3. 3-retry loops with exponential backoff for a counter on a student site
4. validateAndApplyCoupon 3-retry loop with 5ms/10ms/15ms backoff
5. Cookie signing dev fallback uses PUBLIC_APP_URL (publicly known)

### Performance
1. rAF loops run unconditionally, even offscreen
2. Missing fields filters on admin APIs (3-5x response bloat)
3. N+1 queries for society/user counts
4. 12 individual count queries on dashboard
5. No React.memo on large lists
6. Both radix-ui AND @base-ui/react in deps (competing headless UI libs)
7. 4 font packages loaded (2 sans-serif variable fonts)
8. `next-themes` in deps (Next.js-only, unused)

### Data Model
1. Phantom fields: short_title, event_type, category
2. Missing fields: whatsappLink on Event, defaultWhatsappLink on Society, role on users
3. No canonical Registration interface — 6+ local variants
4. Denormalized counters can drift with no reconciliation
5. No undo check-in path
6. created vs createdAt / updated vs updatedAt mismatch

### Security (All findings from audit)
- See COMPREHENSIVE-AUDIT.md for full list

### Frontend/UI (All findings from audit)
- See COMPREHENSIVE-AUDIT.md for full list

## What to audit
Go through every file, every pattern, every decision. Your analysis should cover:

1. **Architecture** — Is this the right framework/pattern for this use case? Would a simpler approach work? Is the dual API layer a real problem?
2. **Framework choice** — Is TanStack Start appropriate for a college event management site? What are the tradeoffs vs Next.js, Remix, or a simpler SPA?
3. **Code quality** — Is the code maintainable? What patterns need fixing?
4. **Over-engineering** — Where are we doing too much for the actual need?
5. **Redundancy** — What's duplicated that shouldn't be?
6. **Security** — What are the real risks vs theoretical?
7. **Data model** — Schema design issues, migration gaps
8. **Performance** — Real bottlenecks vs premature optimization
9. **Testing** — Coverage, quality, gaps
10. **Accessibility** — Real vs cosmetic issues
11. **Dependencies** — What's unnecessary or risky?
12. **Infrastructure** — Docker, Caddy, deployment

For each issue, give:
- Severity rating (Critical/High/Medium/Low/Info)
- Concrete evidence (file:line)
- Why it matters
- How to fix it (specific, actionable)

Then produce a **prioritized remediation plan** with phases.

You can use the web to research best practices, compare frameworks, and validate your recommendations.
