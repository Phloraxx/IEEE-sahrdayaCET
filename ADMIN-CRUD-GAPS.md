# Admin CRUD Gap Analysis & Implementation Plan

> Cross-reference of PocketBase database schema vs. existing admin UI.
> Identifies every DB field missing from admin forms and every UI bug.
> Plan for fixing all gaps.
> **Status: ALL GAPS FIXED ✓**

---

## 1. PocketBase Schema — Collections Reference

### `events` collection

| Field | Type | Admin Form Coverage |
|---|---|---|
| `title` | text (required) | ✅ Create + Edit |
| `description` | text | ✅ Create + Edit |
| `date` | date (required) | ✅ Create + Edit |
| `endDate` | date | ✅ Create + Edit |
| `venue` | text (required) | ✅ Create + Edit |
| `price` | number | ✅ Create + Edit |
| `society` | relation → societies (required) | ✅ Create + Edit |
| `banner` | file (image) | ✅ Create + Edit (both have file picker) |
| `status` | select: draft/published/completed | ✅ Create + Edit |
| `maxCapacity` | number | ✅ Create + Edit |
| `registrationOpen` | bool | ✅ Create + Edit |
| `registrationStart` | date | ✅ Create + Edit |
| `registrationDeadline` | date | ✅ Create + Edit |
| **`checkInEnabled`** | bool | ❌ **Missing from both forms** |
| `contactEmail` | email | ✅ Create + Edit |
| `contactPhone` | text | ✅ Create + Edit |
| **`tags`** | text | ❌ **Missing from both forms** |
| `formTemplate` | json | ✅ Create + Edit (via CustomFieldBuilder) |
| `collectIeeeMember` | bool | ✅ Create + Edit |
| `externalFormUrl` | url | ✅ Create + Edit |
| **`externalLink`** | url | ❌ **Missing from both forms** |
| `whatsappLink` | url | ✅ Create + Edit |
| `coupons` | json | ✅ Create + Edit (via CouponManager) |
| `isDeleted` | bool | ✅ (via soft-delete, no direct form) |
| `registeredCount` | number | ✅ (auto-counter, read-only) |
| `checkedInCount` | number | ✅ (auto-counter, read-only) |

### `societies` collection

| Field | Type | Admin Form Coverage |
|---|---|---|
| `name` | text (required) | ✅ Edit form |
| `slug` | text (required) | ✅ Edit form |
| `bio` | text | ✅ Edit form |
| **`logo`** | file (image) | ❌ **Placeholder only — no file picker** |
| **`banner`** | file (image) | ❌ **Placeholder only — no file picker** |
| `isHidden` | bool | ✅ Edit form |
| `chairs` | relation → users | ✅ Edit form (chair search/assign UI works) |

**Additional issues:**
- `defaultWhatsappLink` (text) — submitted by edit form but **does not exist in DB schema**. Either add to schema or remove from UI.
- **No "Create Society" page** — POST API route exists but there's no UI form for creating a new society.

### `registrations` collection

| Field | Type | Admin Form Coverage |
|---|---|---|
| `user` | relation → users | ✅ (auto-assigned on registration) |
| `event` | relation → events | ✅ (auto-assigned on registration) |
| `userName` | text | ✅ Detail page (read-only) |
| `userEmail` | email | ✅ Detail page (read-only) |
| `userPhone` | text | ✅ Detail page (read-only) |
| `formResponses` | json | ✅ Detail page (read-only) |
| **`registrationStatus`** | select: pending/confirmed/cancelled | ❌ **Read-only badge — no edit control** |
| **`paymentStatus`** | select: pending/paid/failed/not_required | ❌ **Read-only badge — no edit control** |
| `ticketId` | text | ✅ Detail page (read-only) |
| `paymentTicketId` | text | ✅ Detail page (read-only) |
| **`amount`** | number | ❌ **Read-only display — no edit** |
| `paymentData` | json | ❌ Not displayed anywhere |
| **`couponCode`** | text | ❌ Not displayed anywhere |
| **`discountAmount`** | number | ❌ Not displayed anywhere |
| `checkedIn` | bool | ✅ Batch toggle in EventDetail + detail display |
| `checkedInAt` | date | ✅ Detail page (read-only) |

**Current PUT API supports:** `checkedIn: true` and `registrationStatus: 'cancelled'` only.
**Missing API support:** `registrationStatus` → 'confirmed', `paymentStatus` updates, `amount` edits.

### `users` collection (PocketBase built-in auth)

| Field | Type | Admin Form Coverage |
|---|---|---|
| `name` | text | ❌ Detail page is read-only |
| `email` | email | ❌ Detail page is read-only |
| `avatar` | file | ❌ Not displayed or editable |
| `role` | select: admin/chair/user | ✅ Role dropdown in users list table |

**Current PUT API supports:** `role` changes only.

### `execom` collection

| Field | Type | Admin Form Coverage |
|---|---|---|
| `name` | text (required) | ❌ **Zero admin pages exist** |
| `position` | text (required) | ❌ |
| `society` | relation → societies | ❌ |
| `photo` | file | ❌ |
| `sectionId` | text | ❌ |
| `order` | number | ❌ |
| `batch` | text | ❌ |
| `department` | text | ❌ |
| `linkedin` | url | ❌ |
| `instagram` | url | ❌ |
| `email` | email | ❌ |
| `phone` | text | ❌ |
| `section` | text | ❌ |

---

## 2. Implementation Plan

### Phase 1: Events — Add missing DB fields

**Files to modify:**
- `src/app/admin/events/new/page.tsx`
- `src/app/admin/events/[id]/edit/page.tsx`

**Changes per file:**

Add to form state:
```ts
checkInEnabled: true,
tags: '',
externalLink: '',
```

Add `handleCheckbox` helper if needed.

Add to submit body:
```ts
checkInEnabled: form.checkInEnabled,
tags: form.tags,
externalLink: form.externalLink,
```

**UI placement:**
- `checkInEnabled` — checkbox in the "Registration" sidebar card (alongside "Enable Registration" and "Collect IEEE Membership ID")
- `tags` — text input in "Basic Information" (after Venue)
- `externalLink` — URL input in "Contact & Status" card (after WhatsApp Link)

**Edit form additionally needs:**
- Load `checkInEnabled`, `tags`, `externalLink` from API response in the `useEffect`
- Set form defaults accordingly

**No API changes needed** — the PUT/POST endpoints pass the entire body to PocketBase.

---

### Phase 2: Societies — Fix uploads, add Create page, fix schema

#### 2a. Fix logo/banner file uploads

**File:** `src/app/admin/societies/[id]/edit/page.tsx`

- Add state: `logoPreview`, `logoFile`, `bannerPreview`, `bannerFile`
- Add `<input type="file">` elements hidden behind the placeholder dropzones, similar to the event form pattern (see `new/page.tsx` lines 161-181)
- On form submit: if files are present, use `FormData` like the event edit form does

**File:** `src/app/api/admin/societies/[id]/route.ts`

- Add multipart/form-data handling (detect content-type, use `req.formData()` for file uploads, `req.json()` otherwise), similar to the events PUT handler

#### 2b. Handle `defaultWhatsappLink`

**Option A (recommended):** Add the field to the DB schema
- File: `scripts/migrate-to-pb.ts` — add to societies collection fields:
  ```ts
  { name: 'defaultWhatsappLink', type: 'url' }
  ```
- Re-run migration with `npm run migrate:pb` (or note that this must be done manually)

**Option B:** Remove from UI form and API body.

#### 2c. Add "Create Society" page

**Files to create:**
- `src/app/admin/societies/new/page.tsx`

Reuse the same form structure from `societies/[id]/edit/page.tsx` but with empty initial values and POST instead of PUT. POST API at `api/admin/societies` already exists.

---

### Phase 3: Registrations — Add inline editing

#### 3a. Extend PUT API

**File:** `src/app/api/admin/registrations/[id]/route.ts`

Add support for:
```ts
if (body.registrationStatus && ['pending', 'confirmed', 'cancelled'].includes(body.registrationStatus)) {
  await adminPB.collection('registrations').update(id, { registrationStatus: body.registrationStatus })
  return Response.json({ success: true, action: 'status_updated' })
}
if (body.paymentStatus && ['pending', 'paid', 'failed', 'not_required'].includes(body.paymentStatus)) {
  await adminPB.collection('registrations').update(id, { paymentStatus: body.paymentStatus })
  return Response.json({ success: true, action: 'payment_updated' })
}
if (typeof body.amount === 'number') {
  await adminPB.collection('registrations').update(id, { amount: body.amount })
  return Response.json({ success: true, action: 'amount_updated' })
}
```

#### 3b. Add inline editing to registration detail page

**File:** `src/app/admin/registrations/[id]/page.tsx`

Convert the static server component to a client component, or add a client-side wrapper that fetches the registration and allows inline editing of:
- `registrationStatus` — dropdown select (pending/confirmed/cancelled)
- `paymentStatus` — dropdown select (pending/paid/failed/not_required)
- `amount` — number input (optional, for manual override)

Each change auto-saves via PUT API.

#### 3c. Add status editing to registrations list

**File:** `src/app/admin/registrations/RegistrationsClient.tsx`

Add ability to click on a registration status badge and change it inline, or add batch action buttons for confirming/cancelling selected registrations.

---

### Phase 4: Execom — Basic CRUD

#### 4a. API routes

**File to create:** `src/app/api/admin/execom/route.ts`
```ts
GET — list all execom members (supports search, pagination)
POST — create a new execom member
```

**File to create:** `src/app/api/admin/execom/[id]/route.ts`
```ts
GET — get single execom member
PUT — update execom member (including photo upload)
DELETE — delete execom member
```

#### 4b. List page

**File to create:** `src/app/admin/execom/page.tsx`

Shows table with columns: Name, Position, Society, Department, Actions.

#### 4c. Create page

**File to create:** `src/app/admin/execom/new/page.tsx`

Form with fields: name, position, society (select), department, batch, section, sectionId, order, linkedin, instagram, email, phone, photo (file upload).

#### 4d. Edit page

**File to create:** `src/app/admin/execom/[id]/edit/page.tsx`

Same form as create but populated with existing values.

#### 4e. Sidebar navigation

**File:** `src/components/admin/AdminSidebar.tsx`

Add "Execom" link under the "Administration" section (admin-only, below Users).

---

### Phase 5: Users — Add detail page editing

#### 5a. Extend PUT API

**File:** `src/app/api/admin/users/route.ts`

Add support for updating `name` and `email` alongside `role`.

#### 5b. Add editing to user detail page

**File:** `src/app/admin/users/[id]/page.tsx`

Convert to client component and add inline editing for name and email fields, with auto-save.

---

## 3. Files to Create (New)

| File | Purpose |
|---|---|
| `src/app/admin/societies/new/page.tsx` | Create Society form |
| `src/app/admin/execom/page.tsx` | Execom list |
| `src/app/admin/execom/new/page.tsx` | Execom create form |
| `src/app/admin/execom/[id]/edit/page.tsx` | Execom edit form |
| `src/app/api/admin/execom/route.ts` | Execom list + create API |
| `src/app/api/admin/execom/[id]/route.ts` | Execom get/update/delete API |

## 4. Files to Modify (Existing)

| File | Change |
|---|---|
| `src/app/admin/events/new/page.tsx` | Add checkInEnabled, tags, externalLink |
| `src/app/admin/events/[id]/edit/page.tsx` | Add checkInEnabled, tags, externalLink + load/edit |
| `src/app/admin/societies/[id]/edit/page.tsx` | Add real logo/banner file pickers, fix defaultWhatsappLink |
| `src/app/api/admin/societies/[id]/route.ts` | Add FormData/multipart handling |
| `src/app/admin/registrations/[id]/page.tsx` | Add inline status/payment editing |
| `src/app/api/admin/registrations/[id]/route.ts` | Extend PUT to support status/payment/amount updates |
| `src/app/admin/registrations/RegistrationsClient.tsx` | Add inline status editing |
| `src/app/admin/users/[id]/page.tsx` | Add name/email editing |
| `src/app/api/admin/users/route.ts` | Add name/email update support |
| `src/components/admin/AdminSidebar.tsx` | Add Execom nav link |
| `scripts/migrate-to-pb.ts` | Add defaultWhatsappLink to societies schema |

## 5. Risk Assessment

| Change | Risk Level | Mitigation |
|---|---|---|
| Event forms (checkInEnabled, tags, externalLink) | 🟢 Low | Pure additive — no existing fields touched |
| Society file uploads | 🟡 Medium | Requires multipart handling in API — match event form pattern exactly |
| defaultWhatsappLink schema change | 🟡 Medium | Requires DB migration — document as manual step |
| Registration PUT API extension | 🟢 Low | Adds new branches, existing `checkedIn`/`cancelled` paths unchanged |
| Registration detail page (server→client) | 🟡 Medium | Must preserve chair-scoping and error handling |
| Execom CRUD | 🟢 Low | Greenfield — independent of existing code |
| Users detail page (server→client) | 🟡 Medium | Must preserve auth/error structure |
| Sidebar nav change | 🟢 Low | One-line addition |

---

*Document generated by Reasonix during gap analysis. Update as implementation progresses.*
