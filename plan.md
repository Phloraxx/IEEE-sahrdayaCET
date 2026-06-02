# Appwrite → Payload CMS Migration Plan (Simplified)

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
│  │  ✅ Custom Endpoints (5 total)           │  │              ││
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

## Simplified Code Structure

### What we keep (minimal):
```
payload/
  collections/
    Users.ts                    ← auth, role, teams
    Societies.ts                ← upload enabled
    Execom.ts                   ← upload enabled
    Events.ts                   ← upload enabled, ~35 fields
    Registrations.ts            ← embedded ticket + check-in
    Orders.ts                   ← DDM payment tracking
    Coupons.ts                  ← discount codes
    EmailLogs.ts                ← audit log
  hooks/
    registrations.ts            ← single file: afterChange → email + QR
    orders.ts                   ← single file: beforeChange → DDM API
    orders-webhook.ts           ← single file: endpoint handler for DDM callback
  endpoints/
    check-in.ts                 ← 4 endpoints: verify, search, export, bulk-email

src/lib/
  pdfReceiptGenerator.ts        ← pure function: returns PDF buffer
  ticketGenerator.ts            ← pure function: returns base64 QR
  email/templates.ts            ← pure function: returns HTML string

migration/
  migrate-from-appwrite.ts      ← one-time script

Frontend pages (keep as-is):
  /events, /societies, /execom, /ticket/[id], /setup-profile
  → swap Appwrite SDK calls for payload.find() (server) or fetch (client)
```

### What we delete (everything else):
```
src/lib/appwrite.ts                 src/lib/api/appwrite-admin.ts
src/lib/api/auth-check.ts           src/lib/passkeys/
src/lib/constants/collections.ts    src/contexts/AuthContext.tsx
src/lib/emailIntegration.ts         src/lib/emailSender.ts
src/lib/emailService.ts             src/lib/api/logger.ts
src/app/api/* (except [...nextauth])   → 27 route files
src/app/admin/*                      → all custom admin pages
src/app/auth/callback/               → handled by Auth.js
src/middleware.ts                    → replaced by proxy.ts
open-next.config.ts                 wrangler.jsonc
mcp-server-appwrite/                opencode.json
```

---

## Phase 0: Clean Slate + Payload Install (Next.js 16)

```bash
# Create fresh Next.js 16 project (or upgrade)
npx create-next-app@latest ieee --typescript --tailwind --app --src-dir

# Install Payload + deps
npm install payload @payloadcms/next @payloadcms/db-sqlite @payloadcms/richtext-lexical sharp
npm install payload-authjs next-auth@beta @auth/payload-adapter next-auth/providers/google
npm install @payloadcms/email-nodemailer nodemailer
npm install qrcode jspdf @zxing/browser @zxing/library
```

### Files to create:
- `payload.config.ts` — SQLite, admin route, authjs plugin, email adapter, all 8 collections, CSRF whitelist
- `auth.config.ts` — Google OAuth provider. `forgotPassword` disabled. `verify` disabled.
- `auth.ts` — `getAuthjsInstance(payload)` export
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js handler
- `proxy.ts` — Auth.js proxy for Next.js 16 (replaces `middleware.ts`)
- `src/payload/collections/*.ts` — 8 collection files
- `src/payload/hooks/*.ts` — 3 hook files
- `src/payload/endpoints/*.ts` — check-in endpoints

### Files to keep (pure functions, called from hooks):
- `src/lib/pdfReceiptGenerator.ts` — `generatePaymentReceipt()` returns PDF buffer
- `src/lib/ticketGenerator.ts` — `generateQRCode()` returns base64 PNG
- `src/lib/email/templates.ts` — HTML template functions (pure, no transport)

---

## Phase 1: Collections (8)

### `users` (auth via payload-authjs)
| Field | Type | Notes |
|---|---|---|
| `email` | Email (unique) | From Google |
| `name` | Text | From Google |
| `image` | Upload | Google avatar |
| `phone` | Text | Optional |
| `sahrdayaEmail` | Text | @sahrdaya.ac.in |
| `semester` | Select | S1–S8 |
| `department` | Select | CSE, ECE, EEE, ME, CE, IT, AEI, Other |
| `section` | Select | A, B, C, D |
| `rollNumber` | Text | Optional |
| `foodPreference` | Text | Optional |
| `residence` | Text | Optional |
| `profileCompleted` | Checkbox | Default false |
| `role` | Select | `user` or `admin` |
| `teams` | Array of Text | e.g. `["chair_csi"]` |

Auth config: `forgotPassword: { disable: true }`, no verify.

### `societies` (upload)
`name`, `slug`, `bio`, `logo`, `banner`, `chairs` (relation → users)

### `execom` (upload)
`name`, `position`, `society` (relation → societies), `photo`, `order`, `batch`, `linkedin`, `email`

### `events` (upload)
All 35 fields: title, slug, description, date, end_date, venue, price, society, banner, status, capacity, registration settings, waitlist, pricing tiers, check-in settings, contact, content (speakers/schedule/faqs as JSON), soft delete

### `registrations`
| Field | Type | Notes |
|---|---|---|
| `user` | Relation → users | |
| `event` | Relation → events | |
| `user_name` | Text | Denormalized |
| `user_email` | Text | Denormalized |
| `user_phone` | Text | Denormalized |
| `form_responses` | JSON | Form answers |
| `payment_status` | Select | pending/paid/failed/refunded/not_required |
| `payment_amount` | Number | |
| `payment_ticket_id` | Text | DDM ticket ID |
| `payment_reference` | Text | DDM reference |
| `registration_status` | Select | pending/confirmed/cancelled/expired |
| `ticket` | JSON | `{ ticket_id, ticket_code, qr_code, is_scanned }` |
| `checked_in` | Checkbox | |
| `checked_in_at` | Date | |
| `checked_in_by` | Relation → users | |
| `check_in_history` | JSON | Multi-location timeline |

**Hooks:**
- `afterChange`: if status=confirmed → generate QR code → `payload.sendEmail()` with template + PDF receipt
- `beforeChange`: if paid event → create `order` document (DDM handled in order hook)

### `orders`
`user`, `registration`, `amount`, `payment_method`, `payment_status`, `ddm_ticket_id`, `ddm_response` (JSON), `coupon`, `discounted_amount`

**Custom endpoint:** `POST /api/orders/webhook` — DDM SMS callback

**Hooks:**
- `beforeChange` (create): call `POST pay.mulearnscet.in/ticket`, store response

### `coupons`
`code`, `discount_type`, `discount_value`, `max_uses`, `used_count`, `expires_at`, `event` (relation, null=all), `is_active`

### `email-logs`
`recipient`, `subject`, `template`, `status`, `error`, `sent_at`, `registration`

---

## Phase 2: Auth — Google OAuth Only

- `signIn("google")` → Auth.js creates/updates Payload user → `usePayloadSession()` on frontend
- No passkeys, no email/password, no forgot/reset password
- Auth callback page deleted — Auth.js handles `/api/auth/callback/google`
- CSRF: `serverURL` + whitelist `['https://ieeesahrdaya.com']` in Payload config

---

## Phase 3: Email — Payload Adapter (Simplified)

**Before (3 files):** `emailService.ts` → `emailSender.ts` → `emailIntegration.ts`
**After (1 call):** `payload.sendEmail({ to, subject, html, attachments })` directly in hooks

```
hooks/registrations.ts:
  const pdfBuffer = await generatePaymentReceipt(data)
  const html = registrationTemplate(variables)
  await payload.sendEmail({
    to: reg.user_email,
    subject: 'Registration Confirmed',
    html,
    attachments: [{ filename: 'receipt.pdf', content: pdfBuffer }],
  })
```

---

## Phase 4: API Routes (5 custom, rest auto-generated)

### Auto-generated by Payload:
```
GET/POST    /api/{collection}          ← full CRUD for all 8
PATCH/DELETE /api/{collection}/:id
POST        /api/users/login/logout/me ← Auth.js handles
```

### Custom (5 total, down from 27):
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/orders/webhook` | DDM payment callback |
| `POST` | `/api/check-in/verify` | QR check-in |
| `GET` | `/api/check-in/search` | Search attendees |
| `GET` | `/api/check-in/export/:eventId` | CSV export |
| `POST` | `/api/bulk-email` | Admin bulk email |

---

## Phase 5: Frontend — Payload Local API for Performance

| Page | Data source | Method |
|---|---|---|
| Event listing | Server component | `payload.find({ collection: 'events' })` |
| Event detail | Server component | `payload.findByID({ collection: 'events' })` |
| Society pages | Server component | `payload.find({ collection: 'societies' })` |
| Execom pages | Server component | `payload.find({ collection: 'execom' })` |
| My tickets | Client component | `fetch('/api/registrations?where...')` |
| Payment status | Client component (polling 2s) | `fetch('/api/orders/:id')` ← no WebSocket |
| Login | Client component | `signIn("google")` |

Server components use Payload Local API (direct DB, no HTTP). Client components use `fetch()` to same-origin Payload REST API.

---

## Phase 6: DDM Payment (Polling Only)

```
Frontend POST /api/registrations
  → beforeChange: if paid, create order (payload.create)
  → order.beforeChange: POST pay.mulearnscet.in/ticket, save ddm_ticket_id
  → Frontend returns UPI QR to user

User pays via UPI

Frontend polls GET /api/orders/:id every 2s  ← no WebSocket

DDM sends SMS → POST /api/orders/webhook
  → updates order payment_status = 'paid'
  → updates registration: status = confirmed, generates ticket + QR
  → afterChange on registration: payload.sendEmail(confirmation + receipt)
```

---

## Phase 7: Auth.js Proxy (Next.js 16)

Next.js 16 uses `proxy.ts` instead of `middleware.ts`:

```typescript
// proxy.ts
export { auth as proxy } from "./auth";
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|admin).*)"],
};
```

---

## Phase 8: Data Migration (~500 records)

| Order | Collection | Count |
|---|---|---|
| 1 | `societies` | ~10 |
| 2 | `execom` | ~30 |
| 3 | `users` (merge Appwrite `users` + `members`) | ~200 |
| 4 | `events` | ~20 |
| 5 | `registrations` | ~200 |
| 6 | `email-logs` | ~50 |

Script: `npx tsx migration/migrate-from-appwrite.ts`

---

## Phase 9: Cutover

1. Run migration
2. Update DDM webhook URL → `https://ieeesahrdaya.com/api/orders/webhook`
3. Point domain to Dokploy
4. Test: login, event list, register (free + paid), payment (polling), check-in, admin UI
5. Turn off Appwrite

---

## Deployment

### Containers
| Container | Image | Port | Volume |
|---|---|---|---|
| `ieee-app` | Next.js 16 + Payload | 3000 | `payload-data:/app/data` |
| `ddm-api` | Fastify (unchanged) | 3001 | `ddm-data:/app/data` |

### Dockerfile
```dockerfile
FROM node:22-alpine AS base
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
```

### Environment variables (12)
```
PAYLOAD_SECRET=
DATABASE_URI=file:./data/payload.db
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=https://ieeesahrdaya.com
PAYMENT_API_URL=http://pay.mulearnscet.in
PAYMENT_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
NEXT_PUBLIC_APP_URL=https://ieeesahrdaya.com
```

33 env vars removed.

---

## Timeline

| Phase | What | Hours |
|---|---|---|
| 0 | Next.js 16 + Payload install + admin verify | 4 |
| 1 | 8 collections + access control | 6 |
| 2 | Auth: Google OAuth via payload-authjs | 3 |
| 3 | Email: Payload adapter + templates | 2 |
| 4 | Hooks: registrations (email+QR) + orders (DDM) + webhook | 4 |
| 5 | Custom endpoints: check-in, export, bulk-email | 3 |
| 6 | Frontend: swap Appwrite → Payload Local API | 6 |
| 7 | Data migration script | 3 |
| 8 | Cutover + test | 3 |
| **Total** | | **~34 hours** |

---

## Key Decisions

| Decision | Why |
|---|---|
| Next.js 16 | Latest, best performance, Payload v3 supports it |
| Polling only (no WebSocket) | Simpler, DDM API evolves independently |
| No custom admin pages | Payload admin does everything we need |
| No form builder | Removed for now, simplifies scope |
| No ecommerce plugin | Not needed — events ≠ products |
| Keep pdfReceiptGenerator + ticketGenerator | Pure functions, work fine in hooks |
| payload.sendEmail() directly | Replaces 3 email files with 1 call |
| Local API in server components | Zero HTTP overhead, fastest possible |
| 5 custom endpoints (down from 27) | Payload auto-CRUD covers the rest |
| Admin roles set manually later | One-time setup in Payload admin |
| CSRF whitelist | Simple, effective for known domains |
