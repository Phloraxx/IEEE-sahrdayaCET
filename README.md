<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya Event Management System" src="https://github.com/Phloraxx/Ieee/blob/6bc94e41dd156cfb25c4eaa1434fb0de8415f7ca/public/web.png" />

# IEEE Sahrdaya Event Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.23.x-BB2B2B?style=flat-square&logo=pocketbase)](https://pocketbase.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-003B57?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Complete event management platform for IEEE Sahrdaya Student Branch**  
Migrated from Payload CMS to PocketBase — self-hosted on Dokploy.

[Live Site](https://ieeesahrdaya.com) • [Documentation](#documentation) • [Quick Start](#quick-start)

</div>

---

## Status

| | |
|---|---|
| **Backend** | PocketBase 0.23.x (embedded SQLite, single binary) |
| **Admin routes** | `/admin/*` protected by PB auth + role check |
| **Typecheck** | `tsc --noEmit` clean |
| **Hosting** | Dokploy VPS (Next.js app + PocketBase DB sidecar) |

---

## Overview

The IEEE Sahrdaya Event Management System is a comprehensive platform for managing technical events, workshops, hackathons, and symposiums organized by the IEEE Sahrdaya Student Branch and its 15 technical societies.

Built on **Next.js 16** with **PocketBase** as the backend (embedded SQLite, single binary, built-in auth + file storage). Self-hosted on **Dokploy**.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Event Discovery** | Browse upcoming events filtered by society, date, and category |
| **Google Auth** | Sign in with Google via PB OAuth2 — no passwords |
| **Multi-Society Support** | 14 societies with independent management via chair roles |

---

## Architecture

```
                      Internet
                          │
                ┌─────────┴──────────┐
                │    Dokploy VPS     │
                └─────────┬──────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
  ┌───────┴───────┐        ┌─────────────┴──────────┐
  │  ieee-app     │ calls  │  db.phloraxx.us.to     │
  │  Container 1  │───────→│  Container 2           │
  │               │        │                        │
  │  Next.js 16   │        │  PocketBase 0.23.x     │
  │  (standalone) │        │  (embedded SQLite)     │
  │               │        │                        │
  │  / → Frontend │        │  /api/** — REST API    │
  │  /admin → App │        │  /_/ — Admin UI        │
  │  /api → Proxy │        │  pb_hooks/ — JS hooks  │
  │  (to PB/DDM)  │        │                        │
  └───────┬───────┘        └────────────────────────┘
          │
  ┌───────┴───────┐
  │  ddm-api      │
  │  Container 3  │
  │               │
  │  Fastify      │
  │  pay.mulearn- │
  │  scet.in      │
  │               │
  │  /ticket      │
  │  /status      │
  │  /webhook     │
  └───────────────┘
```

---

## Admin Panel

### Bento Admin Dashboard (`/admin`)

Custom Next.js admin homepage with live stats, quick actions, and live/upcoming/recent events. Built as a bento grid:

| Region | Content |
|--------|---------|
| **Hero card** (2fr) | Greeting + user name, live metric strip (X live · Y upcoming · Z registered today), gradient glow backdrop |
| **Quick Actions card** (1fr) | Create event, Add execom, Upload media, Invite user (4 stacked buttons) |
| **4-up stat row** | Total events, societies, execom, registrations (with count-up animation) |
| **Happening now** | Up to 2 live event cards (date ≤ now ≤ endDate) with progress bars |
| **Upcoming** | Next 4 events within 30 days, capacity bars (green <70%, amber 70–90%, red >90%), society chips |
| **Recently completed** | Last 5 events within 7 days, registration counts |

The default collections listing is intentionally not on the admin homepage — bento sections link directly to filtered views.

### Per-Event Dashboard (`/admin/event-dashboard/:id`)

Server-rendered entry point, client-rendered table for interactivity.

- **4 KPI cards**: registered, checked-in, capacity, revenue
- **Registrations table** (client): inline check-in toggle, status dropdown, optimistic updates via `useOptimistic` + `useTransition`
- **Server actions** for check-in and status changes (re-verify chair access on every action)
- **CSV export** via `GET /api/admin/events/[id]/registrations.csv`
- **Empty states**: missing id, not found, no access, chair of wrong society — each with a back-link CTA

Three access points:

1. Event card on `/admin` (Homepage hero/upcoming/recent rows)
2. `EventDashboardCard` rendered after the events list on `/admin/collections/events`
3. Direct URL `/admin/event-dashboard/{id}`

### Branding

- **Theme**: Light theme with primary `#635BFF` (Stripe purple)
- **Logo**: Inline SVG (diamond + "Sahrdaya SB" wordmark)
- **Favicon**: `public/favicon.svg` with `prefers-color-scheme` color switching

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
| **PocketBase 0.23+** | Backend — embedded SQLite, built-in auth, file storage, REST API |
| **SQLite** | Embedded database (zero infra) |
| **Next.js 16** | React framework — App Router, server components, API routes |
| **Tailwind CSS 3.4** | Styling |
| **Framer Motion** | Page transitions, animations |
| **Nodemailer** | Transactional email (SMTP) — receipts, confirmations |
| **Lucide React** | Icons |

---

## Project Structure

```
ieee-sahrdaya/
├── src/
│   ├── app/
│   │   └── (main)/                          # Public pages (home, events, execom)
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
│   │   │   ├── auth/                        # OAuth2 init, callback, me, logout
│   │   │   ├── society/[slug]/              # GET: society detail + events + execom
│   │   │   └── admin/                       # Admin-only API
│   │   │       ├── stats/                   # GET: aggregate queries
│   │   │       └── events/dashboard/        # GET: live + upcoming + recent
│   │   ├── globals.css                      # Tailwind directives
│   │   └── layout.tsx                       # Root layout (metadata only)
│   │
│   ├── components/                          # React components
│   │   ├── Hero, Navbar, Footer, EventCard, Execom, EventsShowcase
│   │   ├── SocietiesClient, ExecomClient
│   │   ├── LoginModal, GoogleLoginButton, WhatsHappening
│   │   ├── FloatingAction, FloatingIcons, GridBackground
│   │   ├── ErrorBoundary, SocietyStrip, TechnicalDetails
│   │   ├── events/                          # EventHeroSection, EventListSection, EventDetailModal
│   │
│   ├── lib/                                 # Shared utilities
│   │   ├── api.ts                           # apiFetch() + ApiError + buildQueryString()
│   │   ├── auth.ts                          # requireAuth() + AuthError
│   │   ├── coupons.ts                       # applyCoupon()
│   │   ├── api.ts                           # apiFetch() + ApiError
│   │   ├── auth.ts                          # requireAuth() + AuthError
│   │   ├── constants.ts                     # APP_URL
│   │   ├── dates.ts                         # Date formatting utilities
│   │   ├── logger.ts                        # Structured error logging
│   │   ├── pb.ts                            # PocketBase client factories
│   │   ├── pb-filter.ts                     # Filter value escaper
│   │   ├── qr.ts                            # QR code generation
│   │   ├── csv.ts                           # CSV escaping
│   │   ├── csv-export.ts                    # CSV generation
│   │   ├── auth-context.tsx                 # Client-side auth context
│   │   ├── ticketStatus.ts                  # Ticket badge logic
│   │   └── dates.ts                         # 11 date formatters
│   │
│   ├── types/                               # Single source of truth for types
│   │   └── index.ts                         # Event, Society, AuthUser, Member, etc.
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
├── scripts/
│   ├── migrate-to-pb.ts                     # SQL dump → PocketBase migration (societies + execom)
│   ├── migrate-events.ts                    # Events migration with banner downloads
│   └── fix-execom-order.ts                  # Re-order execom members sequentially
│
├── pb_hooks/                                # PocketBase server-side JS hooks
│   ├── registrations.pb.js                  # Validates event capacity, dedupe, auto-confirm free
│   ├── registrations_confirm.pb.js          # Generates TKT- ticket IDs, sets checkedInAt
│   └── events.pb.js                         # Auto-closes on soft delete
│
├── ...
├── public/
├── ...
├── .env.example                             # Env vars template
├── next.config.mjs                          # Next.js + remotePatterns (ImgBB, Appwrite)
├── tailwind.config.js                       # Tailwind 3.4
├── postcss.config.mjs                       # PostCSS
├── vitest.config.ts                         # Vitest unit tests
├── playwright.config.ts                     # Playwright e2e tests
├── Dockerfile                               # Node 22 multi-stage, BuildKit caching
├── docker-compose.yml                       # 3-replica cluster with Caddy reverse proxy
├── Caddyfile                                # HTTPS, compression, caching, LB
├── plan.md                                  # Migration & development progress
├── package.json
└── README.md
```

---

## Collections

PocketBase provides the REST API for all collections. Managed via PB Admin UI or the migration script (`scripts/migrate-to-pb.ts`).

| Collection | Type | Purpose |
|---|---|---|---|
| **users** | Auth | Built-in auth collection — Google OAuth, roles (admin/chair/user) |
| **societies** | Base | 14 IEEE technical societies with logos/banners, display ordering |
| **execom** | Base | Executive committee members per society, photos, social links |
| **events** | Base | Workshops, hackathons, seminars — with dynamic JSON form templates |

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/init` | — | OAuth2 init — returns PB Google auth URL |
| GET | `/api/auth/callback/google` | — | OAuth2 callback — manual code exchange, sets PB auth cookie |
| GET | `/api/auth/me` | cookie | Returns current user from PB |
| POST | `/api/auth/logout` | cookie | Clears PB auth cookie |
| GET | `/api/society/[slug]` | — | Society detail + events + execom members (one round-trip) |
| GET | `/api/admin/stats` | admin | PB aggregate queries (dashboard KPIs) |
| GET | `/api/admin/events/dashboard` | admin | Live/upcoming/recent events for dashboard |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|---|
| `POCKETBASE_URL` | Yes | PocketBase server URL (e.g. `https://db.phloraxx.us.to`) |
| `POCKETBASE_SUPERUSER_TOKEN` | Yes | PB superuser token for admin API calls |
| `PAYMENT_API_URL` | Yes | DDM payment gateway URL |
| `PAYMENT_WEBHOOK_SECRET` | Yes | Webhook shared secret |
| `SMTP_HOST` | No | SMTP server for transactional email |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the app (e.g. `https://ieeesahrdaya.com`) |
| `PB_ADMIN_EMAIL` | For migration | PB admin email (used by `migrate-to-pb.ts` and `migrate-events.ts`) |
| `PB_ADMIN_PASSWORD` | For migration | PB admin password |
| `GOOGLE_CLIENT_ID` | For OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | Google OAuth client secret |

See `.env.example` for defaults.

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
git checkout main

# Install dependencies
npm install --legacy-peer-deps

# Copy environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# Build and start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the frontend.  
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin dashboard.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Build for production (standalone output) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run migrate:pb` | Run migration (societies + execom) from SQL dump |
| `npm run migrate:events` | Run events migration from SQL dump (with banner downloads) |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Vitest watch mode |

---

## Authentication & Roles

The system uses **Google OAuth only** — no email/password, no passkeys, no forgot/reset password. The OAuth flow uses PocketBase's built-in auth with manual code exchange via a custom Next.js route.

| Role | Access |
|------|--------|
| **Guest** | Browse events, societies, execom |
| **User** | Register for events, view tickets |
| **Chair** | Manage own society's events, registrations |
| **Admin** | Full admin dashboard access |

Roles are stored on the PocketBase user record in a `role` field.

### Chair Access Matrix

| Collection | Create | Read | Update | Delete |
|---|---|---|---|---|---|---|
| **Events** | chair/admin | public | chair-of-society | chair-of-society |
| **Execom** | admin only | public | chair-of-society | admin only |
| **Societies** | admin only | public | admin only | admin only |

---

## Deployment

### Docker Compose (Self-Hosted / VPS)

A production-grade `docker-compose.yml` is provided with:

- **3 Next.js replicas** behind Caddy reverse proxy with automatic HTTPS
- **BuildKit caching** — `npm` and `Next.js` build caches persisted via registry cache mounts
- **Health checks** on all services
- **Rolling updates** — zero-downtime deployment with `start-first` strategy
- **Caddyfile** — compression, security headers, immutable static asset caching (1 year), round-robin load balancing

```bash
# Start the cluster
docker compose up -d --build

# Scale replicas
docker compose up -d --scale app=5
```

PocketBase runs separately at `db.phloraxx.us.to` (external to the compose stack).

### Dokploy (Alternative)

```bash
# Container 1: ieee-app
# Dockerfile uses Node.js 22 multi-stage with BuildKit mount cache

# Container 2: PocketBase
# Running at db.phloraxx.us.to

# Container 3: ddm-api
# Deployed at pay.mulearnscet.in (Fastify + SQLite)
```

### Domain Setup

- Frontend + Admin: `https://ieeesahrdaya.com`
- PocketBase: `https://db.phloraxx.us.to`
- DDM API: `https://pay.mulearnscet.in`
- Google OAuth redirect URI: `https://ieeesahrdaya.com/api/auth/callback/google`

---

## Known Issues

| Issue | Status | Notes |
|---|---|---|---|---|---|
| `EventCard` dedup | Open | `src/components/EventCard.tsx` vs `components/events/EventCard.tsx` — different designs |
| `console.error` in production code | Open | 7+ catch blocks log to console; should use structured logging |
| `src/lib/pb.ts` superuser fallback | Open | `createPB()` falls back to superuser token when no cookie; read-only SSR pages only, but needs audit |
| Filter injection (7+ routes) | Deferred | String interpolation in PB filter params — single quote breaks filter |
| Node.js ECONNRESET on Windows | Known | Node.js fetch to PB server fails on Windows; `NODE_OPTIONS=--no-network-family-autoselection` workaround |
| Registration UI removed | Resolved | Frontend registration flow (forms, payment, tickets) removed for redesign |
| Payload CMS artifacts | Resolved | `data/payload.db*`, `scripts/fix-admin.ts`, `scripts/check-user.mjs`, `DATABASE_URL` in `.env.example` — all cleaned |
| `tmp_login.json` credentials | Resolved | Removed, added to `.gitignore` |
| Hardcoded `BASE_URL` | Resolved | Consolidated into `src/lib/constants.ts` |
| Events migrated | Resolved | 29 events imported from SQL dump with 28 banners from external URLs |
| Societies + Execom migrated | Resolved | 14 societies, 89 execom members with photos and ordering fixed |

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
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

This platform serves 14 IEEE technical societies:

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
