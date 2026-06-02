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
# → Next.js 16, Payload 3.x, React 19, latest stable versions
```

## What We Keep From Old Project

### Frontend pages
```
src/app/page.tsx              ← home
src/app/events/page.tsx        ← event listing
src/app/events/[id]/page.tsx   ← event detail
src/app/societies/page.tsx     ← society listing
src/app/full-execom/page.tsx   ← execom listing
src/app/ticket/[id]/page.tsx   ← ticket display
src/app/layout.tsx             ← root layout (merged with Payload)
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
PageTransition/, tickets/ (TicketCard, MyTicketsSection)

PaymentModal              ← keep UI, remove WebSocket, keep polling + QR display
EventRegistrationModal    ← keep step flow, swap Appwrite → Payload API calls
DynamicRegistrationForm   ← keep (renders JSON form templates via react-hook-form + zod)
LoginModal                ← keep UI, swap account.createOAuth2Session → signIn("google")
```

### Lib utilities (pure functions — no side effects)
```
src/lib/pdfReceiptGenerator.ts   ← returns PDF buffer (jspdf)
src/lib/ticketGenerator.ts       ← returns base64 QR (qrcode)
src/lib/email/templates.ts       ← returns HTML string
```

### Hooks
```
src/hooks/useScrollLock.ts       ← UI utility
```

### Config
```
tailwind.config.ts, postcss.config.mjs
tsconfig.json                     ← Payload auto-updates
next.config.mjs                   ← Payload auto-updates
```

## What We Delete

| Category | Files |
|---|---|
| **Appwrite** | `src/lib/appwrite.ts`, `src/lib/api/appwrite-admin.ts`, `src/contexts/AuthContext.tsx` |
| **Auth (old)** | `src/lib/passkeys/`, `src/middleware.ts`, `src/app/auth/` |
| **Admin pages** | `src/app/admin/` (8 subdirs), `src/components/admin/` (11 files) |
| **Admin API** | All `src/app/api/admin/`, `events/`, `registrations/`, `ticket/`, `webhook/`, `auth/bootstrap/` |
| **Email (old)** | `emailService.ts`, `emailSender.ts`, `emailIntegration.ts`, `emailQueue.ts` |
| **Helpers** | `checkInHelpers.ts`, `errorHandler.ts`, `execomData.ts`, `sanitize.ts`, `schemas.ts`, `shared-utils.ts` |
| **Const/Logger** | `constants/`, `logger.ts`, `csrf.ts`, `rate-limiter.ts`, `validation.ts` |
| **Scripts** | `scripts/` (15 Appwrite setup files) |
| **Cloudflare** | `open-next.config.ts`, `wrangler.jsonc`, `@opennextjs/cloudflare`, `wrangler` |
| **Vercel** | `vercel.json` |
| **Dev config** | `opencode.json`, `mcp-server-appwrite/`, `.agent/` |
| **Deps removed** | `appwrite`, `node-appwrite`, `@simplewebauthn/*`, `@dnd-kit/*`, `react-pageflip`, `uuid`, `nodemailer`, `resend` |
| **Other** | `certificates/`, `.env.local.example` |

## Phase 1: Collections (7)

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

Auth config: `forgotPassword: { disable: true }`, no `verify`.

### `societies` (upload)
`name`, `slug`, `bio`, `logo` (upload), `banner` (upload), `chairs` (relation → users, many)

### `execom` (upload)
`name`, `position`, `society` (relation → societies), `photo` (upload), `order`, `batch`, `linkedin`, `email`

### `events` (upload)
~35 fields grouped in admin UI:
- Basic: title, slug, description (richText), date, end_date, venue, price, society (relation), banner (upload)
- Status: status (draft/published/archived/completed/cancelled), is_deleted (soft delete)
- Capacity: max_capacity, registered_count, checked_in_count
- Registration: registration_open, registration_start, registration_deadline, form_template (JSON)
- Waitlist: enable_waitlist, waitlist_limit, waitlist_count
- Pricing: is_paid, ieee_member_price, non_member_price, early_bird_price, early_bird_deadline, pricing_tiers (JSON), currency
- Check-in: check_in_enabled, self_check_in
- Contact: contact_email, contact_phone, external_link
- Content: tags, category, speakers (JSON), schedule (JSON), faqs (JSON)

**Access:** read = public (where status = published), create/update/delete = admin or chair.

### `registrations`
| Field | Type |
|---|---|
| `user` | Relationship → users |
| `event` | Relationship → events |
| `user_name` | Text (denormalized) |
| `user_email` | Text (denormalized) |
| `user_phone` | Text (denormalized) |
| `form_responses` | JSON (custom form answers) |
| `payment_status` | Select: pending/paid/completed/failed/refunded/not_required |
| `payment_amount` | Number |
| `payment_ticket_id` | Text (DDM ticket ID) |
| `registration_status` | Select: pending/confirmed/cancelled/expired |
| `ticket` | JSON (embedded: ticket_id, ticket_code, qr_code, is_scanned, issued_at) |
| `checked_in` | Checkbox |
| `checked_in_at` | Date |
| `checked_in_by` | Relationship → users |
| `check_in_history` | JSON `[{ location, checked_in_at, checked_in_by }]` |

**Hooks:**
- `afterChange` (status = confirmed): generate QR → `payload.sendEmail()` with template + PDF receipt
- `beforeChange` (if paid event): create `order` document (DDM handled in order hook)

### `orders`
`user`, `registration`, `amount`, `payment_method` (upi/cash), `payment_status` (pending/paid/failed/refunded), `ddm_ticket_id`, `ddm_response` (JSON), `coupon` (relation), `discounted_amount`

**Custom endpoint:** `POST /api/orders/webhook` — DDM SMS callback.

**Hooks:**
- `beforeChange` (create): call `POST pay.mulearnscet.in/ticket`, store `ddm_ticket_id` + response

### `coupons`
`code` (unique, uppercase), `discount_type` (percentage/fixed), `discount_value`, `max_uses`, `used_count` (auto-increment), `expires_at`, `event` (relation, null = all), `is_active`

## Phase 2: Auth — Google OAuth Only

- `signIn("google")` → Auth.js creates Payload user → `usePayloadSession()`
- No passkeys, no email/password, no forgot/reset password
- `sourav223929@sahrdaya.ac.in` auto-assigned `role: admin` on first login via seed/init script
- CSRF whitelist: `['https://ieeesahrdaya.com']`
- LoginModal keeps existing UI — just swap `account.createOAuth2Session()` → `signIn('google')`

## Phase 3: Custom Endpoints (4)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/registrations/register` | Registration flow (free + paid + DDM) |
| `POST` | `/api/orders/webhook` | DDM payment callback |
| `POST` | `/api/check-in/verify` | QR code check-in |
| `GET` | `/api/check-in/search` | Search attendees by name/email/ticket |

Everything else → Payload auto-generated REST API at `/api/{collection}`.

### Registration flow custom endpoint

Payload's `POST /api/registrations` just creates a document. We need one endpoint that:
1. Creates the registration
2. For free events: generates ticket + QR, sends confirmation, returns success
3. For paid events: creates order → order hook calls DDM → returns UPI QR data to frontend

```typescript
// POST /api/registrations/register
// Body: { eventId, formResponses, couponCode? }
// Response (free): { registration, ticket }
// Response (paid): { registration, payment: { ddmTicketId, amount, upiString, orderId } }
```

## Phase 4: DDM Payment Flow

```
Frontend POST /api/registrations/register { eventId, formData }
  → If free: create registration (status=confirmed)
      → generate ticket ID + QR code (ticketGenerator.ts)
      → afterChange hook: payload.sendEmail(confirmation)
      → return { registration, ticket }
  → If paid: create registration (status=pending) + create order (status=pending)
      → order.beforeChange: call DDM POST /ticket, store ddm_ticket_id
      → return { registration, payment: { upiString, amount, orderId } }

User sees UPI QR in PaymentModal → pays via any UPI app
Frontend polls GET /api/orders/:orderId every 2s  ← no WebSocket

DDM confirms payment → SMS → POST /api/orders/webhook
  → order: payment_status = 'paid'
  → registration: status = 'confirmed', generate ticket ID + QR
  → registration.afterChange: payload.sendEmail(confirmation + PDF receipt)

Poll picks up the status change → PaymentModal shows success → user sees ticket
```

## Phase 5: Email

```typescript
// payload.config.ts
email: nodemailerAdapter({
  defaultFromAddress: 'noreply@ieeesahrdaya.com',
  defaultFromName: 'IEEE Sahrdaya SB',
  transportOptions: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  },
}),

// In afterChange hook on registrations (status = confirmed):
const pdfBuffer = await generatePaymentReceipt(data)
const html = registrationTemplate(variables)
await payload.sendEmail({
  to: reg.user_email,
  subject: 'Registration Confirmed',
  html,
  attachments: [{ filename: 'receipt.pdf', content: pdfBuffer }],
})
```

Jobs Queue tracks email delivery status — visible in Payload admin under `payload-jobs`. No separate `email-logs` collection needed.

## Phase 6: Data Migration

| Order | Collection | Count | Notes |
|---|---|---|---|
| 1 | `societies` | ~10 | No dependencies |
| 2 | `execom` | ~30 | Depends on societies |
| 3 | `users` | ~200 | Merge Appwrite `users` + `members` |
| 4 | `events` | ~20 | Depends on societies |
| 5 | `registrations` | ~200 | Depends on users + events |

## Phase 7: Cutover

1. Run `npx tsx migration/migrate-from-appwrite.ts`
2. Update DDM webhook URL → `https://ieeesahrdaya.com/api/orders/webhook`
3. Point domain to Dokploy container
4. Test all flows: login (Google), event listing, register (free + paid), payment (polling), check-in, admin CRUD
5. Turn off Appwrite

## Security

| Feature | Config |
|---|---|
| Google OAuth only | No passwords stored |
| CSRF | `csrf: ['https://ieeesahrdaya.com']` |
| CORS | `cors: ['https://ieeesahrdaya.com']` |
| Max depth | `maxDepth: 2` |
| GraphQL | `graphQL: { disable: true }` |
| Upload | `mimeTypes: ['image/*']` for all upload collections |
| Failed login lockout | Payload default (irrelevant — Google OAuth only) |
| DDM webhook | Verify `x-webhook-secret` header |

## Performance

| Feature | Approach |
|---|---|
| Server components | `payload.find({ collection })` — Local API, direct DB, zero HTTP |
| Client components | `fetch('/api/{collection}')` — same origin |
| Image optimization | Sharp + Next.js `<Image>` with auto-resize |
| SQLite | Single process on Dokploy, persistent volume, no write contention |
| No WebSocket | Simple polling every 2s, fine for <100 concurrent users |

## Code Quality

| Practice | How |
|---|---|
| **TypeScript strict** | Enable `strict: true` in tsconfig |
| **Payload auto-types** | `payload-types.ts` generated automatically — use everywhere |
| **Collection pattern** | Every collection: `fields → access → hooks → admin`, in that order |
| **Pure functions** | `ticketGenerator`, `pdfReceiptGenerator`, `email/templates` — no side effects, no imports from Payload |
| **No magic strings** | Collection slugs from Payload config, never hardcoded |
| **Error handling** | Custom endpoints → `{ error: string }`. Hooks → `throw new APIError()` |
| **Logger** | Use `req.payload.logger` or `payload.logger` — no custom logger |
| **Server vs client** | Server: `payload.find()` (typed). Client: `fetch()` or `@payloadcms/sdk` (typed) |
| **Prettier** | Add for consistent formatting across ~55 files |

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
sharp @payloadcms/email-nodemailer nodemailer
```

### Dev (~6)
```
typescript eslint eslint-config-next prettier
tailwindcss postcss autoprefixer
tsx
```

### Env vars (12, down from 45)
```
PAYLOAD_SECRET=             DATABASE_URI=file:./data/payload.db
AUTH_SECRET=                AUTH_GOOGLE_ID=      AUTH_GOOGLE_SECRET=
AUTH_URL=https://ieeesahrdaya.com
PAYMENT_API_URL=            PAYMENT_WEBHOOK_SECRET=
SMTP_HOST=                  SMTP_PORT=587         SMTP_USER=        SMTP_PASS=
NEXT_PUBLIC_APP_URL=https://ieeesahrdaya.com
```

## Final File Structure

```
ieee/
├── src/
│   ├── app/
│   │   ├── (payload)/                     ← Payload auto-generated
│   │   │   ├── admin/[[...segments]]/page.tsx + not-found.tsx
│   │   │   ├── api/[...slug]/route.ts
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── registrations/register/route.ts    ← custom
│   │   │   ├── orders/webhook/route.ts             ← custom
│   │   │   └── check-in/{verify,search}/route.ts   ← custom
│   │   ├── events/page.tsx + [id]/page.tsx
│   │   ├── societies/page.tsx
│   │   ├── full-execom/page.tsx
│   │   ├── ticket/[id]/page.tsx
│   │   ├── layout.tsx + globals.css
│   │   ├── page.tsx + error.tsx + not-found.tsx + sitemap.ts
│   │   └── (no auth/, admin/, api/admin/ etc.)
│   ├── components/
│   │   ├── Navbar, Footer, Hero, EventCard, Execom, SocietyStrip
│   │   ├── WhatsHappening, EventsShowcase, FloatingIcons, GridBackground
│   │   ├── JsonLd, AnimatedTick, ConfettiExplosion, UrgencyTag
│   │   ├── LoginModal.tsx            ← same UI, signIn("google")
│   │   ├── PaymentModal.tsx          ← same UI, no WebSocket
│   │   ├── EventRegistrationModal.tsx ← same flow, Payload API
│   │   └── DynamicRegistrationForm.tsx ← kept, renders JSON templates
│   ├── payload/
│   │   ├── collections/  (Users, Societies, Execom, Events, Registrations, Orders, Coupons)
│   │   ├── hooks/        (registrations.ts, orders.ts)
│   │   └── access/       (index.ts)
│   ├── lib/
│   │   ├── pdfReceiptGenerator.ts
│   │   ├── ticketGenerator.ts
│   │   └── email/templates.ts
│   └── hooks/useScrollLock.ts
├── auth.config.ts, auth.ts, proxy.ts
├── payload.config.ts, next.config.mjs
├── package.json, tsconfig.json, tailwind.config.ts, postcss.config.mjs
├── Dockerfile, .env.example
└── plan.md
```

## Timeline (32 hours)

| Phase | What | Hours |
|---|---|---|
| 0 | Clean slate + fresh Next.js 16 + Payload project | 2 |
| 1 | 7 collections + access control | 6 |
| 2 | Auth: Google OAuth via payload-authjs | 3 |
| 3 | Email: Payload email adapter | 2 |
| 4 | Hooks: DDM payment + registration email + QR | 4 |
| 5 | Custom endpoints: register, webhook, check-in | 3 |
| 6 | Frontend: copy components, swap to Payload API | 6 |
| 7 | Data migration script | 3 |
| 8 | Cutover + deploy + test | 3 |
| **Total** | | **~32 hours** |
