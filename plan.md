# Appwrite → Payload CMS Migration Plan

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Dokploy VPS (single host)                     │
│                          Domain: ieeesahrdaya.com              │
│                                                               │
│  ┌─────────────────────────────────────────┐  ┌──────────────┐│
│  │  Container: ieee-app                     │  │  Container:  ││
│  │  (Next.js 16 + Payload CMS v3)          │  │  ddm-api     ││
│  │                                          │  │  (Fastify)   ││
│  │  Payload does everything:                │  │              ││
│  │  ✅ REST API (auto CRUD /api/*)          │  │  POST /ticket││
│  │  ✅ Auth (Google OAuth via payload-authjs)│  │  GET /status ││
│  │  ✅ Email (Nodemailer via SMTP/Resend)   │  │  POST /webhook││
│  │  ✅ Jobs Queue (tasks + cron)            │  │              ││
│  │  ✅ Access Control (role-based)          │  │  SQLite      ││
│  │  ✅ CSRF + CORS (simple whitelist)       │  │  (volume)    ││
│  │  ✅ File Upload (Sharp auto-resize)      │  │              ││
│  │  ✅ Admin UI (exclusive — no custom)     │  │              ││
│  │  ✅ Custom Endpoints (4 total)           │  │              ││
│  │  ✅ Hooks (beforeChange, afterChange)    │  │              ││
│  │  ✅ TypeScript (auto-generated types)    │  │              ││
│  │  ✅ Local API (direct DB in server comp) │  │              ││
│  │                                          │  │              ││
│  │  Storage: SQLite (persistent volume)     │  │              ││
│  │  Uploads: Local disk (volume)            │  │              ││
│  └─────────────────────────────────────────┘  └──────────────┘│
│                                     ↑ calls                    │
│                              pay.mulearnscet.in                │
└──────────────────────────────────────────────────────────────┘
```

## Strategy

New branch `feat/payload-migration`. Fresh Next.js 16 + Payload project generated from scratch. Only frontend pages/components/utilities copied from old project. Git history preserved.

## Phase 0: Clean Slate

```bash
# On feat/payload-migration branch
git rm -rf .
git clean -fdx

# Generate fresh project
npx create-payload-app@latest -t blank
# → Next.js 16, Payload 3.x, React 19, all latest
```

## What We Keep From Old Project

### Frontend pages (swap Appwrite → Payload API)
```
src/app/page.tsx              ← home
src/app/events/page.tsx        ← event listing
src/app/events/[id]/page.tsx   ← event detail
src/app/societies/page.tsx     ← society listing
src/app/full-execom/page.tsx   ← execom listing
src/app/ticket/[id]/page.tsx   ← ticket display
src/app/layout.tsx             ← root layout
src/app/globals.css            ← styles
src/app/sitemap.ts             ← SEO
src/app/error.tsx              ← error page
src/app/not-found.tsx          ← 404 page
```

### Frontend components
```
Navbar, Footer, Hero, EventCard, Execom, SocietyStrip
WhatsHappening, EventsShowcase, FloatingIcons, GridBackground
JsonLd, AnimatedTick, ConfettiExplosion, UrgencyTag
PageTransition/, tickets/
PaymentModal                  ← simplify: remove WebSocket, keep polling
EventRegistrationModal       ← rewrite step flow to call Payload API
DynamicRegistrationForm      ← keep (renders JSON form templates)
LoginModal                   ← simplify to signIn("google")
```

### Lib utilities (pure functions)
```
src/lib/pdfReceiptGenerator.ts   ← PDF receipt (jspdf)
src/lib/ticketGenerator.ts       ← QR code (qrcode)
src/lib/email/templates.ts       ← HTML email templates
```

### Hooks
```
src/hooks/useScrollLock.ts       ← UI utility
```

### Config
```
tailwind.config.ts, postcss.config.mjs
tsconfig.json (payload will update)
next.config.mjs (payload will update)
```

## What We Delete

| Category | Files |
|---|---|
| **Appwrite** | `src/lib/appwrite.ts`, `src/lib/api/appwrite-admin.ts`, `src/contexts/AuthContext.tsx` |
| **Auth (old)** | `src/lib/passkeys/`, `src/middleware.ts`, `src/app/auth/`, `LoginModal.tsx` |
| **Admin pages** | `src/app/admin/` (8 subdirs), `src/components/admin/` (11 files) |
| **Admin API** | `src/app/api/admin/`, `src/app/api/events/`, `src/app/api/registrations/`, `src/app/api/ticket/`, `src/app/api/webhook/`, `src/app/api/auth/bootstrap/` |
| **Email (old)** | `emailService.ts`, `emailSender.ts`, `emailIntegration.ts`, `emailQueue.ts` |
| **Helpers** | `checkInHelpers.ts`, `errorHandler.ts`, `execomData.ts`, `sanitize.ts`, `schemas.ts` |
| **Const/Logger** | `constants/`, `logger.ts`, `csrf.ts`, `rate-limiter.ts`, `validation.ts`, `shared-utils.ts` |
| **Scripts** | `scripts/` (15 setup files) |
| **Cloudflare** | `open-next.config.ts`, `wrangler.jsonc`, `@opennextjs/cloudflare`, `wrangler` |
| **Vercel** | `vercel.json` |
| **Dev config** | `opencode.json`, `mcp-server-appwrite/`, `.agent/` |
| **Deps** | `appwrite`, `node-appwrite`, `@simplewebauthn/*`, `@dnd-kit/*`, `react-pageflip`, `uuid`, `nodemailer`, `resend` |
| **Other** | `certificates/`, `.env.local.example` |

## Phase 1: Collections (8)

### `users` (auth via payload-authjs)
| Field | Type |
|---|---|
| `email` | Email (unique) — from Google |
| `name` | Text — from Google |
| `image` | Upload — Google avatar |
| `phone` | Text |
| `sahrdayaEmail` | Text |
| `semester` | Select (S1–S8) |
| `department` | Select |
| `section` | Select (A–D) |
| `rollNumber` | Text |
| `foodPreference` | Text |
| `residence` | Text |
| `profileCompleted` | Checkbox |
| `role` | Select (`user`, `admin`) |
| `teams` | Array of Text — e.g. `["chair_csi"]` |

### `societies` (upload)
`name`, `slug`, `bio`, `logo`, `banner`, `chairs` (relation → users)

### `execom` (upload)
`name`, `position`, `society` (relation), `photo`, `order`, `batch`, `linkedin`, `email`

### `events` (upload)
~35 fields: title, slug, description, date, end_date, venue, price, society (relation), banner, status, capacity, registration settings, waitlist, pricing tiers, check-in settings, contact, content (JSON), soft delete

### `registrations`
`user`, `event`, `user_name`, `user_email`, `user_phone`, `form_responses` (JSON), `payment_status`, `payment_amount`, `payment_ticket_id`, `registration_status`, `ticket` (JSON — embedded ticket), `checked_in`, `checked_in_at`, `checked_in_by`, `check_in_history` (JSON)

### `orders`
`user`, `registration`, `amount`, `payment_method`, `payment_status`, `ddm_ticket_id`, `ddm_response` (JSON), `coupon`, `discounted_amount`

### `coupons`
`code`, `discount_type`, `discount_value`, `max_uses`, `used_count`, `expires_at`, `event` (relation), `is_active`

### `email-logs`
`recipient`, `subject`, `template`, `status`, `error`, `sent_at`, `registration`

## Phase 2: Auth — Google OAuth Only

- `signIn("google")` → Auth.js creates Payload user → `usePayloadSession()`
- No passkeys, no email/password, no forgot/reset
- `sourav223929@sahrdaya.ac.in` auto-assigned `role: admin` on first login
- CSRF whitelist: `['https://ieeesahrdaya.com']`

## Phase 3: Custom Endpoints (4)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/registrations/register` | Registration flow (handles free + paid + DDM) |
| `POST` | `/api/orders/webhook` | DDM payment callback |
| `POST` | `/api/check-in/verify` | QR check-in |
| `GET` | `/api/check-in/search` | Search attendees |

Everything else → Payload auto-CRUD.

## Phase 4: DDM Payment Flow

```
Frontend POST /api/registrations/register { eventId, formData }
  → If free: create registration → generate ticket + QR → send email → return success
  → If paid: create order → order.beforeChange calls DDM POST /ticket → return UPI QR

User pays via UPI
Frontend polls GET /api/orders/:id every 2s  ← no WebSocket

DDM SMS → POST /api/orders/webhook → updates order → confirms registration
  → registration.afterChange: payload.sendEmail(confirmation + receipt)
```

## Phase 5: Email

```typescript
// In afterChange hook on registrations
const pdfBuffer = await generatePaymentReceipt(data)
const html = registrationTemplate(variables)
await payload.sendEmail({
  to: reg.user_email,
  subject: 'Registration Confirmed',
  html,
  attachments: [{ filename: 'receipt.pdf', content: pdfBuffer }],
})
```

## Phase 6: Data Migration

| Order | Collection | Count |
|---|---|---|
| 1 | `societies` | ~10 |
| 2 | `execom` | ~30 |
| 3 | `users` (merge Appwrite users + members) | ~200 |
| 4 | `events` | ~20 |
| 5 | `registrations` | ~200 |
| 6 | `email-logs` | ~50 |

## Phase 7: Cutover

1. Run migration script
2. Update DDM webhook URL → `https://ieeesahrdaya.com/api/orders/webhook`
3. Point domain to Dokploy
4. Test all flows
5. Turn off Appwrite

## Security

| Feature | Config |
|---|---|
| Google OAuth only | No passwords stored |
| CSRF | `csrf: ['https://ieeesahrdaya.com']` |
| CORS | `cors: ['https://ieeesahrdaya.com']` |
| Max depth | `maxDepth: 2` |
| GraphQL | Disabled |
| Upload | `mimeTypes: ['image/*']` |
| Failed login lockout | Payload default |
| DDM webhook secret | Required header check |

## Performance

| Feature | Approach |
|---|---|
| Server components | `payload.find()` Local API — direct DB, zero HTTP |
| Client components | `fetch('/api/{collection}')` — same origin |
| Image optimization | Sharp + Next.js Image |
| SQLite | Single process, persistent volume, no contention |

## Dependencies (final)

### Production (~20)
```
payload @payloadcms/next @payloadcms/db-sqlite @payloadcms/richtext-lexical
payload-authjs next-auth @auth/payload-adapter
next react react-dom
framer-motion gsap lucide-react
react-hot-toast react-hook-form @hookform/resolvers zod
qrcode jspdf papaparse
@zxing/browser @zxing/library
sharp
```

### Dev (~5)
```
typescript eslint eslint-config-next
tailwindcss postcss autoprefixer
tsx
```

### Env vars (12)
```
PAYLOAD_SECRET, DATABASE_URI
AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL
PAYMENT_API_URL, PAYMENT_WEBHOOK_SECRET
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
NEXT_PUBLIC_APP_URL
```

## Timeline

| Phase | What | Hours |
|---|---|---|
| 0 | Clean slate + fresh Next.js 16 + Payload project | 2 |
| 1 | 8 collections + access control | 6 |
| 2 | Auth: Google OAuth via payload-authjs | 3 |
| 3 | Email: Payload adapter + templates | 2 |
| 4 | Hooks: registration flow + DDM + email | 4 |
| 5 | Custom endpoints: register, webhook, check-in | 3 |
| 6 | Frontend: copy + swap to Payload API | 6 |
| 7 | Data migration script | 3 |
| 8 | Cutover + test | 3 |
| **Total** | | **~32 hours** |
