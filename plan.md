# Migration Status Report — IEEE Sahrdaya SB

## Current State (June 3, 2026)

**Branch:** `feat/payload-migration` — working tree clean
**Framework:** Next.js 16.2.7 + Payload CMS 3.85 + SQLite
**Frontend:** Tailwind CSS 3.4 (migrated from v4 due to Turbopack Windows bug)
**Auth:** NextAuth 5 beta (Google OAuth) via `payload-authjs`
**Build:** ✅ Passes (TypeScript, 14 routes, 11 static pages)

---

## Architecture

```
Dokploy VPS
├── Container 1: ieee-app (Next.js 16 + Payload CMS + SQLite)
│   ├── Frontend: /, /events, /societies, /full-execom, /ticket/:id
│   ├── Admin: /admin (Payload CMS panel, currently vanilla/default)
│   ├── API: /api/{collections} (auto CRUD via Payload)
│   ├── Custom: /api/registrations/register, /api/orders/webhook
│   ├── Custom: /api/check-in/verify, /api/check-in/search
│   └── Custom: /api/auth/[...nextauth]
└── Container 2: ddm-api (Fastify + SQLite, at pay.mulearnscet.in)
    └── POST /ticket, GET /status, POST /webhook
```

---

## Git History (Last 50 Commits, Chronological)

### Phase 1: Data Migration & Core Setup (commits 1–20)
- Collections created: Media, Users, Societies, Execom, Events, Registrations, Orders, Coupons
- SQL migration script (`migration/migrate-from-sql.ts`) — reads `ieee_export.sql`, uploads images, creates 15 societies, 94 execom, 29 events
- Image rendering fix: replaced all `<Image fill>` with `<img>` + aspect containers
- Auth swap: `useAuth()` → `useSession()` / `signIn("google")`
- Restored original SocietiesClient layout from GitHub
- Societies: added `isHidden`/`displayOrder`, sorted by `id` ascending

### Phase 2: Admin Theming Attempts (commits 21–40+)
Multiple attempts to customize the Payload admin panel — **all reverted**. Key lessons learned:

| Attempt | What | Why it failed |
|---|---|---|
| **1. Brand colors in custom.scss** | Set `--theme-color`, `--theme-color-hover`, custom elevation | Worked partially but dark mode had inverted elevation causing invisible button text |
| **2. Payload Makeup CSS** | Full Payload Makeup stylesheet + IEEE brand | Search bar overlapped (Makeup changed `--theme-bg` breaking grid layout), spacing issues |
| **3. Custom dark theme** | Wrote full dark theme with IEEE-tinted elevation | Buttons invisible (white text on light gray bg), spacing broken everywhere |
| **4. CSS animations** | Hover effects, transitions, popup animations | Never loaded — custom.scss wasn't being processed by Turbopack on Windows (`.scss` extension issue) |
| **5. Logo/Icon components** | Created Logo.tsx (Ieee.svg), Icon.tsx (emblem.png/favicon.svg) | Logo worked when inline SVG, but CSS from custom.scss never loaded so nav icons + animations failed |

### Root Causes Identified
| Issue | Root cause | Fix |
|---|---|---|
| Broken admin spacing/search/layout | `@tailwind base` in globals.css leaked into admin via root layout | Moved globals.css import from root layout to `(main)` layout only |
| SCSS not loading | Turbopack on Windows doesn't process `.scss` files correctly (EPIPE errors, broken pipe) | Workaround pending — need to investigate proper import method |
| Button text invisible in dark mode | Payload Makeup or custom CSS set `--color` / `--bg-color` incorrectly relative to inverted elevation | Default Payload handles this correctly — don't override |
| Lexical editor crashing | `Events.description` field was `type: 'richText'` but data was plain text | Changed to `type: 'textarea'` |

---

## Current Vanilla State

### `payload.config.ts`
```typescript
admin: {},  // no custom components, no meta overrides, no theme restriction
```
- No Logo/Icon custom components
- No DashboardWidget
- No BillingView
- No theme restriction (defaults to `'all'` — user/system preference)
- Default Payload meta (favicon, title)

### `src/app/(payload)/custom.scss`
```scss
/* intentionally empty — using default Payload CMS */
```

### Frontend (`src/app/layout.tsx` — root)
- No CSS imports (avoids leaking `@tailwind base` into admin)
- Only exports `metadata`, `viewport`, fonts, empty `{children}` wrapper

### Frontend (`src/app/(main)/layout.tsx`)
- Imports `../globals.css` (contains `@tailwind base`)
- Handles fonts, session provider, JSON-LD schema, HTML structure

### `src/app/(payload)/layout.tsx`
- Imports `./custom.scss` (currently empty)
- Standard Payload-generated layout with RootLayout + importMap

---

## Dependencies

### Production (21 packages)
```
@payloadcms/db-sqlite, @payloadcms/email-nodemailer, @payloadcms/next,
@payloadcms/richtext-lexical, @zxing/browser, @zxing/library,
framer-motion, gsap, jspdf, lucide-react, next, next-auth,
papaparse, payload, payload-authjs, qrcode, react, react-dom,
react-hook-form, react-hot-toast, sharp, zod
```

### Dev (11 packages)
```
@types/node, @types/qrcode, @types/react, @types/react-dom,
autoprefixer, dotenv, eslint, eslint-config-next, postcss,
prettier, sass, tailwindcss, tsx, typescript
```

### Env Vars (23 in `.env.local`)
- Payload: `PAYLOAD_SECRET`, `DATABASE_URI`
- Appwrite (migration only): `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`
- Auth: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`
- Payment: `PAYMENT_API_URL`, `PAYMENT_WEBHOOK_SECRET`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- App: `NEXT_PUBLIC_APP_URL`

---

## Collections (8)

| Slug | Group | Records | Key fields |
|---|---|---|---|
| `media` | System | ~100+ | Upload (images), alt, thumbnail/card sizes |
| `users` | System | ~200 (migrated) | Google OAuth, role (user/admin), department, semester, teams |
| `societies` | Content | 15 | name, slug, bio, logo (upload), chairs (relation) |
| `execom` | Content | 94 | name, position, society (relation), photo (upload), order, batch, department |
| `events` | Events | 29 | title, slug, description (textarea), date, venue, price, status, society (relation) |
| `registrations` | Events | ~200 (migrated) | user, event, payment/registration status, ticket (JSON), check-in |
| `orders` | Events | ~ | user, registration, amount, ddmTicketId, payment status |
| `coupons` | Events | ~ | code, discount (percentage/fixed), maxUses, event (relation) |

---

## Custom API Routes (4)

| Method | Path | Purpose | Status |
|---|---|---|---|
| `POST` | `/api/registrations/register` | Registration flow (free + paid + DDM) | Built |
| `POST` | `/api/orders/webhook` | DDM SMS payment callback | Built |
| `POST` | `/api/check-in/verify` | QR code check-in | Built |
| `GET` | `/api/check-in/search` | Search attendees | Built |

---

## Known Issues

| Issue | Severity | Status |
|---|---|---|
| `custom.scss` not loading via Turbopack on Windows | High | Unresolved — need `.css` extension or different import method |
| Logo/Icon components exist but unused | Low | Files at `src/payload/admin/Logo.tsx`, `Icon.tsx` — config references removed |
| `sass@1.100.0` installed at root (may conflict with Next.js 16's sass@1.77.4) | Low | Installed when troubleshooting SCSS loading, can be removed |
| `@emnapi/runtime` extraneous in npm ls | Low | Transitive dependency hoisted, harmless |
| `next-auth` peer dep warning (`next@^14.0.0-0 \|\| ^15.0.0-0` vs actual next@16) | Medium | Known issue with next-auth 5 beta + Next.js 16, works at runtime with `--legacy-peer-deps` |

---

## Next Steps (Recommended Order)

### 1. Make custom CSS load (blocker for all admin UI work)
Investigate why `custom.scss` doesn't load via Turbopack on Windows:
- Try `import './custom.css'` (rename file to `.css` — plain CSS = no SCSS processing needed)
- Check if Turbopack processes CSS differently from webpack
- Add a test rule (`body { background: red }`) and verify via browser dev tools
- **If CSS load confirmed:** proceed to step 2

### 2. Add Logo + Icon (white-label identity)
- Re-enable `admin.components.graphics.Logo` and `Icon` in `payload.config.ts`
- Logo.tsx uses inline SVG (works — confirmed previously) with `favicon.svg` paths
- Icon.tsx uses inline SVG at smaller size
- `importMap.js` auto-regenerates on server start

### 3. Add nav icons (visual navigation)
- Add to custom CSS (once loading is fixed):
  - `.nav__link::before` with `mask-image` for Lucide icons
  - Icons for societies, execom, registrations, coupons

### 4. Brand colors (subtle)
- `:root { --theme-color: #00629B; --theme-color-hover: #0099D6; }`
- Just these two — tints primary buttons, active nav, links
- No elevation/background overrides (those broke things before)

### 5. Animations (CSS-only, low risk)
- Add gradually, test each:
  - Nav hover transitions
  - Popup fade + scale
  - Button press effect
  - Table row hover

### 6. Deploy to Dokploy
- Dockerfile uses Node.js 22 multi-stage build with `output: 'standalone'`
- Persistent volume at `/app/data` for SQLite
- Set up Google OAuth credentials for production
- Run `npm run migrate` for initial data

---

## Files of Interest

| File | Purpose | Status |
|---|---|---|
| `payload.config.ts` | Payload configuration | Clean, minimal |
| `src/app/(payload)/custom.scss` | Admin custom styles | Empty |
| `src/app/(payload)/layout.tsx` | Admin root layout | Imports `custom.scss` |
| `src/app/layout.tsx` | App root layout | No CSS import (avoids admin leak) |
| `src/app/(main)/layout.tsx` | Frontend layout | Imports `globals.css` (Tailwind base) |
| `src/app/globals.css` | Tailwind directives | `@tailwind base; @tailwind components; @tailwind utilities;` |
| `src/payload/admin/Logo.tsx` | Admin logo component | Created but not in config |
| `src/payload/admin/Icon.tsx` | Admin icon component | Created but not in config |
| `src/payload/admin/DashboardWidget.tsx` | Dashboard widget | Created but not in config |
| `src/payload/admin/BillingView.tsx` | Custom billing view | Created but not in config |
| `public/favicon.svg` | Fixed viewBox, `currentColor` fills | Ready for use in Logo/Icon |
| `public/Ieee.svg` | IEEE text logo (horizontal) | Available for Logo |
| `public/emblem.png` | IEEE diamond emblem (square) | Available for Logo/Icon |
| `tailwind.config.js` | Tailwind v3 config | Custom colors + fonts |
| `next.config.mjs` | Next.js config | `output: 'standalone'`, `images.unoptimized: true` |
| `auth.config.ts` | Auth.js config | Google OAuth provider only |
| `.env.local` | Environment variables | 23 vars populated |
