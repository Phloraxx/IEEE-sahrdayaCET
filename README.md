<div align="center">

# IEEE Sahrdaya Event Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.39.1-BB2B2B?style=flat-square&logo=pocketbase)](https://pocketbase.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Event management platform for IEEE Sahrdaya Student Branch**  
Next.js 16 frontend + PocketBase 0.39.1 backend, self-hosted on Dokploy.

[Live Site](https://ieeesahrdaya.com) • [Quick Start](#quick-start)

</div>

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Server Components, API routes) |
| UI | React 19, Tailwind CSS 3, Framer Motion, Lucide |
| Backend | PocketBase 0.39.1 (embedded SQLite, built-in auth, file storage, REST API) |
| Auth | Google OAuth2 via PocketBase |
| Payments | DDM API (`pay.mulearnscet.in`) |
| Hosting | Dokploy VPS (Docker Compose with Caddy reverse proxy) |

---

## Project Structure

```
src/
├── app/
│   ├── (main)/              # Public pages (home, events, societies, execom, tickets)
│   ├── admin/                # Admin dashboard (bento grid, per-event dashboards)
│   ├── api/                  # Custom API routes (auth, society/[slug], admin/*)
│   ├── auth/                 # Login page
│   └── globals.css
├── components/               # React components
├── lib/                      # Utilities (pb.ts, auth.ts, logger, dates, etc.)
├── types/                    # TypeScript interfaces
└── hooks/                    # React hooks

pb_hooks/                     # PocketBase JS hooks (registration validation, ticketing)
scripts/                      # Migration scripts (SQL dump → PB)
```

### Key `src/lib/` utilities

| File | Purpose |
|------|---------|
| `pb.ts` | PocketBase client factories + `pbFetch()` helper (8s timeout wrapper) |
| `auth.ts` | `requireAuth()` + `AuthError` for server-side auth |
| `auth-context.tsx` | Client-side auth context (React context + cookies) |
| `logger.ts` | Structured error logging |
| `dates.ts` | Date formatting utilities |
| `csv-export.ts` | CSV generation for event registrations |
| `pb-filter.ts` | PocketBase filter value escaper |

---

## Collections (PocketBase 0.39.1)

| Collection | Type | Purpose |
|------------|------|---------|
| **users** | Auth | Google OAuth, roles (admin/chair/user) |
| **societies** | Base | 14 IEEE technical societies with logos/banners |
| **execom** | Base | Executive committee members per society |
| **events** | Base | Workshops, hackathons, seminars |
| **registrations** | Base | Event registrations with check-in status |

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/init` | — | OAuth2 init — returns PB Google auth URL |
| GET | `/api/auth/callback/google` | — | OAuth2 callback — code exchange, sets PB auth cookie |
| GET | `/api/auth/me` | cookie | Current user from PB |
| POST | `/api/auth/logout` | cookie | Clears PB auth cookie |
| GET | `/api/society/[slug]` | — | Society detail + events + execom members |
| GET | `/api/admin/stats` | admin | Dashboard KPI aggregates |
| GET | `/api/admin/events/dashboard` | admin | Live/upcoming/recent events |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POCKETBASE_URL` | Yes | PB server URL (e.g. `https://db.phloraxx.us.to`) |
| `POCKETBASE_SUPERUSER_TOKEN` | Yes | PB superuser token for admin API calls |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL (e.g. `https://ieeesahrdaya.com`) |
| `PAYMENT_API_URL` | Yes | DDM payment gateway URL |
| `PAYMENT_WEBHOOK_SECRET` | Yes | Webhook shared secret |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | No | Transactional email (SMTP) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For OAuth | Google OAuth credentials |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | For migration | PB admin credentials for migration scripts |

See `.env.example` for defaults.

---

## Quick Start

```bash
git clone <repo-url> && cd ieee-sahrdaya
npm install
cp .env.example .env.local   # edit with your values
npm run dev                   # http://localhost:3000
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build (standalone) |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run migrate:pb` | Migrate societies + execom from SQL dump |
| `npm run migrate:events` | Migrate events with banner downloads |

---

## Auth & Roles

Google OAuth only (no email/password). Roles stored in PB user `role` field.

| Role | Access |
|------|--------|
| Guest | Browse events, societies, execom |
| User | Register for events, view tickets |
| Chair | Manage own society's events and registrations |
| Admin | Full admin dashboard |

---

## Deployment

```bash
docker compose up -d --build
```

Three containers: Next.js app (3 replicas, Caddy reverse proxy), PocketBase at `db.phloraxx.us.to`, DDM API at `pay.mulearnscet.in`.

Domains:
- Frontend + Admin: `https://ieeesahrdaya.com`
- PocketBase: `https://db.phloraxx.us.to`
- DDM API: `https://pay.mulearnscet.in`
- Google OAuth redirect: `https://ieeesahrdaya.com/api/auth/callback/google`

---

## Societies

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

© 2024-2026 IEEE Sahrdaya Student Branch. Proprietary — all rights reserved.

---

<div align="center">

[Website](https://ieeesahrdaya.com) • [Instagram](https://instagram.com/ieee-sahrdaya) • [LinkedIn](https://linkedin.com/company/ieee-sahrdaya)

</div>
