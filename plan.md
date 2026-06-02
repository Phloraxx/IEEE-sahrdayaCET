# Appwrite → Payload CMS Migration Plan

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Dokploy VPS (single host)                     │
│                          Domain: ieeesahrdaya.com              │
│  ┌─────────────────────────────────────┐   ┌──────────────┐   │
│  │  Container: ieee-app                │   │  Container:   │   │
│  │  (Next.js 15 + Payload CMS v3)      │   │  ddm-api      │   │
│  │                                     │   │  (Fastify)    │   │
│  │  / → Public pages (events, tickets) │   │              │   │
│  │  /admin → Payload admin dashboard   │   │  POST /ticket │   │
│  │  /api/auth → Auth.js OAuth routes   │   │  GET /status  │   │
│  │  /api/payload → Payload REST API    │   │  POST /webhook│   │
│  │  /api/webhook/ddm → DDM callback    │   │              │   │
│  │                                     │   │  SQLite       │   │
│  │  Storage: SQLite (persistent volume)│   │  (volume)     │   │
│  │  Uploads: Local disk (volume)       │   │              │   │
│  │           Cloudinary (later)        │   │              │   │
│  └─────────────────────────────────────┘   └──────────────┘   │
│                                     ↑ calls                    │
│                              pay.mulearnscet.in                │
└──────────────────────────────────────────────────────────────┘
```

## Branch Strategy

```bash
git checkout -b feat/payload-migration
```

Work in this branch until cutover. Production stays on `main` (Appwrite). When Payload is ready, merge to `main` and deploy.

---

## Phase 0: Payload CMS Installation

**Goal:** Payload running alongside existing Appwrite code, no functionality changes yet.

### Steps:

1. **Install Payload packages:**
```bash
npm install payload @payloadcms/next @payloadcms/db-sqlite @payloadcms/richtext-lexical
npm install payload-authjs next-auth@beta @auth/payload-adapter
npm install next-auth/providers/google
```

2. **Create `payload.config.ts`** in project root:
   - Database: SQLite (`@payloadcms/db-sqlite`)
   - Admin route: `/admin`
   - Collections: all 9 collections
   - Plugins: `authjsPlugin({ authjsConfig })`
   - Local API: enabled

3. **Create `auth.config.ts`** — Auth.js config with Google OAuth provider

4. **Create `auth.ts`** — Auth.js instance using `getAuthjsInstance(payload)`

5. **Add Auth.js route handler** at `app/api/auth/[...nextauth]/route.ts`

6. **Update `next.config.mjs`** — add `withPayload()` plugin

7. **Create `src/payload-collections/`** directory

8. **Verify:** Payload admin at `localhost:3000/admin` renders with SQLite

### Files created:
- `payload.config.ts`
- `auth.config.ts`
- `auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/payload-collections/` (all collection files)
- `src/payload-collections/hooks/createDdmTicket.ts`
- `src/lib/payload.ts` — Payload client helper
- `src/lib/api/payload-admin.ts` — Payload data access layer
- `migration/migrate-from-appwrite.ts` — migration script

### Files modified:
- `next.config.mjs` — add `withPayload()`
- `tsconfig.json` — add path aliases
- `package.json` — new dependencies
- `.gitignore` — allow `plan.md`
- `Dockerfile` — standard Node.js for Dokploy

---

## Phase 1: Collections

**Goal:** Payload collections that mirror Appwrite's data model. Appwrite stays primary; Payload is populated via migration script later.

### Collection: `users` (created by payload-authjs plugin, extended)

| Field | Type | Notes |
|---|---|---|
| `email` | Email (unique) | Provided by Google OAuth |
| `name` | Text | Provided by Google OAuth |
| `image` | Upload | Avatar from Google |
| `phone` | Text | Optional |
| `college` | Text | Optional |
| `department` | Select | Optional |
| `semester` | Select | Optional |
| `rollNumber` | Text | Optional |
| `role` | Select | `user` or `admin` |

### Collection: `societies`

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required, unique |
| `slug` | Text | Auto-generated from name |
| `bio` | Rich Text | Optional |
| `logo_url` | Upload | Local disk volume (Cloudinary later) |
| `banner_url` | Upload | Local disk volume (Cloudinary later) |

### Collection: `execom`

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required |
| `position` | Text | Required |
| `society` | Relationship → `societies` | Optional |
| `photo_url` | Upload | Local disk volume (Cloudinary later) |
| `order` | Number | Display order |
| `batch` | Text | e.g., "2024-25" |
| `linkedin` | Text | Optional |
| `email` | Text | Optional |

### Collection: `events`

| Field | Type | Notes |
|---|---|---|
| `title` | Text | Required |
| `slug` | Text | Auto-generated |
| `description` | Rich Text | Optional |
| `date` | Date | Required |
| `venue` | Text | Required |
| `price` | Number | Required, default 0 |
| `society` | Relationship → `societies` | Optional |
| `max_capacity` | Number | Required |
| `banner` | Upload | Local disk volume (Cloudinary later) |
| `status` | Select | `draft`, `published`, `cancelled` |
| `registrationOpen` | Checkbox | Default true |
| `checkInEnabled` | Checkbox | Default true |
| `contactEmail` | Text | Optional |
| `tags` | Array | Optional |
| `category` | Select | Optional |
| `speakers` | Array | Optional |
| `formTemplate` | JSON | Dynamic registration form fields |
| `isDeleted` | Checkbox | Soft delete |

### Collection: `registrations`

| Field | Type | Notes |
|---|---|---|
| `user` | Relationship → `users` | Required |
| `event` | Relationship → `events` | Required |
| `formData` | JSON | Custom form responses |
| `paymentStatus` | Select | `pending`, `paid`, `failed`, `refunded` |
| `paymentAmount` | Number | Optional |
| `paymentTransactionId` | Text | DDM transaction reference |
| `paymentTicketId` | Text | DDM ticket ID |
| `registrationStatus` | Select | `pending`, `confirmed`, `cancelled` |
| `ticketCode` | Text | Unique QR code data |
| `checkedIn` | Checkbox | Default false |
| `checkedInAt` | Date | Optional |
| `checkedInBy` | Relationship → `users` | Optional |

### Collection: `check-ins`

| Field | Type | Notes |
|---|---|---|
| `registration` | Relationship → `registrations` | Required |
| `event` | Relationship → `events` | Required |
| `checkedInBy` | Relationship → `users` | Required |
| `checkedInAt` | Date | Auto-set |
| `location` | Text | Optional (multi-location support) |
| `method` | Select | `qr_scan`, `manual_search`, `bulk` |

### Collection: `coupons`

| Field | Type | Notes |
|---|---|---|
| `code` | Text | Unique, uppercase |
| `discountType` | Select | `percentage` or `fixed` |
| `discountValue` | Number | Required |
| `maxUses` | Number | Optional, null = unlimited |
| `usedCount` | Number | Auto-incrementing |
| `expiresAt` | Date | Optional |
| `event` | Relationship → `events` | Optional (null = all events) |
| `isActive` | Checkbox | Default true |

### Collection: `orders`

| Field | Type | Notes |
|---|---|---|
| `user` | Relationship → `users` | Required |
| `registration` | Relationship → `registrations` | Required |
| `amount` | Number | Required |
| `paymentMethod` | Select | `upi`, `cash` |
| `paymentStatus` | Select | `pending`, `paid`, `failed`, `refunded` |
| `ddmTicketId` | Text | DDM ticket reference |
| `ddmResponse` | JSON | Raw DDM API response |
| `coupon` | Relationship → `coupons` | Optional |
| `discountedAmount` | Number | Optional |
| `createdAt` | Date | Auto |

### Collection: `email-logs`

| Field | Type | Notes |
|---|---|---|
| `recipient` | Email | Required |
| `subject` | Text | Required |
| `template` | Text | Optional |
| `status` | Select | `sent`, `failed`, `pending` |
| `error` | Text | Optional |
| `sentAt` | Date | Auto |
| `registration` | Relationship → `registrations` | Optional |

---

## Phase 2: Data Migration

**Goal:** Export all existing Appwrite data (~500 records total) and import into Payload.

**Data to migrate:**
- Societies (~10)
- Execom members (~30)
- Users (~200)
- Events (~20)
- Registrations (~200)
- Check-in logs (~50)
- Email logs (~50)

### Migration Script (`migration/migrate-from-appwrite.ts`)

```typescript
// Run: npx tsx migration/migrate-from-appwrite.ts
// 1. Connect to Appwrite using existing env vars
// 2. Query all documents from each collection
// 3. Transform to match Payload schemas
// 4. Create in Payload via REST API
// 5. Log results
```

### Migration order:
1. `societies` (no dependencies)
2. `execom` (depends on societies)
3. `users` (no dependencies)
4. `events` (depends on societies)
5. `registrations` (depends on users + events)
6. `check-ins` (depends on registrations)
7. `email-logs` (depends on registrations)

---

## Phase 3: Auth — Google OAuth via payload-authjs

**Goal:** Replace Appwrite Google OAuth with Auth.js (NextAuth.js) v5 via `payload-authjs` plugin.

### How it works:
1. User clicks "Sign in with Google" → Auth.js initiates Google OAuth flow
2. Google redirects to `/api/auth/callback/google`
3. Auth.js creates/updates user in Payload's `users` collection via database adapter
4. `payload-authjs` creates a Payload session from the Auth.js session
5. Frontend uses `usePayloadSession()` hook (client) or `getPayloadSession()` (server)

### Files:
- `auth.config.ts` — Auth.js config with Google provider
- `auth.ts` — Auth.js instance via `getAuthjsInstance(payload)`
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler
- `middleware.ts` — Auth.js proxy to keep session alive

### Auth context changes:
```
Before (Appwrite):           After (Auth.js + Payload):
account.get()                getPayloadSession()
account.createOAuth2Session  signIn("google")
account.deleteSession()       signOut()
account.createJWT()          Built into Auth.js session
```

### Notes:
- No passkeys — users re-authenticate via Google
- Google OAuth is the only auth method (no email/password)

---

## Phase 4: API Route Rewrite (Appwrite → Payload)

**Goal:** Replace every `appwrite.databases.*` and `appwrite.storage.*` call with Payload Local API (server) or REST API (client).

### Layer 1: Data access layer
- Replace `src/lib/api/appwrite-admin.ts` with `src/lib/api/payload-admin.ts`
- Same function signatures, Payload Local API underneath

### Layer 2: Individual API routes (~27 route files)
Each route: remove Appwrite SDK → use `payload.find()`, `payload.create()`, `payload.update()`, `payload.delete()`

### Key routes to rewrite:
- Event registration (DDM payment flow)
- Check-in (QR verify, search, overview)
- Admin CRUD (events, registrations, email logs)
- Webhook handler

---

## Phase 5: Frontend Data Layer Swap

**Goal:** Client components calling Appwrite SDK → call Payload REST API.

| Component | Old (Appwrite) | New (Payload) |
|---|---|---|
| `AuthContext.tsx` | `account.*`, `teams.*` | `usePayloadSession()`, `signIn/signOut` |
| `LoginModal.tsx` | `account.createSession` | `signIn("google")` |
| Event pages | `databases.listDocuments` | `payload.find()` (server) or fetch |
| Society/Execom pages | `databases.listDocuments` | `payload.find()` (server) or fetch |
| Admin pages | `databases.*` + `account.createJWT` | Payload admin UI (built-in) |
| Event creation | `storage.createFile` | Payload upload (local disk volume) |

---

## Phase 6: DDM Payment Integration

**Goal:** Payload manages DDM ticket creation via collection hooks.

### Flow:
1. Frontend creates a Payload `order` (with registration reference)
2. `beforeChange` hook on `orders` collection calls DDM `POST /ticket` at `pay.mulearnscet.in`
3. Hook stores `ddmTicketId` and raw response on the order
4. Frontend polls Payload order status every 2s
5. DDM webhook callback hits `POST /api/webhook/ddm` → updates order → confirms registration

### Key files:
- `src/payload-collections/hooks/createDdmTicket.ts` — DDM API hook
- `src/app/api/webhook/ddm/route.ts` — DDM webhook receiver

### DDM webhook URL update:
- Current: points to Appwrite-based endpoint
- After cutover: point DDM API to `https://ieeesahrdaya.com/api/webhook/ddm`
- Can be updated later in DDM config (no urgency)

---

## Phase 7: Admin Views (Custom)

### Built-in (free from Payload):
- All 9 collections get full CRUD admin UI automatically
- User management, society/execom editing, event management, registration viewer, coupon admin, order viewer, email log viewer

### Custom views needed:
1. **Check-in scanner** — Custom React admin view with QR scanner (`@zxing/browser`), manual search, check-in stats, CSV export. Location: `/admin/custom/check-in`
2. **Dashboard stats widget** — Payload admin dashboard component with totals, charts, recent registrations

---

## Phase 8: Cutover

### Pre-cutover:
- All new data flowing through Payload
- Monitor error rates for 48 hours
- Test all flows: registration, payment, check-in, admin

### Cutover steps:
1. Run final migration: `npx tsx migration/migrate-from-appwrite.ts --final`
2. Update DDM webhook URL to point to Payload
3. Point domain `ieeesahrdaya.com` to Dokploy container
4. Verify all flows on production domain
5. Turn off Appwrite project (no backup period — Dokploy handles SQLite backups)

### Post-cutover:
- Monitor logs for 48 hours
- Dokploy volume backups cover SQLite data
- Add Cloudinary integration later as a separate task

---

## Deployment Configuration (Dokploy)

### Containers:
| Container | Image | Port | Volume |
|---|---|---|---|
| `ieee-app` | Next.js + Payload (single Dockerfile) | 3000 | `payload-data:/app/data` (SQLite + uploads) |
| `ddm-api` | Fastify (unchanged, existing) | 3001 | `ddm-data:/app/data` |

### Dockerfile:
- Standard Node.js multi-stage build
- No Cloudflare/OpenNext config
- CMD: `node .next/standalone/server.js`

### New env vars:
```
PAYLOAD_SECRET=<random-secret>
DATABASE_URI=file:./data/payload.db
AUTH_SECRET=<nextauth-secret>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
AUTH_URL=https://ieeesahrdaya.com
```

### Changed env vars:
```
PAYMENT_API_URL=http://ddm-api:3001  (internal Docker network)
PAYMENT_WEBHOOK_SECRET=...  (unchanged)
```

### Removed env vars:
```
NEXT_PUBLIC_APPWRITE_ENDPOINT
NEXT_PUBLIC_APPWRITE_PROJECT_ID
NEXT_PUBLIC_APPWRITE_DATABASE_ID
APPWRITE_API_KEY
NEXT_PUBLIC_APPWRITE_SOCIETIES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EVENTS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EXECOM_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_MEMBERS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EVENT_REGISTRATIONS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EVENT_FORM_TEMPLATES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EVENT_TICKETS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_CHECK_IN_SESSIONS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_CHECK_IN_LOGS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EMAIL_TEMPLATES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_EVENT_METADATA_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_SOCIETY_IMAGES_BUCKET_ID
WEBAUTHN_RP_ID
WEBAUTHN_RP_NAME
PASSKEY_HMAC_SECRET
```

---

## Phase Order & Timeline

| Phase | Description | Est. Time |
|---|---|---|
| 0 | Install Payload + Auth.js, verify admin renders | 2-3 hours |
| 1 | Create all 9 collections, test in admin UI | 4-6 hours |
| 2 | Migration script, migrate all data (~500 records) | 2-3 hours |
| 3 | Auth — Google OAuth via payload-authjs | 3-4 hours |
| 4 | Rewrite API routes (Appwrite → Payload Local API) | 8-12 hours |
| 5 | Rewrite frontend data layer (components/pages) | 4-6 hours |
| 6 | DDM payment integration (order hooks + webhook) | 4-6 hours |
| 7 | Custom admin views (check-in scanner, dashboard) | 6-8 hours |
| 8 | Cutover (deploy to Dokploy, turn off Appwrite) | 2-3 hours |
| **Total** | | **~5-7 days** |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Payload v3 production bugs | Pin version, test all flows before cutover |
| SQLite concurrent write contention | Single container = single process = no contention |
| `payload-authjs` beta stability | Auth.js 5 is beta but widely used; keep Appwrite running during testing |
| Custom admin views complexity | Check-in scanner can stay in existing frontend initially |
| Data migration gaps | Test migration script on staging DB first, verify counts |
| DDM payment hook failure | Add retry logic to hook, admin manual override available |
| Local file uploads lost on redeploy | Persistent Docker volume mounted at `/app/data` |
| Google OAuth configuration | Need to set up Google Cloud Console OAuth credentials for `ieeesahrdaya.com` |
