<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya Event Management System" src="https://github.com/Phloraxx/Ieee/blob/6bc94e41dd156cfb25c4eaa1434fb0de8415f7ca/public/web.png" />

# IEEE Sahrdaya Event Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Payload CMS](https://img.shields.io/badge/Payload_CMS-3.x-00629B?style=flat-square&logo=payload)](https://payloadcms.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-003B57?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Complete event management platform for IEEE Sahrdaya Student Branch**  
Migrated from Appwrite to Payload CMS — self-hosted on Dokploy.

[Live Site](https://ieeesahrdaya.com) • [Documentation](#documentation) • [Quick Start](#quick-start) • [Migration Status](./plan.md)

</div>

---

## Status

| | |
|---|---|
| **Migration** | Complete — 15 societies, 94 execom, 29 events, 107 media assets live |
| **Tests** | 17/17 unit + 7 e2e passing |
| **Typecheck** | `tsc --noEmit` clean |
| **Admin routes** | `/admin`, `/admin/event-dashboard/:id`, all collection routes returning 200 |
| **Branch** | `feat/payload-migration` (vs. `main`) |
| **Net code change** | ~18,000 lines removed (Appwrite + Vercel/Cloudflare boilerplate) |

See [plan.md](./plan.md) for the full migration report.

---

## Overview

The IEEE Sahrdaya Event Management System is a comprehensive platform for managing technical events, workshops, hackathons, and symposiums organized by the IEEE Sahrdaya Student Branch and its 15 technical societies.

Built on **Next.js 16** with **Payload CMS v3** as the headless backend — replacing the previous Appwrite-based architecture. Self-hosted on **Dokploy** with **SQLite** (WAL mode) for zero-infrastructure simplicity.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Event Discovery** | Browse upcoming events filtered by society, date, and category |
| **Online Registration** | Custom JSON form builder per event with validation |
| **Digital Tickets** | QR code-based tickets delivered via email with PDF receipts |
| **Payment Integration** | UPI payment via DDM gateway with 2s polling |
| **Coupon Codes** | Percent or fixed discounts with usage limits and expiry |
| **Check-in Scanner** | QR scanning with mobile-friendly interface |
| **Email Automation** | Confirmation, receipts, and status updates via SMTP |
| **Society Chair Roles** | Society chairs manage their own events/registrations from admin |
| **Admin Panel** | White-labeled Payload CMS (Stripe-inspired) with custom dashboard |
| **Bento Admin Dashboard** | Custom `/admin` home with live stats, quick actions, live/upcoming/recent events |
| **Per-Event Dashboard** | `/admin/event-dashboard/:id` view with inline check-in + status changes + CSV export |
| **Grouped Sidebar** | Collapsible collections sidebar: Team, Events, Library, Users |
| **Theme-Aware Favicon** | Single SVG favicon with `prefers-color-scheme` switching |
| **Google Auth** | Sign in with Google via `payload-authjs` — no passwords |
| **Multi-Society Support** | 15 societies with independent management |
| **Race-Free Counters** | Drizzle `COALESCE + 1` for `registeredCount` / `checkedInCount` |
| **DB-Level Dedupe** | Unique index on `(user, event)` — returns 409 on duplicate |

---

## Architecture

```
                     Internet
                         │
               ┌─────────┴──────────┐
               │    Dokploy VPS     │
               │  ieeesahrdaya.com  │
               └─────────┬──────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
 ┌───────┴───────┐               ┌───────┴───────┐
 │  ieee-app     │   calls ───→  │  ddm-api      │
 │  Container 1  │               │  Container 2  │
 │               │               │               │
 │  Next.js 16   │               │  Fastify      │
 │  Payload CMS  │               │  SQLite       │
 │  SQLite (WAL) │               │  pay.mulearn- │
 │               │               │  scet.in      │
 │  / → Frontend │               │               │
 │  /admin → CMS │               │  POST /ticket │
 │  /api → REST  │               │  GET /status  │
 └───────────────┘               │  POST /webhook│
                                 └───────────────┘
```

### Payment Flow

```
User registers → POST /api/registrations
  │
  ├── Free event (price <= 0)
  │   └── beforeChange hook auto-confirms: paymentStatus='not_required', registrationStatus='confirmed'
  │       └── afterChange chain: incrementOnConfirm → sendConfirmation (QR + email)
  │
  └── Paid event
      ├── API route applies coupon (if any) → finalAmount
      ├── Order created → beforeChange hook → POST pay.mulearnscet.in/ticket (UPI QR)
      ├── User scans QR and pays via UPI app
      ├── Frontend polls GET /api/orders/:id every 2s
      └── DDM confirms → POST /api/orders/webhook
          └── propagatePaymentToRegistration hook:
              - sets registration.paymentStatus='paid', registrationStatus='confirmed'
              - afterChange chain → incrementOnConfirm → sendConfirmation (QR + email + PDF receipt)
```

---

## Admin Panel

The Payload admin is heavily customized for IEEE Sahrdaya branding and operations.

### Custom Homepage (`/admin`)

Registered via `admin.components.views.dashboard` (fully replaces Payload's default homepage). Built as a bento grid:

| Region | Content |
|--------|---------|
| **Hero card** (2fr) | Greeting + user name, live metric strip (X live · Y upcoming · Z registered today), gradient glow backdrop |
| **Quick Actions card** (1fr) | Create event, Add execom, Upload media, Invite user (4 stacked buttons) |
| **4-up stat row** | Total events, societies, execom, registrations (with count-up animation) |
| **Happening now** | Up to 2 live event cards (date ≤ now ≤ endDate) with progress bars |
| **Upcoming** | Next 4 events within 30 days, capacity bars (green <70%, amber 70–90%, red >90%), society chips |
| **Recently completed** | Last 5 events within 7 days, registration counts |

The default Payload "Collections" widget is intentionally not rendered — bento sections link directly to filtered collection views.

### Per-Event Dashboard (`/admin/event-dashboard/:id`)

A custom `AdminView` registered at `views.eventDashboard` (`/event-dashboard/:id`). Server-rendered entry point, client-rendered table for interactivity.

- **4 KPI cards**: registered, checked-in, capacity, revenue
- **Registrations table** (client): inline check-in toggle, status dropdown, optimistic updates via `useOptimistic` + `useTransition`
- **Server actions** for check-in and status changes (re-verify chair access on every action)
- **CSV export** via `GET /api/admin/events/[id]/registrations.csv`
- **Empty states**: missing id, not found, no access, chair of wrong society — each with a back-link CTA

Three access points:

1. Event card on `/admin` (Homepage hero/upcoming/recent rows)
2. `EventDashboardCard` rendered after the events list on `/admin/collections/events`
3. Direct URL `/admin/event-dashboard/{id}`

### Grouped Sidebar

Collections are grouped via `admin.group` on the collection config:

| Group | Collections |
|-------|-------------|
| **Team** | Societies, Execom |
| **Events** | Events, Registrations, Orders, Coupons |
| **Library** | Media |
| **Users** | Users |

The sidebar supports icon-only collapsed mode (uses Payload's `useNav()` for state, persisted in `payload.preferences.NAV`). Collection icons are CSS-only — `::before` + `mask-image` data URIs in `custom.css` (no React icon components, no `lucide-react` in admin config to avoid RSC serialization issues).

### Branding

- **Theme**: Single light theme, primary `#635BFF` (Stripe purple) at `--color-base-800`
- **Logo**: Inline SVG (diamond + "Sahrdaya SB" wordmark), `currentColor` for state
- **Favicon**: `public/favicon.svg` with `prefers-color-scheme` color switching, registered via `admin.meta.icons`
- **Header**: CSS-variable height override (`--app-header-height: 56px`) keeps `AppHeader` flex layout intact
- **Login page**: Custom `BeforeLogin` component with Stripe-style gradient mark

All Payload styles live in `@layer payload-default`. Custom CSS in `src/app/(payload)/custom.css` sits outside layers to win specificity.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS 3** | Utility-first styling (migrated from v4) |
| **Framer Motion** | Animations |
| **Lucide React** | Icon library (frontend only) |
| **GSAP** | Advanced animations |

### Backend & CMS

| Technology | Purpose |
|------------|---------|
| **Payload CMS 3.85** | Headless CMS — database, REST API, admin panel |
| **SQLite (WAL)** | Database (single file, no external DB server) |
| **Drizzle ORM** | Raw SQL for race-free counter increments + custom indexes |
| **Auth.js 5** | Google OAuth authentication |
| **payload-authjs** | Auth adapter bridging Auth.js ↔ Payload |
| **Nodemailer** | Email delivery via SMTP |

### Additional Libraries

| Library | Purpose |
|---------|---------|
| **@payloadcms/richtext-lexical** | Rich text editor |
| **@payloadcms/db-sqlite** | SQLite database adapter |
| **@payloadcms/email-nodemailer** | Email adapter |
| **qrcode** | QR code generation |
| **jspdf** | PDF receipt generation |
| **papaparse** | CSV export (per-event dashboard) |
| **react-hook-form + zod** | Registration form validation |
| **@zxing/browser + @zxing/library** | QR code scanning |
| **sharp** | Image processing (built into Payload) |

---

## Project Structure

```
ieee-sahrdaya/
├── src/
│   ├── app/
│   │   ├── (payload)/                       # Payload CMS admin panel
│   │   │   ├── admin/[[...segments]]/       # Admin UI pages
│   │   │   ├── admin/importMap.js           # Auto-generated component map (8 entries)
│   │   │   ├── api/[...slug]/               # Payload REST API catch-all
│   │   │   ├── custom.css                   # Admin white-labeling (Stripe-style)
│   │   │   └── layout.tsx                   # Payload admin layout
│   │   ├── (main)/                          # Frontend route group
│   │   │   ├── page.tsx                     # Homepage
│   │   │   ├── events/page.tsx              # Event listing
│   │   │   ├── societies/                   # Societies showcase
│   │   │   ├── full-execom/                 # Execom directory
│   │   │   ├── ticket/[ticketId]/           # Digital ticket page
│   │   │   ├── sitemap.ts                   # SEO sitemap
│   │   │   ├── layout.tsx                   # Frontend layout (fonts, session)
│   │   │   ├── error.tsx                    # Error page
│   │   │   └── not-found.tsx                # 404 page
│   │   ├── api/                             # Custom API routes
│   │   │   ├── auth/[...nextauth]/          # Auth.js handler
│   │   │   ├── registrations/               # POST: create registration + order
│   │   │   ├── orders/webhook/              # POST: DDM payment callback
│   │   │   ├── check-in/verify/             # POST: QR scan check-in
│   │   │   ├── events/[eventId]/export      # GET: CSV export
│   │   │   └── admin/                       # Admin-only API
│   │   │       ├── stats/                   # GET: 12 parallel counts
│   │   │       ├── events/dashboard/        # GET: live + upcoming + recent
│   │   │       └── events/[id]/registrations.csv/  # GET: per-event CSV
│   │   ├── globals.css                      # Tailwind directives
│   │   └── layout.tsx                       # Root layout (metadata only)
│   │
│   ├── components/                          # React components
│   │   ├── Hero, Navbar, Footer, EventCard, Execom, EventsShowcase
│   │   ├── SocietiesClient, ExecomClient
│   │   ├── EventRegistrationModal, PaymentModal, LoginModal
│   │   ├── DynamicRegistrationForm, TicketDisplay
│   │   ├── GoogleLoginButton, WhatsHappening
│   │   ├── JsonLd, FloatingAction, FloatingIcons
│   │   ├── SocietyStrip, TechnicalDetails, UrgencyTag, GridBackground
│   │   ├── PageTransition/                  # Transition wrapper
│   │   ├── events/                          # EventCard variant, EventDetailModal
│   │   └── tickets/                         # TicketCard, MyTicketsSection
│   │
│   ├── payload/
│   │   ├── collections/                     # 8 collections
│   │   │   ├── Users.ts, Media.ts, Societies.ts, Execom.ts
│   │   │   ├── Events.ts, Registrations.ts, Orders.ts, Coupons.ts
│   │   │   └── index.ts
│   │   ├── hooks/                           # Payload lifecycle hooks
│   │   │   ├── registrations.ts             # 4 exports (validate, increment×2, sendConfirmation)
│   │   │   └── orders.ts                    # 2 exports (createDdmTicket, propagatePayment)
│   │   ├── access/index.ts                  # 7 access helpers + 1 standalone fn
│   │   ├── admin/                           # White-labeled admin components
│   │   │   ├── BeforeLogin.tsx              # Custom login screen
│   │   │   ├── BeforeDashboard.tsx          # Bento grid custom homepage
│   │   │   ├── dashboard.css                # Bento styles (BEM)
│   │   │   ├── Logo.tsx, Icon.tsx           # Inline SVG branding
│   │   │   ├── components/
│   │   │   │   ├── EventDashboardCard.tsx   # Event card on /collections/events
│   │   │   │   └── event-dashboard-card.css
│   │   │   └── views/
│   │   │       ├── EventDashboard.tsx       # /event-dashboard/:id view
│   │   │       ├── EventRegistrationsTable.tsx  # Client table w/ useOptimistic
│   │   │       ├── actions.ts               # Server actions
│   │   │       └── event-dashboard.css
│   │   └── migrations/                      # Payload schema migrations
│   │       ├── 20260604_103004.ts           # Initial schema (7 custom indexes)
│   │       └── 20260604_132617.ts           # Add banner_url column
│   │
│   ├── lib/                                 # Shared utilities
│   │   ├── api.ts                           # apiFetch() + ApiError + buildPayloadQuery()
│   │   ├── auth.ts                          # requireAuth() + AuthError
│   │   ├── coupons.ts                       # applyCoupon()
│   │   ├── dates.ts                         # 11 date formatters
│   │   ├── qr.ts                            # generateQRBase64()
│   │   ├── pdfReceiptGenerator.ts           # jsPDF receipts
│   │   ├── ticketStatus.ts                  # Ticket badge logic
│   │   └── email/templates.ts               # HTML email templates
│   │
│   ├── types/                               # Single source of truth for types
│   │   ├── index.ts                         # Event, Society, EventWithSociety, etc.
│   │   └── registration.ts                  # FormTemplate, Registration, Ticket
│   │
│   └── hooks/                               # React hooks
│       ├── useEvents.ts                     # Event fetching with roundToMinute
│       └── useScrollLock.ts
│
├── tests/
│   ├── unit/
│   │   ├── hooks/validateRegistration.test.ts    # 9 tests
│   │   └── lib/coupons.test.ts                  # 8 tests
│   └── e2e/
│       ├── smoke.spec.ts                     # Public pages + admin login (5 tests)
│       └── register-flow.spec.ts             # Free event + validation (2 tests)
│
├── migration/
│   └── migrate-from-sql.ts                  # MariaDB dump → Payload
│
├── scripts/
│   ├── seed.ts                              # Dev-only demo data (guards on existing)
│   ├── backfill-event-banners.ts            # Backfill bannerUrl from SQL
│   ├── verify-admin.ts                      # Playwright visual verifier for admin
│   └── verify-societies.ts                  # Playwright visual verifier for societies
│
├── auth.config.ts                           # Auth.js configuration
├── auth.ts                                  # Auth.js handlers bridged via payload-authjs
├── payload.config.ts                        # Payload CMS configuration (7 custom indexes, custom admin views)
├── payload-types.ts                         # Auto-generated TypeScript types
├── next.config.mjs                          # Next.js + remotePatterns (ImgBB, Appwrite)
├── tailwind.config.js                       # Tailwind 3.4
├── postcss.config.mjs                       # PostCSS
├── vitest.config.ts                         # Vitest unit tests
├── playwright.config.ts                     # Playwright e2e tests
├── Dockerfile                               # Node 22 multi-stage, standalone
├── package.json
├── plan.md                                  # Full migration status report
└── README.md
```

---

## Collections

Payload CMS provides auto-generated REST API + Admin UI for all collections. The `admin.group` field on each collection determines which sidebar group it appears in.

| Collection | Slug | Sidebar Group | Purpose |
|------------|------|---------------|---------|
| **Media** | `media` | Library | Image uploads (auto-resized: thumbnail, card sizes) |
| **Users** | `users` | Users | Auth.js accounts with roles (admin / chair / student / user) |
| **Societies** | `societies` | Team | 15 IEEE technical societies with logos/banners |
| **Execom** | `execom` | Team | Executive committee members per society |
| **Events** | `events` | Events | Workshops, hackathons, seminars, competitions |
| **Registrations** | `registrations` | Events | Event sign-ups with payment tracking |
| **Orders** | `orders` | Events | DDM payment orders and webhook responses |
| **Coupons** | `coupons` | Events | Discount codes with percentage/fixed options |

### Custom Indexes (`payload.config.ts` afterSchemaInit)

- `events_status_idx`, `events_is_deleted_idx`, `events_date_idx`
- `registrations_registration_status_idx`, `registrations_payment_status_idx`
- `registrations_user_event_unique` (unique — enforces one registration per user per event)
- `orders_payment_status_idx`

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/[...nextauth]` | — | Auth.js handlers (Google OAuth) |
| POST | `/api/registrations` | session | Create registration + order, applies coupon, free/paid branches |
| POST | `/api/orders/webhook` | webhook secret | DDM payment callback, propagates to registration |
| POST | `/api/check-in/verify` | session | QR scan check-in, multi-location history |
| GET | `/api/events/[eventId]/export` | chair/admin | CSV export of registrations for an event |
| GET | `/api/admin/stats` | admin | 12 parallel `payload.count` queries (dashboard KPIs) |
| GET | `/api/admin/events/dashboard` | admin | 3 parallel `payload.find` (live + upcoming + recent) |
| GET | `/api/admin/events/[id]/registrations.csv` | chair/admin | Per-event CSV (consumed by per-event dashboard) |

---

## Environment Variables

Create a `.env.local` file with:

```env
# Payload CMS
PAYLOAD_SECRET=your-secret-here
DATABASE_URI=file:./data/payload.db

# Authentication (Auth.js)
AUTH_SECRET=your-auth-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
AUTH_URL=http://localhost:3000

# Auto-promote these emails to admin role (comma-separated)
# Note: fires on user CREATE only — for existing users, run a SQL update
ADMIN_EMAILS=admin@sahrdaya.ac.in

# DDM Payment Gateway
PAYMENT_API_URL=https://pay.mulearnscet.in/api
PAYMENT_WEBHOOK_SECRET=your-webhook-secret

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_UPI_ID=your-upi-id
NEXT_PUBLIC_MERCHANT_NAME=IEEE Sahrdaya SB
CORS_ORIGINS=https://ieeesahrdaya.com
```

### Manually Promoting an Existing User to Admin

`ADMIN_EMAILS` only fires on user creation. To promote an existing user:

```bash
sqlite3 data/payload.db "UPDATE users SET role = 'admin' WHERE email = 'user@example.com';"
```

---

## Quick Start

### Prerequisites

- **Node.js** 22.x or higher
- **npm** 10.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/ieee-sahrdaya/website.git
cd website

# Switch to migration branch
git checkout feat/payload-migration

# Install dependencies
npm install --legacy-peer-deps

# Copy environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# Build and start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the frontend.  
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the Payload admin panel.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Build for production (standalone output) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run payload` | Run Payload CLI commands |
| `npm run migrate` | Run SQL migration from Appwrite dump |
| `npm run migrate:safe` | Run Payload migrations + SQL migration |
| `npm run seed` | Seed dev-only demo data (skips if societies exist) |
| `npm test` | Run Vitest unit tests (17 tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:ui` | Vitest with UI |
| `npm run test:e2e` | Run Playwright e2e tests (headless) |
| `npm run test:e2e:headed` | Playwright with browser UI |

---

## Authentication & Roles

The system uses **Google OAuth only** — no email/password, no passkeys, no forgot/reset password. Auth.js is bridged into Payload via the `payload-authjs` plugin (so Payload's `req.user` and access helpers see the same user record).

| Role | Access |
|------|--------|
| **Guest** | Browse events, societies, execom |
| **User** | Register for events, view tickets |
| **Student** | Same as user — distinction for IEEE Sahrdaya student members |
| **Chair** | Manage own society's events, registrations, coupons |
| **Admin** | Full Payload admin panel access |

The user `sourav223929@sahrdaya.ac.in` is configured as the initial admin (promoted via direct SQL — see [Manually Promoting an Existing User to Admin](#manually-promoting-an-existing-user-to-admin)). Additional admins can be configured via the `ADMIN_EMAILS` env var, but only on first Google sign-in.

### Chair Access Matrix

| Collection | Create | Read | Update | Delete |
|---|---|---|---|---|
| **Events** | chair/admin | public | chair-of-society | chair-of-society |
| **Registrations** | — (auto on user submit) | chair/admin (filtered) | chair-of-society | admin only |
| **Coupons** | chair/admin | chair/admin | chair-of-society | chair-of-society |
| **Execom** | admin only | public | chair-of-society | admin only |
| **Societies** | chair/admin | public | chair/admin | admin only |

---

## Deployment

### Dokploy (Recommended)

The project is designed for Dokploy deployment with two containers:

```bash
# Container 1: ieee-app
# Dockerfile uses Node.js 22 multi-stage build
# Persistent volume at /app/data for SQLite database
# Environment variables configured in Dokploy dashboard

# Container 2: ddm-api
# Deployed separately at pay.mulearnscet.in
# Fastify + SQLite + TypeScript
```

1. Push to GitHub repository
2. Connect repository in Dokploy
3. Configure environment variables (from `.env.local`)
4. Set up persistent volume for `/app/data`
5. Deploy

### Domain Setup

- Frontend + Admin: `https://ieeesahrdaya.com`
- DDM API: `https://pay.mulearnscet.in`
- Google OAuth redirect URI: `https://ieeesahrdaya.com/api/auth/callback/google`

---

## Known Issues

| Issue | Status | Notes |
|---|---|---|
| `EventCard` dedup | Open | Root-level `src/components/EventCard.tsx` vs `src/components/events/EventCard.tsx` — different designs, both in use |
| `TicketDisplay` + `tickets/TicketCard` overlap | Open | Could merge into single component with variants |
| Execom data layer | Open | `Execom.tsx` and `ExecomClient.tsx` fetch same API independently |
| `Navbar`/`Footer` not in root layout | Open | Homepage needs fixed hero, Societies conditionally hides navbar |
| `sass` devDependency | Open | Required by `@payloadcms/ui` internally |
| SSR opportunities | Open | Most components are `'use client'` — works but could be faster |
| `next-auth` peer dep warning with Next.js 16 | Known | `--legacy-peer-deps` during install, works at runtime |
| `@emnapi/runtime` extraneous in npm ls | Harmless | Transitive dep hoisting |
| `EventCard` + `EventDetailModal` use plain `<img>` for some banners | By design | External URLs use plain `<img>`; only `next/image` needs hostname config |
| 7 orphaned images in `public/Events/` | Intentional | Unmatched by SQL title; left in place for future uploads |
| 6 faculty records have wrong photo attachments | Intentional | Matches Appwrite export; user said "keep as is" |
| 2 events missing banner URLs | Intentional | "test" + duplicate-title "Machine Learning Workshop" couldn't be backfilled |
| `ADMIN_EMAILS` only fires on user CREATE | By design | Use SQL to promote existing users (see [Environment Variables](#environment-variables)) |
| Empty `src/app/api/admin/registrations/[id]/` dir | Harmless | Leftover folder; can be deleted |

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [Migration Status](./plan.md) | Developers | Complete migration report: PRs shipped, hooks, indexes, migration stats |
| `docs/SETUP_GUIDE.md` | DevOps | Complete setup from scratch *(coming soon)* |
| `docs/API_DOCUMENTATION.md` | Developers | Complete API reference *(coming soon)* |
| `docs/ADMIN_GUIDE.md` | Society Chairs | Managing events and registrations *(coming soon)* |

---

## Contributing

We welcome contributions from the IEEE Sahrdaya community!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run linting: `npm run lint`
5. Ensure typecheck passes: `npx tsc --noEmit`
6. Ensure unit tests pass: `npm test`
7. Commit: `git commit -m 'feat: add amazing feature'`
8. Push: `git push origin feature/amazing-feature`
9. Open a Pull Request to `main`

### Commit Convention

We use conventional commits:

```
feat(events): add bulk registration export
fix(auth): handle expired session gracefully
docs(api): document check-in endpoints
```

---

## Societies

This platform serves 15 IEEE technical societies:

| Society | Slug | Society | Slug |
|---------|------|---------|------|
| Computer Society | `cs` | Robotics & Automation | `ras` |
| Women in Engineering | `wie` | Industry Applications | `ias` |
| Power & Energy | `pes` | SIGHT | `sight` |
| Engineering in Medicine & Biology | `embs` | Signal Processing | `sps` |
| Circuits and Systems | `cas` | Communication | `css` |
| Education | `edsoc` | Industrial Electronics | `ies` |
| Nuclear & Plasma Sciences | `npss` | Photonics | `ps` |

---

## License

© 2024-2026 IEEE Sahrdaya Student Branch. All rights reserved.

This is proprietary software. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

---

<div align="center">

**Built by IEEE Sahrdaya Student Branch**

[Website](https://ieeesahrdaya.com) • [Instagram](https://instagram.com/ieee-sahrdaya) • [LinkedIn](https://linkedin.com/company/ieee-sahrdaya)

</div>
