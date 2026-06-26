# Admin Panel Feature Gap Plan

## Scope

Bring the TanStack Start admin panel to feature parity with the payload-migration branch's edit/create forms while keeping the current v2 design language (dark chrome, amber brand, card-surfaced lists, Geist font).

---

## 1. Events Edit Page — `admin.events.$id.edit.tsx`

**Current state:** Single-column form with 14 fields (Identity, Schedule, Registration, Contact). No banner upload, no custom fields, no coupons.

**Target state:** 2-column layout matching payload-migration.

### Layout

```
┌─────────────────────────────┬────────────────────┐
│  Basic Information          │  Registration       │
│  - Title                    │  - Enable reg       │
│  - Banner upload + preview  │  - Price            │
│  - Description              │  - Max capacity     │
│  - Start/End dates          │  - Reg start        │
│  - Tags                     │  - Reg deadline     │
│  - Venue                    │  - QR check-in      │
│                             │  - IEEE member      │
│  Custom Registration Fields │  - External form URL│
│  - Dynamic field builder    │                     │
│                             │  Society             │
│                             │  - Host society sel  │
│                             │                     │
│                             │  Contact & Status    │
│                             │  - Email, phone      │
│                             │  - External link     │
│                             │  - WhatsApp link     │
│                             │  - Status            │
│                             │                     │
│                             │  Coupons             │
│                             │  - Coupon manager    │
└─────────────────────────────┴────────────────────┘
```

### New form fields

| Field | Type | Source |
|-------|------|--------|
| `banner` | File upload + preview | New |
| `tags` | Text input (comma-separated) | New |
| `checkInEnabled` | Checkbox | New |
| `collectIeeeMember` | Checkbox | New |
| `registrationStart` | datetime-local | New |
| `whatsappLink` | URL input | New |
| `externalFormUrl` | URL input (shown when reg closed) | New |
| `formTemplate` | Dynamic field builder | New component |
| `coupons` | Coupon manager | New component |

### Implementation plan

1. **Create `src/features/admin/events/event-form.tsx`** — rewrite as 2-column layout using `AdminPageHeader` + `Card` sections
2. **Create `src/components/admin/custom-field-builder.tsx`** — dynamic form field builder (text, textarea, select, radio, checkbox, date)
3. **Create `src/components/admin/coupon-manager.tsx`** — add/edit/remove coupons with code, discount %, max uses, expiry
4. **Create `src/components/admin/image-upload.tsx`** — reusable file upload with preview + remove button (used for banner, logo)
5. **Update `src/routes/admin.events.$id.edit.tsx`** — wire new form component
6. **Update `src/routes/admin.events.new.tsx`** — wire same form component (create mode)

---

## 2. Events Create Page — `admin.events.new.tsx`

**Current state:** Same single-column form as edit.

**Target state:** Same 2-column layout as edit, all fields pre-filled with defaults.

### Implementation plan

Reuse the same `EventForm` component from edit page, pass `mode="create"`. No separate implementation needed.

---

## 3. Societies Edit Page — `admin.societies.$id.edit.tsx`

**Current state:** Single-column form (Identity, Visuals, Visibility). No chairs management, no image preview.

**Target state:** Single-column max-w-2xl with chairs management.

### New features

| Feature | Type | Source |
|---------|------|--------|
| Chairs management | User search + add/remove list | New |
| Logo preview | Image preview with remove button | New |
| Banner preview | Image preview with remove button | New |
| `defaultWhatsappLink` | URL input | New |

### Implementation plan

1. **Update `src/features/admin/societies/society-form.tsx`** — add chairs section with user search, add/remove list, image previews
2. **Add chairs API query** — fetch `/api/admin/users` for chair search
3. **Add `defaultWhatsappLink` field** to form state

---

## 4. Societies Create Page — `admin.societies.new.tsx`

**Current state:** Same single-column form.

**Target state:** Same as edit but without chairs (chairs added after creation).

### Implementation plan

Reuse `SocietyForm` component, pass `mode="create"`. Hide chairs section in create mode.

---

## 5. Execom Edit Page — `admin.execom.$id.edit.tsx`

**Current state:** Single-column form (Identity, Academic, Contact, Photo).

**Target state:** Same but with loading skeleton and toast notifications.

### Implementation plan

1. **Update `src/features/admin/execom/execom-form.tsx`** — add loading skeleton, add toast on success (or keep navigate-back pattern for consistency)
2. **No new fields needed** — payload-migration version is simpler than current (no photo upload section)

---

## 6. Shared Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `ImageUpload` | `src/components/admin/image-upload.tsx` | File upload with preview + remove |
| `CustomFieldBuilder` | `src/components/admin/custom-field-builder.tsx` | Dynamic registration form fields |
| `CouponManager` | `src/components/admin/coupon-manager.tsx` | Coupon CRUD |
| `FormSection` | `src/features/admin/shared/form-section.tsx` | Reusable section wrapper (currently duplicated in each form) |

---

## 7. API Changes Needed

| Endpoint | Change | Reason |
|----------|--------|--------|
| `GET /api/admin/events/$id` | Ensure `bannerUrl`, `formTemplate`, `coupons` are returned | Edit form needs these |
| `PUT /api/admin/events/$id` | Accept `banner` file, `formTemplate` JSON, `coupons` JSON | Edit form sends these |
| `GET /api/admin/users` | Already exists | Chair search needs it |

---

## 8. Implementation Order

| Phase | Files | Effort |
|-------|-------|--------|
| **Phase 1** | `ImageUpload`, `FormSection` shared components | Small |
| **Phase 2** | `CustomFieldBuilder` component | Medium |
| **Phase 3** | `CouponManager` component | Medium |
| **Phase 4** | Rewrite `EventForm` as 2-column layout | Large |
| **Phase 5** | Update `SocietyForm` with chairs + previews | Medium |
| **Phase 6** | Update `ExecomForm` with loading skeleton | Small |
| **Phase 7** | Wire new forms into route files | Small |
| **Phase 8** | Test all create/edit flows | Medium |

## 11. Loading Skeletons

Every form page must show a skeleton that matches its final layout while data loads.

### Events edit/create skeleton
```tsx
// 2-column layout skeleton
<div className="space-y-6">
  <div className="flex items-center gap-4">
    <Skeleton className="h-8 w-8 rounded-lg" />
    <div className="space-y-1">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  </div>
  <div className="grid gap-6 lg:grid-cols-3">
    <div className="lg:col-span-2 space-y-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  </div>
</div>
```

### Societies edit/create skeleton
```tsx
<div className="space-y-6 max-w-2xl">
  <div className="flex items-center gap-4">
    <Skeleton className="h-8 w-8 rounded-lg" />
    <div className="space-y-1">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  </div>
  <div className="rounded-lg border border-border bg-card p-6 space-y-3">
    <Skeleton className="h-5 w-36" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>
</div>
```

### Execom edit/create skeleton
```tsx
<div className="space-y-4 max-w-2xl">
  <div className="flex items-center gap-4">
    <Skeleton className="h-8 w-8 rounded-lg" />
    <div className="space-y-1">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  </div>
  <div className="rounded-lg border border-border bg-card p-6 space-y-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    ))}
  </div>
</div>
```

### Registration detail skeleton
```tsx
<div className="grid gap-6">
  <div className="rounded-lg border border-border bg-card p-6">
    <Skeleton className="h-4 w-20 mb-2" />
    <Skeleton className="h-8 w-48 mb-3" />
    <Skeleton className="h-4 w-64" />
  </div>
  <div className="grid gap-4 sm:grid-cols-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-6 w-20" />
      </div>
    ))}
  </div>
</div>
```

## 12. Error Handling Pattern

All forms follow the same error pattern:
```tsx
{submitError && (
  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
    {submitError}
  </p>
)}
```

## 13. Success Feedback

Use `navigate({ to: "/admin/..." })` to return to the list page on success.
No toast library required — the list page will refetch and show the updated data.

## 14. CSRF Token

All mutation requests include:
```tsx
headers: {
  "Content-Type": "application/json",
  "x-csrf-token": csrfToken(),
}
```
Where `csrfToken()` reads from `document.cookie`.

## 15. File Upload Pattern

For banner/logo uploads, use FormData when files are present:
```tsx
if (hasFile) {
  const fd = new FormData();
  fd.append("field", value);
  if (file) fd.append("banner", file);
  body = fd;
} else {
  headers["Content-Type"] = "application/json";
  body = JSON.stringify(payload);
}
```

---

## 9. Design Tokens to Use

All new components must follow the current v2 design language:

- **Cards:** `rounded-lg border border-border bg-card`
- **Form inputs:** `rounded-md border border-input bg-transparent px-3 py-2 text-sm`
- **Labels:** `text-sm font-medium text-foreground`
- **Hints:** `text-xs text-muted-foreground`
- **Section headers:** `text-sm font-semibold tracking-tight text-foreground`
- **Section dividers:** `border-b border-border pb-6`
- **Buttons:** shadcn `Button` with `variant="outline"` for cancel, `variant="default"` for submit
- **File upload:** Dashed border dropzone with icon, or preview card with remove button
- **Dark mode:** All colors via CSS variables (oklch tokens from `.dark .vh-admin`)

---

## 10. What NOT to Change

- **Events list page** — delete button already removed, no further changes
- **Registrations list/detail** — already complete
- **Users list** — already complete
- **Check-in page** — already complete
- **Dashboard** — already complete
- **Sidebar/topbar** — already complete
- **Theme toggle** — already complete
- **Mobile responsive** — already complete
