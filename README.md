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
Migrating from Appwrite to Payload CMS — self-hosted on Dokploy.

[Live Site](https://ieeesahrdaya.com) • [Documentation](#documentation) • [Quick Start](#quick-start) • [Migration Status](./plan.md)

</div>

---

## Overview

The IEEE Sahrdaya Event Management System is a comprehensive platform for managing technical events, workshops, hackathons, and symposiums organized by the IEEE Sahrdaya Student Branch and its 14 technical societies.

Built on **Next.js 16** with **Payload CMS v3** as the headless backend — replacing the previous Appwrite-based architecture. Self-hosted on **Dokploy** with **SQLite** for zero-infrastructure simplicity.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Event Discovery** | Browse upcoming events filtered by society, date, and category |
| **Online Registration** | Custom JSON form builder per event with validation |
| **Digital Tickets** | QR code-based tickets delivered via email with PDF receipts |
| **Payment Integration** | UPI payment via DDM gateway with 2s polling |
| **Check-in Scanner** | QR scanning with mobile-friendly interface |
| **Email Automation** | Confirmation, receipts, and status updates via SMTP |
| **Admin Panel** | Full CRUD admin powered by Payload CMS |
| **Google Auth** | Sign in with Google — no passwords |
| **Multi-Society Support** | 14 societies with independent management |

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
│  SQLite       │               │  pay.mulearn- │
│               │               │  scet.in      │
│  / → Frontend │               │               │
│  /admin → CMS │               │  POST /ticket │
│  /api → REST  │               │  GET /status  │
└───────────────┘               │  POST /webhook│
                                └───────────────┘
```

### Payment Flow

```
User registers → POST /api/registrations/register
  │
  ├── Free event → registration created (status: confirmed)
  │   └── Email sent with QR ticket + PDF receipt
  │
  └── Paid event → Order created → beforeChange hook
      └── POST pay.mulearnscet.in/ticket → returns UPI QR
      └── User scans QR and pays via UPI app
      └── Frontend polls GET /api/orders/:id every 2s
      └── DDM confirms → POST /api/orders/webhook
          └── Payment marked paid → ticket generated → email sent
```

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
| **Lucide React** | Icon library |
| **GSAP** | Advanced animations |

### Backend & CMS

| Technology | Purpose |
|------------|---------|
| **Payload CMS 3.85** | Headless CMS — database, REST API, admin panel |
| **SQLite** | Database (single file, no external DB server) |
| **NextAuth.js 5** | Google OAuth authentication |
| **payload-authjs** | Auth adapter bridging NextAuth ↔ Payload |
| **Nodemailer** | Email delivery via SMTP |

### Additional Libraries

| Library | Purpose |
|---------|---------|
| **@payloadcms/richtext-lexical** | Rich text editor |
| **@payloadcms/db-sqlite** | SQLite database adapter |
| **@payloadcms/email-nodemailer** | Email adapter |
| **qrcode** | QR code generation |
| **jspdf** | PDF receipt generation |
| **papaparse** | CSV export |
| **react-hook-form + zod** | Registration form validation |
| **@zxing/browser + @zxing/library** | QR code scanning |
| **sharp** | Image processing (built into Payload) |

---

## Project Structure

```
ieee-sahrdaya/
├── src/
│   ├── app/
│   │   ├── (payload)/                  # Payload CMS admin panel (auto-generated)
│   │   │   ├── admin/[[...segments]]/  # Admin UI pages
│   │   │   ├── api/[...slug]/          # Payload REST API
│   │   │   ├── custom.scss             # Admin panel custom CSS
│   │   │   └── layout.tsx              # Payload admin layout
│   │   ├── (main)/                     # Frontend route group
│   │   │   ├── events/page.tsx         # Event listing page
│   │   │   ├── societies/              # Societies showcase
│   │   │   ├── full-execom/            # Execom directory
│   │   │   ├── ticket/[ticketId]/      # Digital ticket page
│   │   │   ├── layout.tsx              # Frontend layout (fonts, session)
│   │   │   ├── page.tsx                # Homepage
│   │   │   ├── error.tsx               # Error page
│   │   │   └── not-found.tsx           # 404 page
│   │   ├── api/                        # Custom API routes
│   │   │   ├── auth/[...nextauth]/     # NextAuth.js handler
│   │   │   ├── registrations/register/ # Registration endpoint
│   │   │   ├── orders/webhook/         # DDM payment callback
│   │   │   └── check-in/               # QR check-in endpoints
│   │   ├── globals.css                 # Tailwind directives
│   │   └── layout.tsx                  # Root layout (metadata only)
│   │
│   ├── components/                     # React components
│   │   ├── Navbar, Footer, Hero, EventCard
│   │   ├── SocietiesClient, Execom (both committees)
│   │   ├── PaymentModal, EventRegistrationModal
│   │   ├── DynamicRegistrationForm, TicketDisplay
│   │   ├── LoginModal, TechnicalDetails
│   │   └── tickets/ (TicketCard, MyTicketsSection)
│   │
│   ├── payload/
│   │   ├── collections/                # 8 Payload collections
│   │   │   ├── Users.ts, Media.ts, Societies.ts
│   │   │   ├── Execom.ts, Events.ts
│   │   │   ├── Registrations.ts, Orders.ts, Coupons.ts
│   │   ├── hooks/                      # Payload lifecycle hooks
│   │   │   ├── orders.ts               # DDM ticket creation
│   │   │   └── registrations.ts        # Confirmation emails
│   │   ├── access/                     # Access control functions
│   │   └── admin/                      # Custom admin components
│   │       ├── Logo.tsx, Icon.tsx
│   │       ├── DashboardWidget.tsx
│   │       └── BillingView.tsx
│   │
│   ├── lib/                            # Utilities
│   │   ├── pdfReceiptGenerator.ts      # PDF ticket receipts
│   │   ├── ticketGenerator.ts          # QR code generation
│   │   └── email/templates.ts          # Email HTML templates
│   │
│   ├── types/                          # TypeScript type definitions
│   │
│   └── hooks/                          # React hooks
│       └── useScrollLock.ts
│
├── migration/                          # Data migration scripts
│   └── migrate-from-sql.ts             # MariaDB dump → Payload
│
├── auth.config.ts                      # NextAuth.js configuration
├── auth.ts                             # Auth.js edge runtime adapter
├── payload.config.ts                   # Payload CMS configuration
├── payload-types.ts                    # Auto-generated TypeScript types
├── next.config.mjs                     # Next.js configuration
├── tailwind.config.js                  # Tailwind CSS configuration
├── postcss.config.mjs                  # PostCSS configuration
├── Dockerfile                          # Container build
├── package.json
├── plan.md                             # Migration status report
└── README.md
```

---

## Collections

Payload CMS provides auto-generated REST API + Admin UI for all collections:

| Collection | Slug | Group | Purpose |
|------------|------|-------|---------|
| **Media** | `media` | System | Image uploads (auto-resized: thumbnail, card sizes) |
| **Users** | `users` | System | Google OAuth accounts with roles (user/admin) |
| **Societies** | `societies` | Content | 14 IEEE technical societies with logos/banners |
| **Execom** | `execom` | Content | Executive committee members per society |
| **Events** | `events` | Events | Workshops, hackathons, seminars, competitions |
| **Registrations** | `registrations` | Events | Event sign-ups with payment tracking |
| **Orders** | `orders` | Events | DDM payment orders and webhook responses |
| **Coupons** | `coupons` | Events | Discount codes with percentage/fixed options |

---

## Environment Variables

Create a `.env.local` file with:

```env
# Payload CMS
PAYLOAD_SECRET=your-secret-here
DATABASE_URI=file:./data/payload.db

# Authentication (NextAuth.js)
AUTH_SECRET=your-auth-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
AUTH_URL=http://localhost:3000

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

# Appwrite (migration only — can be removed after migration)
APPWRITE_ENDPOINT=https://backend.ieeesahrdaya.com/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_API_KEY=your-api-key
APPWRITE_DATABASE_ID=your-database-id
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
cp .env.local.example .env.local
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
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run payload` | Run Payload CLI commands |
| `npm run migrate` | Run SQL migration from Appwrite dump |
| `npm run migrate:safe` | Run Payload migrations + SQL migration |

---

## Authentication

The system uses **Google OAuth only** — no email/password, no passkeys, no forgot/reset password.

| Role | Access |
|------|--------|
| **Guest** | Browse events, societies, execom |
| **User** | Register for events, view tickets |
| **Admin** | Full Payload admin panel access |

The admin user `sourav223929@sahrdaya.ac.in` is auto-assigned the `admin` role on first Google login via a `beforeChange` hook on the Users collection.

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

| Issue | Status | Workaround |
|-------|--------|------------|
| Admin custom CSS (`.scss`) not loading via Turbopack on Windows | Unresolved | Use `.css` extension or restart without Turbopack |
| `next-auth` peer dep warning with Next.js 16 | Known | `--legacy-peer-deps` during install, works at runtime |
| `@emnapi/runtime` extraneous in npm ls | Harmless | Transitive dep hoisting |
| Lexical editor expects JSON, not plain text | Fixed | Changed Events.description to `type: 'textarea'` |
| Tailwind base leaking into admin panel | Fixed | Moved `globals.css` import from root to `(main)` layout |

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [Migration Status](./plan.md) | Developers | Complete project status, git history, and next steps |
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
5. Ensure build passes: `npm run build`
6. Commit: `git commit -m 'feat: add amazing feature'`
7. Push: `git push origin feature/amazing-feature`
8. Open a Pull Request to `main`

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

[Website](https://ieeesahrdaya.com) • [Instagram](https://instagram.com/ieeesahrdaya) • [LinkedIn](https://linkedin.com/company/ieee-sahrdaya)

</div>
