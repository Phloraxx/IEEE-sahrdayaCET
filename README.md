<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya" src="./public/web.png" />

# IEEE Sahrdaya Student Branch

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
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
| Framework | Next.js 16 (App Router, Server Components, API routes) |
| UI | React 19, Tailwind CSS 4, Framer Motion, Lucide |
| Backend | PocketBase 0.39.1 (embedded SQLite, built-in auth, file storage, REST API) |
| Auth | Google OAuth2 via PocketBase |

---

## Project Structure

```
src/
├── app/
│   ├── (main)/              # Public pages (home, events, societies, execom, tickets)
│   ├── api/                  # API routes (auth, admin, registrations, check-in, webhook)
│   └── globals.css           # Tailwind v4 config via @import + @theme
├── components/               # React components
│   ├── events/               # Event-specific components (cards, modals, hero)
│   └── icons.tsx             # SVG replacements for lucide-react removed brand icons
├── lib/                      # Utilities
├── types/                    # TypeScript interfaces
└── hooks/                    # React hooks

pb_hooks/                     # PocketBase JS hooks
├── registrations.pb.js       # Registration validation (capacity, duplicates, deadline)
├── registrations_confirm.pb.js  # Auto ticket generation on confirmation
├── registrations_counters.pb.js # Maintains event.registeredCount/checkedInCount
└── events.pb.js              # Event lifecycle hooks
```

### Key `src/lib/` utilities

| File | Purpose |
|------|---------|
| `pb.ts` | PocketBase client factories + `pbFetch()`, `buildFileUrl()`, `escapeFilterValue()` |
| `auth.ts` | `requireAuth()`, `requireAdmin()`, `AuthError` for server-side auth |
| `auth-context.tsx` | Client-side auth context (React context + cookies) |
| `logger.ts` | Structured error logging |
| `dates.ts` | Date formatting utilities |
| `csv-export.ts` | CSV generation for event registrations |
| `ticketStatus.ts` | Ticket status label/color/icon mapping |
| `qr.ts` | QR code generation and download |

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
| `registeredCount` | number | Maintained by pb_hook |
| `checkedInCount` | number | Maintained by pb_hook |
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
| `ticketId` | text | Unique, auto-generated by hook |
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

### pb_hooks
Copy the `pb_hooks/` folder into your PocketBase data directory.  
These hooks run server-side and handle:
- Registration validation (deadlines, capacity, duplicates)
- Auto ticket generation on confirmation
- Maintaining `event.registeredCount` and `event.checkedInCount`

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
