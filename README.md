<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya" src="./public/web.png" />

# IEEE Sahrdaya Student Branch

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.x-black?style=flat-square)](https://tanstack.com/start)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.39.1-BB2B2B?style=flat-square&logo=pocketbase)](https://pocketbase.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Event management platform for the 14 IEEE technical societies of Sahrdaya College of Engineering & Technology.**

[Live Site](https://ieeesahrdaya.com)

</div>

---

## Overview

The IEEE Sahrdaya Event Management System is a comprehensive platform for managing technical events, workshops, hackathons, and symposiums organized by the IEEE Sahrdaya Student Branch and its 14 technical societies.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Event Discovery** | Browse upcoming events with filters by society and date |
| **Online Registration** | Custom registration forms per event |
| **Digital Tickets** | QR code-based tickets |
| **Check-in System** | Real-time QR scanning with status tracking |
| **Email Automation** | Confirmations and updates |
| **Analytics Dashboard** | Registration stats and revenue tracking |
| **Multi-Society Support** | 14 societies with independent chair management |

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (file-based routes, server functions, SSR) |
| UI | React 19, Tailwind CSS 4, Framer Motion, shadcn/ui, Lucide |
| Backend | PocketBase 0.39.1 (embedded SQLite, built-in auth, file storage, REST API) |
| Auth | Google OAuth2 via PocketBase (roles: admin/chair/user) |

---

## Project Structure

```
src/
├── routes/                      # File-based dot-delimited routes (TanStack Start)
│   ├── __root.tsx               # Root route (HTML shell, AuthProvider, QueryClientProvider, head/SEO)
│   ├── index.tsx                # Home page (SSR)
│   ├── events.tsx               # Events listing (SSR)
│   ├── societies.tsx            # Societies listing (SSR)
│   ├── full-execom.tsx          # Full execom page (SSR)
│   ├── register.$eventId.tsx    # Event registration (CSR)
│   ├── ticket.$ticketId.tsx     # Ticket view (CSR)
│   ├── admin.tsx                # Admin layout (AdminGuard, sidebar, topbar)
│   ├── admin.*.tsx              # Admin pages (events, registrations, societies, users, execom, check-in, payments)
│   └── api/                     # Server function handlers
│       ├── auth/                #   OAuth2 init, callback, me, logout
│       ├── registrations.ts     #   GET (list user's), POST (register)
│       ├── events.*.ts          #   Event detail, CSV export, coupon validation
│       ├── check-in.verify.ts   #   QR check-in verification
│       ├── orders/webhook.ts    #   Payment webhook
│       └── admin/               #   Admin API handlers
├── features/                    # Feature-specific page components
│   ├── globals.css              # Tailwind v4 + CSS custom properties
│   ├── admin/                   # Admin page components
│   ├── events/                  # Event page components
│   └── ...
├── components/
│   ├── ui/                      # shadcn/ui primitives (button, dialog, table, card, form, etc.)
│   └── admin/                   # Admin UI (sidebar, guards, keyboard shortcuts)
├── lib/                         # Utilities (see below)
├── types/                       # Shared TypeScript interfaces
└── hooks/                      # React hooks (use-mobile)

Business logic lives in src/lib/registration-service.ts — there are no PocketBase hooks.
```

### Key `src/lib/` utilities

| File | Purpose |
|------|---------|
| `pb.ts` | PocketBase client factories: `createPB()`, `createAdminPB()`, `buildFileUrl()`, `escapeFilterValue()` |
| `auth.ts` | `requireAuth()`, `requireAdmin()`, `requireRole()`, `AuthError` for server-side auth |
| `chair-scope.ts` | Centralized chair scoping: `requireEventScope()`, `requireRegistrationScope()`, `scopeEventFilter()` |
| `registration-service.ts` | Business logic: create/confirm/cancel/checkIn, coupon validation, counter bumps (retry-on-conflict) |
| `auth-context.tsx` | Client-side auth context (React Context + cookie) |
| `api-error.ts` | Centralized error-to-Response mapping (`handleError()`) |
| `logger.ts` | Structured error logging (JSON in prod, console in dev) |
| `dates.ts` | Date formatting utilities (en-IN locale) |
| `csv-export.ts` | CSV generation with formula-injection protection |
| `ticketStatus.ts` | Ticket status label/color/icon mapping |
| `qr-utils.ts` | QR code generation and download |
| `webhook.ts` | Payment webhook body schema + idempotency guard |

---

## Collections

### `users` (Auth)
Google OAuth, roles (admin/chair/user).

### `societies` (Base)
| Field | Type |
|-------|------|
| `name` | text |
| `slug` | text (unique index) |
| `bio` | text |
| `logo` | file |
| `banner` | file |
| `chairs` | relation → users |

### `execom` (Base)
| Field | Type |
|-------|------|
| `name` | text |
| `position` | text |
| `department` | text |
| `batch` | text |
| `section` | text |
| `sectionId` | text (indexed) |
| `order` | number |
| `photo` | file |
| `linkedin` | url |
| `instagram` | url |
| `email` | email |
| `phone` | text |

### `events` (Base)
| Field | Type | Notes |
|-------|------|-------|
| `title` | text | |
| `description` | text (rich) | |
| `date` | date | |
| `endDate` | date | |
| `venue` | text | |
| `price` | number | |
| `status` | select | draft / published / completed |
| `society` | relation → societies | |
| `banner` | file | |
| `maxCapacity` | number | |
| `registrationOpen` | bool | |
| `registrationDeadline` | date | |
| `checkInEnabled` | bool | |
| `isDeleted` | bool | |
 | `registeredCount` | number | Maintained by `registration-service.ts` |
 | `checkedInCount` | number | Maintained by `registration-service.ts` |
 | `formTemplate` | json | |
| `tags` | text | |

Indexes: `(status, date)`, `(date, endDate)`, `(society)`

### `registrations` (Base)
| Field | Type | Notes |
|-------|------|-------|
| `user` | relation → users | |
| `event` | relation → events | |
| `userName` | text | |
| `userEmail` | email | |
| `userPhone` | text | |
| `formResponses` | json | |
| `paymentStatus` | select | pending / paid / failed / not_required |
| `registrationStatus` | select | pending / confirmed / cancelled |
 | `ticketId` | text | Generated by `registration-service.ts` |
| `paymentTicketId` | text | Used by payment webhook |
| `amount` | number | |
| `registrationDate` | date | |
| `checkedIn` | bool | |
| `checkedInAt` | date | |
| `paymentData` | json | Raw webhook payload |

Indexes:
- `(ticketId)` UNIQUE
- `(user, event)` UNIQUE
- `(event)`, `(paymentTicketId)`, `(registrationStatus)`
- `(event, ticketId)`, `(event, paymentTicketId)`

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/init` | — | OAuth2 init — returns PB Google auth URL |
| GET | `/api/auth/callback/google` | — | OAuth2 callback — code exchange, sets PB auth cookie |
| GET | `/api/auth/me` | cookie | Current user from PB |
| POST | `/api/auth/logout` | cookie | Clears PB auth cookie |
| GET | `/api/registrations` | cookie | User's registrations (optional `?eventId=` filter) |
| POST | `/api/registrations` | cookie | Register for an event |
| PATCH | `/api/registrations/[id]` | cookie | Update registration (payment status etc.) |
| GET | `/api/society/[slug]` | — | Society detail + events + execom members |
| POST | `/api/check-in/verify` | chair/admin | Verify and mark check-in |
| POST | `/api/orders/webhook` | webhook secret | Payment status webhook |
| GET | `/api/events/[eventId]/export` | chair/admin | CSV export of registrations |
| GET | `/api/admin/registrations.csv/[id]` | chair/admin | CSV export (admin format) |
| GET | `/api/admin/stats` | admin | Dashboard KPI aggregates |
| GET | `/api/admin/events/dashboard` | admin | Live/upcoming/recent events |

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

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your PocketBase URL and superuser token

# 3. Run PocketBase (download from https://pocketbase.io)
# Start your PocketBase instance and apply the schema:
npm run migrate:pb

# 4. Add indexes (existing DB only — fresh migrate:pb includes them)
export PB_ADMIN_EMAIL=admin@example.com
export PB_ADMIN_PASSWORD=yourpassword
npm run migrate:indexes

# 5. Start the dev server
npm run dev
```


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

<div align="center">

© 2025-2026 IEEE Sahrdaya Student Branch. Proprietary — all rights reserved.

</div>

---

<div align="center">

[Website](https://ieeesahrdaya.com) • [Instagram](https://www.instagram.com/ieeesahrdaya/) • [LinkedIn](https://www.linkedin.com/company/ieeesahrdaya)

</div>
<!-- ci trigger test -->
