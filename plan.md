# Appwrite → Payload CMS Migration Plan

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Dokploy VPS (single host)                     │
│                                                                │
│  ┌─────────────────────────────────────┐   ┌──────────────┐   │
│  │  Container: ieee-app                │   │  Container:   │   │
│  │  (Next.js 15 + Payload CMS v3)      │   │  ddm-api      │   │
│  │                                     │   │  (Fastify)    │   │
│  │  / → Public pages (events, tickets) │   │              │   │
│  │  /admin → Payload admin dashboard   │   │  POST /ticket │   │
│  │  /api/payload → Payload REST API    │   │  GET /status  │   │
│  │  /api/webhook/ddm → DDM callback    │   │  POST /webhook│   │
│  │                                     │   │              │   │
│  │  Storage: SQLite (persistent volume)│   │  SQLite       │   │
│  │  Uploads: Cloudinary adapter        │   │  (volume)     │   │
│  └─────────────────────────────────────┘   └──────────────┘   │
│                                     ↑ calls                    │
│                                     DDM API                    │
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
npm install payload @payloadcms/next @payloadcms/db-sqlite @payloadcms/richtext-lexical @payloadcms/plugin-cloud-storage
```

2. **Create `payload.config.ts`** in project root:
   - Database: SQLite (`@payloadcms/db-sqlite`)
   - Admin route: `/admin`
   - Collections: start with `users`, `execom`, `societies`
   - Local API: enabled (for server components)
   - No auth strategies beyond email/password for now

3. **Update `next.config.mjs`** to add Payload plugin:
   - Import and wrap with `withPayload()`

4. **Create `src/payload-collections/`** directory — all Payload collections go here

5. **Create `crypto-polyfill.ts`** or configure webpack for Payload's Node.js crypto dependency

6. **Verify:** Payload admin at `localhost:3000/admin` renders with SQLite

### Files created:
- `payload.config.ts`
- `src/payload-collections/Users.ts`
- `src/payload-collections/Execom.ts`
- `src/payload-collections/Societies.ts`
- `crypto-polyfill.ts` (if needed)
- `src/lib/payload.ts` — Payload client helper

### Files modified:
- `next.config.mjs` — add `withPayload()`
- `tsconfig.json` — add path aliases if needed
- `package.json` — new dependencies

---

## Phase 1: Collections

**Goal:** Payload collections that mirror Appwrite's data model. Appwrite stays primary; Payload is populated via migration script later.

### Collection: `users` (built-in, extended)

| Field | Type | Notes |
|---|---|---|
| `email` | Email (unique) | Required |
| `password` | Password | Required |
| `name` | Text | Required |
| `phone` | Text | Optional |
| `college` | Text | Optional |
| `department` | Select | Optional |
| `semester` | Select | Optional |
| `rollNumber` | Text | Optional |
| `role` | Select | `user` or `admin` — controls admin access |

### Collection: `societies`

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required, unique |
| `slug` | Text | Auto-generated from name |
| `bio` | Rich Text | Optional |
| `logo_url` | Upload | Cloudinary adapter |
| `banner_url` | Upload | Cloudinary adapter |

### Collection: `execom`

| Field | Type | Notes |
|---|---|---|
| `name` | Text | Required |
| `position` | Text | Required |
| `society` | Relationship → `societies` | Optional |
| `photo_url` | Upload | Cloudinary adapter |
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
| `banner` | Upload | Cloudinary adapter |
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

## Phase 2: Data Migration (Execom + Societies)

**Goal:** Export existing Appwrite data and import into Payload. Appwrite stays untouched.

### Step 2a: Migration Script (`scripts/migrate-from-appwrite.ts`)

```typescript
// Run with: npx tsx scripts/migrate-from-appwrite.ts
// 1. Connect to Appwrite using existing env vars
// 2. Query all societies
// 3. Query all execom
// 4. Transform documents to match Payload collection schemas
// 5. Connect to Payload via REST API
// 6. Create each document in Payload
// 7. Log any failures
```

**Execution:** `npx tsx scripts/migrate-from-appwrite.ts`

### Migration order:
1. `societies` first (no dependencies)
2. `execom` second (depends on societies for relationship)
3. `users` (if migrating — can be deferred)
4. `events` (depends on societies)
5. `registrations` (depends on users + events)
6. `check-ins` (depends on registrations)

---

## Phase 3: API Route Rewrite (Appwrite → Payload)

**Goal:** Replace every `appwrite.databases.*` and `account.*` call with Payload Local API (server) or REST API (client).

### Layer 1: Data access layer (`src/lib/api/appwrite-admin.ts`)
- Create `src/lib/api/payload-admin.ts` with equivalent functions using Payload's Local API
- Same function signatures, different implementation

### Layer 2: Auth context (`src/contexts/AuthContext.tsx`)
- `account.get()` → `fetch('/api/users/me')`
- `account.createOAuth2Session()` → custom Google OAuth flow or Payload's auth
- `account.deleteSession()` → Payload logout endpoint
- `account.createJWT()` → Payload JWT endpoint

### Layer 3: Individual API routes (~27 route files)
Each route file needs Appwrite SDK calls replaced with Payload Local API calls.

---

## Phase 4: Frontend Data Layer Swap

**Goal:** Client components that call Appwrite SDK directly → call Payload REST API or use server components with Local API.

Files to modify: `AuthContext.tsx`, `LoginModal.tsx`, admin pages, event pages, society pages, execom pages.

---

## Phase 5: DDM Payment Integration

**Goal:** Replace direct DDM API calls in the frontend with Payload-managed orders.

### Flow:
1. Frontend creates a Payload `order` document
2. `beforeChange` hook on `orders` collection calls DDM `POST /ticket`
3. Hook stores `ddmTicketId` on the order
4. Frontend polls Payload order status (Payload internally polls DDM)
5. DDM webhook callback hits Payload API route → updates order

### Key files:
- `src/payload-collections/hooks/createDdmTicket.ts` — DDM API hook
- `src/app/api/webhook/ddm/route.ts` — DDM webhook receiver

---

## Phase 6: Auth (Simplified — Email/Password Only)

**Goal:** Replace Appwrite auth with Payload's built-in email/password auth.

### Auth flow:
1. Login: Email + password → `POST /api/users/login`
2. Signup: Email + password + profile → `POST /api/users`
3. Session: Cookies (Payload uses `next/headers`)
4. Logout: `POST /api/users/logout`
5. Middleware: Check Payload session cookie

### Google OAuth can be added later via Payload passport strategies.

---

## Phase 7: Admin Views (Custom)

### Built-in (free):
- All collections get CRUD admin UI automatically

### Custom views needed:
1. **Check-in scanner** — Custom React admin view with QR scanner (`@zxing/browser`), manual search, stats, CSV export. Location: `/admin/custom/check-in`
2. **Dashboard stats widget** — Payload admin dashboard component with totals, charts, recent activity

---

## Phase 8: Cutover

### Pre-cutover:
- All new data flowing through Payload (dual-write to Appwrite for safety)
- Monitor error rates
- Test all flows: registration, payment, check-in, admin

### Cutover day:
1. Final data sync: `npx tsx scripts/migrate-from-appwrite.ts --final`
2. Update env vars in Dokploy: `APPWRITE_ENABLED=false`
3. Rebuild and deploy
4. Verify all flows

### Post-cutover:
- Monitor logs for 48 hours
- Keep Appwrite running (read-only) for 1 week as backup
- Delete Appwrite project after 1 week

---

## Deployment Configuration (Dokploy)

### Dockerfile — update for Payload build (SQLite volume)
### Single container: Next.js + Payload + SQLite
### Separate container: DDM API (unchanged)

### New env vars:
- `PAYLOAD_SECRET` — encryption key
- `DATABASE_URI` — `file:./data/payload.db`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Removed env vars:
- All `NEXT_PUBLIC_APPWRITE_*` variables
- `APPWRITE_API_KEY`
- `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `PASSKEY_HMAC_SECRET`

---

## Phase Order & Timeline

| Phase | Description | Est. Time |
|---|---|---|
| 0 | Install Payload, verify admin renders | 2-3 hours |
| 1 | Create all collections, test in admin UI | 4-6 hours |
| 2 | Migration script, migrate execom + societies | 2-3 hours |
| 3 | Rewrite API routes | 8-12 hours |
| 4 | Rewrite frontend data layer | 4-6 hours |
| 5 | DDM payment integration | 4-6 hours |
| 6 | Auth swap (email/password) | 3-4 hours |
| 7 | Custom admin views | 6-8 hours |
| 8 | Cutover | 2-3 hours |
| **Total** | | **~5-7 days** |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Payload v3 production bugs | Keep Appwrite running, test before cutover |
| SQLite concurrent write contention | Single container = single process = no contention |
| Custom admin views complexity | Check-in scanner can stay in existing frontend |
| Data migration gaps | Test migration script on staging DB first |
| DDM payment hook failure | Add retry logic to hook, admin manual override |
| Cloudinary adapter issues | Fall back to Payload's local upload |
