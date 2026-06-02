# Appwrite → Payload CMS Migration Plan (Re-Architected)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Dokploy VPS (single host)                     │
│                          Domain: ieeesahrdaya.com              │
│                                                               │
│  ┌─────────────────────────────────────────┐  ┌──────────────┐│
│  │  Container: ieee-app                     │  │  Container:  ││
│  │  (Next.js 15 + Payload CMS v3)          │  │  ddm-api     ││
│  │                                          │  │  (Fastify)   ││
│  │  Payload built-in features used:         │  │              ││
│  │  ✅ REST API (auto CRUD /api/*)          │  │  POST /ticket││
│  │  ✅ Auth (Google OAuth via payload-authjs)│  │  GET /status ││
│  │  ✅ Email (Nodemailer via SMTP/Resend)   │  │  POST /webhook│
│  │  ✅ Jobs Queue (tasks + cron)            │  │              ││
│  │  ✅ Access Control (role-based)          │  │  SQLite      ││
│  │  ✅ CSRF + CORS (config whitelist)       │  │  (volume)    ││
│  │  ✅ File Upload (Sharp auto-resize)      │  │              ││
│  │  ✅ Admin UI (full CRUD + custom views)  │  │              ││
│  │  ✅ Custom Endpoints (per collection)    │  │              ││
│  │  ✅ Hooks (beforeChange, afterChange)    │  │              ││
│  │  ✅ TypeScript (auto-generated types)    │  │              ││
│  │  ✅ SDK (@payloadcms/sdk for client)     │  │              ││
│  │                                          │  │              ││
│  │  Storage: SQLite (persistent volume)     │  │              ││
│  │  Uploads: Local disk (volume)            │  │              ││
│  └─────────────────────────────────────────┘  └──────────────┘│
│                                     ↑ calls                    │
│                              pay.mulearnscet.in                │
└──────────────────────────────────────────────────────────────┘
```

## Branch Strategy

```bash
git checkout -b feat/payload-migration
```

Work in this branch. Production stays on `main` (Appwrite). When Payload is ready, merge to `main` and deploy.

---

## Phase 0: Clean Slate + Payload Installation

**Goal:** Remove all Appwrite/Cloudflare dead code, install Payload, verify admin renders.

### Cleanup — delete these files/folders:

| File/Folder | Reason |
|---|---|
| `src/lib/appwrite.ts` | No more Appwrite SDK |
| `src/lib/api/appwrite-admin.ts` | Replaced by Payload Local API |
| `src/lib/passkeys/` | No passkeys |
| `src/lib/api/auth-check.ts` | Replaced by Payload access control |
| `src/contexts/AuthContext.tsx` | Replaced by `usePayloadSession()` |
| `src/lib/constants/collections.ts` | No collection IDs needed |
| `src/app/api/passkeys/*` | No passkey endpoints |
| `src/app/api/auth/bootstrap/route.ts` | No auth bootstrap |
| `src/app/auth/callback/page.tsx` | Auth.js handles OAuth callback |
| `src/middleware.ts` | Auth.js proxy replaces this |
| `open-next.config.ts` | Cloudflare — removed |
| `wrangler.jsonc` | Cloudflare — removed |
| `mcp-server-appwrite/` | Dev tool — removed |
| `opencode.json` | Dev config — removed |

### Install Payload:

```bash
npm install payload @payloadcms/next @payloadcms/db-sqlite @payloadcms/richtext-lexical
npm install payload-authjs next-auth@beta @auth/payload-adapter next-auth/providers/google
npm install @payloadcms/email-nodemailer nodemailer
```

### Create config files:
- `payload.config.ts` — SQLite, admin route `/admin`, authjs plugin, email adapter, all collections
- `auth.config.ts` — Google OAuth provider
- `auth.ts` — Auth.js instance via `getAuthjsInstance(payload)`
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler
- `src/payload-collections/` — all 8 collection files
- `src/lib/api/payload-admin.ts` — Payload Local API helpers

### Update:
- `next.config.mjs` — add `withPayload()`
- `.gitignore` — allow `plan.md`
- `Dockerfile` — standard Node.js for Dokploy
- `package.json` — new deps, remove dead ones

### Verify:
- `localhost:3000/admin` renders Payload admin with SQLite

---

## Phase 1: Collections

**8 collections total.** All automatically get REST API at `/api/{slug}`, admin CRUD UI, and access control.

### Collection: `users` (auth via payload-authjs)

Merges Appwrite `users` + `members`. Auth.js Google OAuth populates email/name/image. Access control in Payload config handles admin role + chair permissions.

| Field | Type | Notes |
|---|---|---|
| `email` | Email (unique) | From Google OAuth |
| `name` | Text | From Google OAuth |
| `image` | Upload | Google avatar |
| `phone` | Text | Optional |
| `personalEmail` | Text | Optional |
| `sahrdayaEmail` | Text | Must end with @sahrdaya.ac.in |
| `semester` | Select | S1–S8 |
| `department` | Select | CSE, ECE, EEE, ME, CE, IT, AEI, Other |
| `section` | Select | A, B, C, D |
| `rollNumber` | Text | Optional |
| `foodPreference` | Text | Optional |
| `residence` | Text | Optional |
| `profileCompleted` | Checkbox | Default false |
| `role` | Select | `user`, `admin` — controls admin access |
| `teams` | Array of Text | e.g., `["chair_csi", "chair_ieee"]` for event permissions |
| `userID` | Text | Original Appwrite ID (migration mapping only) |

### Collection: `societies` (upload enabled)

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required, unique |
| `slug` | Text | Auto-generated |
| `bio` | Text | Optional |
| `logo` | Upload | Image, Sharp auto-resize |
| `banner` | Upload | Image, Sharp auto-resize |
| `chairs` | Relationship → `users` (many) | Society chairs |

### Collection: `execom` (upload enabled)

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required |
| `position` | Text | Required |
| `society` | Relationship → `societies` | Required |
| `photo` | Upload | Image |
| `order` | Number | Display order |
| `batch` | Text | e.g., "2024-25" |
| `linkedin` | Text | Optional |
| `email` | Text | Optional |

### Collection: `events` (upload enabled)

| Field | Type | Notes |
|---|---|---|
| `title` | Text | Required |
| `slug` | Text | Auto-generated |
| `description` | Rich Text | Optional |
| `date` | Date | Required (start date) |
| `end_date` | Date | Optional |
| `venue` | Text | Required |
| `price` | Number | Default 0 |
| `society` | Relationship → `societies` | Required |
| `banner` | Upload | Image |
| `status` | Select | `draft`, `published`, `archived`, `completed`, `cancelled` |
| `max_capacity` | Number | 0 = unlimited |
| `registered_count` | Number | Denormalized counter |
| `checked_in_count` | Number | Denormalized counter |
| `registration_open` | Checkbox | Default true |
| `registration_start` | Date | Optional |
| `registration_deadline` | Date | Optional |
| `form_template` | JSON | Dynamic form fields |
| **Waitlist** | | |
| `enable_waitlist` | Checkbox | Default false |
| `waitlist_limit` | Number | Optional |
| `waitlist_count` | Number | Denormalized |
| **Pricing tiers** | | |
| `is_paid` | Checkbox | Whether payment required |
| `ieee_member_price` | Number | Optional |
| `non_member_price` | Number | Optional |
| `early_bird_price` | Number | Optional |
| `early_bird_deadline` | Date | Optional |
| `pricing_tiers` | JSON | Custom tiers |
| `currency` | Text | Default "INR" |
| **Check-in settings** | | |
| `check_in_enabled` | Checkbox | Default true |
| `self_check_in` | Checkbox | Default false |
| **Contact** | | |
| `contact_email` | Text | Optional |
| `contact_phone` | Text | Optional |
| `external_link` | Text | Optional |
| **Content** | | |
| `tags` | Text | Comma-separated |
| `category` | Select | Optional |
| `speakers` | JSON | Array |
| `schedule` | JSON | Array |
| `faqs` | JSON | Array |
| **Soft delete** | | |
| `is_deleted` | Checkbox | Default false |

### Collection: `registrations`

**Check-in state stored directly here** (no separate collection). Ticket data embedded as JSON.

| Field | Type | Notes |
|---|---|---|
| `user` | Relationship → `users` | Required |
| `event` | Relationship → `events` | Required |
| `user_name` | Text | Denormalized |
| `user_email` | Text | Denormalized |
| `user_phone` | Text | Denormalized |
| `form_responses` | JSON | Custom form answers |
| `payment_status` | Select | `pending`, `paid`, `completed`, `failed`, `refunded`, `not_required` |
| `payment_amount` | Number | Optional |
| `payment_ticket_id` | Text | DDM ticket ID |
| `payment_reference` | Text | DDM reference |
| `registration_status` | Select | `pending`, `confirmed`, `cancelled`, `expired`, `waitlisted` |
| `registration_date` | Date | Auto-set |
| `ticket` | JSON | Embedded: `{ ticket_id, ticket_code, qr_code, is_scanned, ... }` |
| **Check-in** | | |
| `checked_in` | Checkbox | Default false |
| `checked_in_at` | Date | Optional |
| `checked_in_by` | Relationship → `users` | Optional |
| `last_check_in_location` | Text | e.g., "entrance" |
| `check_in_history` | JSON | `[{ location, checked_in_at, checked_in_by }]` |

**Hooks:**
- `afterChange` → queue `sendConfirmationEmail` job via Jobs Queue
- `beforeChange` (if paid event) → create DDM ticket via DDM API

### Collection: `orders`

Tracks DDM payment lifecycle.

| Field | Type | Notes |
|---|---|---|
| `user` | Relationship → `users` | Required |
| `registration` | Relationship → `registrations` | Required |
| `amount` | Number | Required |
| `payment_method` | Select | `upi`, `cash` |
| `payment_status` | Select | `pending`, `paid`, `failed`, `refunded` |
| `ddm_ticket_id` | Text | DDM ticket reference |
| `ddm_response` | JSON | Raw DDM API response |
| `coupon` | Relationship → `coupons` | Optional |
| `discounted_amount` | Number | Optional |

**Custom endpoint:** `POST /api/orders/webhook` — receives DDM SMS callback, updates order + confirms registration.

### Collection: `coupons`

| Field | Type | Notes |
|---|---|---|
| `code` | Text | Unique, uppercase |
| `discount_type` | Select | `percentage`, `fixed` |
| `discount_value` | Number | Required |
| `max_uses` | Number | Null = unlimited |
| `used_count` | Number | Auto-increment |
| `expires_at` | Date | Optional |
| `event` | Relationship → `events` | Null = all events |
| `is_active` | Checkbox | Default true |

### Collection: `email-logs`

| Field | Type | Notes |
|---|---|---|
| `recipient` | Email | Required |
| `subject` | Text | Required |
| `template` | Text | Optional |
| `status` | Select | `sent`, `failed`, `pending` |
| `error` | Text | Optional |
| `sent_at` | Date | Auto |
| `registration` | Relationship → `registrations` | Optional |

---

## Phase 2: Access Control

Payload's built-in per-collection, per-operation access control replaces Appwrite Teams entirely.

```typescript
// users
read:   self or admin
create: anyone (via Google OAuth)
update: self or admin
delete: admin only
admin:  { user.role: { equals: 'admin' } }

// societies
read:   public
create: admin only
update: admin or chair (user.teams includes 'chair_{slug}')
delete: admin only

// execom
read:   public
create: admin or chair
update: admin or chair
delete: admin only

// events
read:   public (where status = published), all for admin/chair
create: admin or chair
update: admin or chair
delete: admin only

// registrations
read:   self or admin/chair (for their event)
create: authenticated users
update: admin/chair only
delete: admin only

// orders
read:   self or admin
create: authenticated users
update: admin only
delete: admin only

// coupons
read:   admin only
create: admin only
update: admin only
delete: admin only

// email-logs
read:   admin only
create: system (hooks)
update: admin only
delete: admin only
```

**Chair check utility function:**
```typescript
const isChairOf = (user, society) =>
  user?.teams?.includes(`chair_${society.slug}`);
```

---

## Phase 3: Auth — Google OAuth via payload-authjs

### How it works:
1. User clicks "Sign in with Google" → `signIn("google")` from Auth.js
2. Google redirects to `/api/auth/callback/google`
3. Auth.js creates/updates user in Payload's `users` collection
4. `payload-authjs` creates Payload session from Auth.js session
5. Frontend uses `usePayloadSession()` (client) or `getPayloadSession()` (server)

### Files:
- `auth.config.ts` — Google OAuth provider config
- `auth.ts` — `getAuthjsInstance(payload)` export
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js handler
- `proxy.ts` (Next.js 16) or `middleware.ts` (Next.js 15) — Keep session alive

### Auth context replacement:
```
Before (Appwrite):            After (Auth.js + Payload):
account.get()                 getPayloadSession()
account.createOAuth2Session   signIn("google")
account.deleteSession()       signOut()
account.createJWT()           Built into Auth.js session
```

### Notes:
- No passkeys — users re-authenticate via Google
- Google OAuth is the only auth method
- Auth callback page (`/auth/callback`) is **removed** — Auth.js handles it at `/api/auth/callback/google`

---

## Phase 4: Email — Payload Built-in

### Configuration:
```typescript
// payload.config.ts
email: nodemailerAdapter({
  defaultFromAddress: 'noreply@ieeesahrdaya.com',
  defaultFromName: 'IEEE Sahrdaya SB',
  transportOptions: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
}),
```

### Usage in hooks:
```typescript
// afterChange hook on registrations
await payload.sendEmail({
  to: registration.user_email,
  subject: 'Registration Confirmed',
  html: emailTemplate(registration),
  attachments: [/* PDF receipt */],
});
```

### Replace existing files:
- `src/lib/emailIntegration.ts` → use `payload.sendEmail()` directly
- `src/lib/emailTemplates.ts` → keep template functions, just change the send call
- `src/app/api/admin/emails/*` → most replaced by Payload admin + Jobs Queue

---

## Phase 5: API Routes

### What Payload generates for free:
```bash
GET    /api/{collection}         # List/find
GET    /api/{collection}/count   # Count
GET    /api/{collection}/:id     # By ID
POST   /api/{collection}         # Create
PATCH  /api/{collection}/:id     # Update
DELETE /api/{collection}/:id     # Delete

# Auth operations (for users collection):
POST   /api/users/login          # Auth.js handles via /api/auth
POST   /api/users/logout
GET    /api/users/me
```

### Custom endpoints we write:
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/orders/webhook` | DDM SMS payment callback |
| `POST` | `/api/check-in/verify` | QR code check-in |
| `GET` | `/api/check-in/search` | Search attendees (name/email/ticket) |
| `GET` | `/api/check-in/export/:eventId` | CSV export |
| `POST` | `/api/bulk-email` | Admin bulk email |

### Routes removed (~27 files replaced):
All `src/app/api/*` routes except the custom ones above are **removed**. Payload's REST API + Local API replaces every single one.

---

## Phase 6: Frontend Data Layer Swap

### Auth replacement:
| Component | Old (Appwrite) | New (Payload) |
|---|---|---|
| `AuthContext.tsx` | `account.get()`, `teams.list()` | `usePayloadSession()` + `signIn/signOut` |
| `LoginModal.tsx` | `account.createOAuth2Session()` | `signIn("google")` |
| `auth/callback/page.tsx` | Appwrite OAuth callback | **Removed entirely** — Auth.js handles it |
| `middleware.ts` | Session cookie check | Auth.js proxy (`proxy.ts`) |

### Data fetching replacement:
| Page | Old (Appwrite SDK) | New |
|---|---|---|
| Event listing | `databases.listDocuments()` | `payload.find({ collection: 'events' })` (server) |
| Event detail | `databases.getDocument()` | `payload.findByID({ collection: 'events' })` (server) |
| Society pages | `databases.listDocuments()` | `payload.find({ collection: 'societies' })` (server) |
| Execom pages | `databases.listDocuments()` | `payload.find({ collection: 'execom' })` (server) |
| My tickets | `databases.listDocuments()` | `fetch('/api/registrations?where[user][equals]={userId}')` |
| Event creation | `storage.createFile()` | Payload upload via REST API |
| Payment modal | DDM WebSocket + Appwrite | Poll `GET /api/orders/:id` |

**Client components** use `@payloadcms/sdk` or plain `fetch()` to Payload REST API at `/api/{collection}`.

**Server components** use Payload's Local API directly via `getPayload()`.

---

## Phase 7: DDM Payment Integration

### Flow (using Payload hooks + Jobs Queue):

```
1. Frontend POST /api/registrations (with event + form data)
   ↓
2. beforeChange hook fires on registrations
   ↓
3. If event.is_paid → create order via payload.create({ collection: 'orders' })
   ↓
4. beforeChange hook on orders fires → calls DDM POST /ticket
   ↓
5. DDM returns ticket_id → saved as ddm_ticket_id on order
   ↓
6. Frontend polls GET /api/orders/:id every 2s
   ↓
7. Order status shows 'pending' until DDM webhook hits
   ↓
8. DDM sends SMS → POST /api/orders/webhook → updates order → confirms registration
   ↓
9. afterChange on registration queues sendConfirmationEmail job
```

### Key files:
- `src/payload-collections/hooks/createDdmTicket.ts` — `beforeChange` on `orders`
- `src/payload-collections/hooks/sendConfirmationEmail.ts` — `afterChange` on `registrations`
- `src/payload-collections/endpoints/ddmWebhook.ts` — Custom endpoint on `orders`

---

## Phase 8: Jobs Queue

Payload's built-in Jobs Queue handles async/scheduled tasks.

### Tasks:

| Task | Trigger | Description |
|---|---|---|
| `sendConfirmationEmail` | `afterChange` on registrations (status = confirmed) | Sends confirmation + PDF receipt via `payload.sendEmail()` |
| `pollDdmPayment` | `afterChange` on orders (status = pending) | Polls `GET /status/:ticketId` every 30s for 5 min, updates order |
| `sendBulkEmail` | Admin action via custom endpoint | Sends emails to selected registrations |

### Config:
```typescript
// payload.config.ts
jobs: {
  autoRun: [
    { cron: '* * * * *', queue: 'emails' },
    { cron: '* * * * *', queue: 'ddm-polling' },
  ],
  tasks: [
    sendConfirmationEmailTask,
    pollDdmPaymentTask,
    sendBulkEmailTask,
  ],
}
```

---

## Phase 9: Admin Custom Views

### Built-in (free):
All 8 collections get full Payload admin UI — list view, edit view, filters, sorting, search.

### Custom views we build:
1. **Check-in scanner** at `/admin/check-in`:
   - Camera QR scanner (`@zxing/browser`)
   - Manual search by name/email/ticket
   - Real-time check-in stats
   - Multi-location support
   - CSV export button

2. **Dashboard widgets**:
   - Upcoming events count
   - Today's registrations
   - Check-in rate (percentage)
   - Recent registrations feed

---

## Phase 10: Data Migration

### Data to migrate (~500 records):
| Order | Collection | Count | Depends on |
|---|---|---|---|
| 1 | `societies` | ~10 | — |
| 2 | `execom` | ~30 | societies |
| 3 | `users` | ~200 | — |
| 4 | `events` | ~20 | societies |
| 5 | `registrations` | ~200 | users, events |
| 6 | `email-logs` | ~50 | registrations |

### Migration script: `migration/migrate-from-appwrite.ts`

Reads from Appwrite via `node-appwrite`, writes to Payload via REST API. Transforms field names and data shapes.

---

## Phase 11: Cutover

### Steps:
1. Run final migration: `npx tsx migration/migrate-from-appwrite.ts --final`
2. Update DDM webhook URL in DDM config to `https://ieeesahrdaya.com/api/orders/webhook`
3. Point `ieeesahrdaya.com` or `test.ieeesahrdaya.com` to Dokploy container
4. Test all flows: login (Google OAuth), event listing, registration (free + paid), payment (UPI QR), check-in (QR scan), admin (CRUD all collections)
5. Turn off Appwrite project

### Rollback:
If issues arise during cutover, restore from Dokploy SQLite backup, fix the issue, and re-run migration. Appwrite is turned off only after verification.

---

## Deployment Configuration

### Containers:
| Container | Image | Port | Volume |
|---|---|---|---|
| `ieee-app` | Next.js + Payload (single Dockerfile) | 3000 | `payload-data:/app/data` |
| `ddm-api` | Fastify (unchanged) | 3001 | `ddm-data:/app/data` |

### Dockerfile:
```dockerfile
FROM node:20-alpine AS base
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

### Environment variables (12 total, down from 45):

```bash
# Payload
PAYLOAD_SECRET=<random>
DATABASE_URI=file:./data/payload.db

# Auth.js
AUTH_SECRET=<random>
AUTH_GOOGLE_ID=<google-client-id>
AUTH_GOOGLE_SECRET=<google-client-secret>
AUTH_URL=https://ieeesahrdaya.com

# DDM (unchanged)
PAYMENT_API_URL=http://pay.mulearnscet.in
PAYMENT_WEBHOOK_SECRET=<secret>

# Email (SMTP or Resend)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass

# App
NEXT_PUBLIC_APP_URL=https://ieeesahrdaya.com
```

### Removed (33 env vars):
- All `NEXT_PUBLIC_APPWRITE_*` (14 vars)
- `APPWRITE_API_KEY`
- All `WEBAUTHN_*` and `PASSKEY_*` (3 vars)
- `CRON_SECRET`, `LOG_LEVEL`, `LOG_JSON`, `EMAIL_PROVIDER`
- All collection ID env vars (11 vars)

---

## Phase Order & Timeline

| Phase | Description | Est. Time |
|---|---|---|
| 0 | Clean slate + Payload install + admin verify | 4 hours |
| 1 | Create 8 collections with access control | 6 hours |
| 2 | Deploy Dockerfile, verify SQLite + volumes | 2 hours |
| 3 | Auth — Google OAuth via payload-authjs | 4 hours |
| 4 | Email — configure Payload email adapter | 2 hours |
| 5 | Jobs Queue — set up tasks (confirmation, DDM polling) | 3 hours |
| 6 | Custom endpoints — DDM webhook, check-in APIs | 4 hours |
| 7 | Frontend — swap Appwrite SDK for Payload REST/Local API | 8 hours |
| 8 | Replace AuthContext + LoginModal with usePayloadSession | 3 hours |
| 9 | Custom admin views — check-in scanner + dashboard | 6 hours |
| 10 | Data migration — script + migrate all ~500 records | 3 hours |
| 11 | Cutover — deploy, test, turn off Appwrite | 3 hours |
| **Total** | | **~6-8 weeks part-time** |

---

## Dead Code Cleanup Checklist

After cutover, remove:
```
src/lib/appwrite.ts
src/lib/api/appwrite-admin.ts
src/lib/api/auth-check.ts
src/lib/passkeys/
src/lib/constants/collections.ts
src/contexts/AuthContext.tsx
src/app/api/passkeys/
src/app/api/auth/bootstrap/
src/app/auth/callback/
src/middleware.ts
src/components/LoginModal.tsx          (replace with simpler component)
open-next.config.ts
wrangler.jsonc
mcp-server-appwrite/
opencode.json
```

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Payload v3 production stability | Pin version, test all flows before cutover |
| SQLite concurrent writes | Single container = single process = no contention |
| `payload-authjs` beta | Auth.js 5 is used in production by many; Appwrite stays running during testing |
| Google OAuth config | Register OAuth credentials in Google Cloud Console for `ieeesahrdaya.com` |
| DDM webhook routing | Update DDM webhook URL in DDM API config; test with dry-run |
| Email deliverability | Use existing SMTP/Resend config; test on staging |
| Jobs Queue reliability | Jobs persist in SQLite; auto-retry on failure |
| Data migration gaps | Test migration on staging DB, verify counts, spot-check records |
| Check-in scanner complexity | Can use existing frontend check-in page as fallback |
