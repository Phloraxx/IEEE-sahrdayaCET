<div align="center">

<img width="1200" height="475" alt="IEEE Sahrdaya" src="./public/web.png" />

# IEEE Sahrdaya Student Branch

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.39.1-BB2B2B?style=flat-square&logo=pocketbase)](https://pocketbase.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
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
| UI | React 19, Tailwind CSS 3, Framer Motion, Lucide |
| Backend | PocketBase 0.39.1 (embedded SQLite, built-in auth, file storage, REST API) |
| Auth | Google OAuth2 via PocketBase |

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

## Collections

### `users` (Auth)
Google OAuth, roles (admin/chair/user).

### `societies` (Base)
| Field | Type |
|-------|------|
| `name` | text |
| `slug` | text (unique) |
| `bio` | text |
| `logo` | file |
| `banner` | file |
| `order` | number |

### `execom` (Base)
| Field | Type |
|-------|------|
| `order` | number |
| `name` | text |
| `department` | text |
| `batch` | text |
| `position` | text |
| `category` | text |
| `section` | text |
| `sectionId` | text |
| `photo` | file |
| `linkedin` | url |
| `instagram` | url |
| `email` | email |
| `phone` | text |

### `events` (Base)
| Field | Type |
|-------|------|
| `title` | text |
| `description` | text (rich) |
| `date` | date |
| `endDate` | date |
| `venue` | text |
| `price` | number |
| `status` | select (draft/published/completed/cancelled) |
| `banner` | file |
| `registrationOpen` | bool |
| `maxCapacity` | number |
| `registeredCount` | number |
| `society` | relation → societies |

### `registrations` (Base)
| Field | Type |
|-------|------|
| `user` | relation → users |
| `event` | relation → events |
| `status` | select (pending/confirmed/cancelled/checked-in) |
| `ticketId` | text |
| `checkedInAt` | datetime |

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

## Auth & Roles

Google OAuth only (no email/password). Roles stored in PB user `role` field.

| Role | Access |
|------|--------|
| Guest | Browse events, societies, execom |
| User | Register for events, view tickets |
| Chair | Manage own society's events and registrations |
| Admin | Full admin dashboard |

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
