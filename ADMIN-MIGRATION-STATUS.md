# Admin UI Migration Status

## What was done

Migrated the admin frontend from `submissionPortalV2` (React Router 7) to IEEE (TanStack Start). Created 28 files across shared components, layout route, and 7 admin pages. Backend API routes already existed — only the frontend was missing.

## What is NOT done

**The frontend is NOT a 1:1 match with submissionPortalV2.** It is a structural approximation, not a visual clone. The following gaps remain and MUST be fixed:

### Visual gaps

- **Dashboard hero card** — missing the dark filled card with warm amber accent and CTA button styling. Currently renders as a thin-bordered wireframe card.
- **Metric cards** — stats API returns errors (`"Invalid or expired session"` from `/api/admin/stats`). Cards never render. The API auth flow needs debugging on the server side.
- **Pipeline chart** — registration status stacked bar never renders because stats don't load.
- **Color accuracy** — the oklch dark mode tokens were applied with the wrong CSS selector (`.vh-admin.dark` instead of `.dark .vh-admin`). Fixed in latest commit but needs visual verification that ALL components (cards, badges, inputs, tables) actually pick up the dark tokens.
- **Font rendering** — Geist font override via `.vh-admin` class may not cascade to all child elements. Needs verification that tables, badges, inputs, and selects all render in Geist, not Inter.
- **Light mode** — admin light mode tokens exist but have never been visually verified. May look wrong.
- **Sidebar active state** — amber highlight on active nav item needs verification against submissionPortalV2.

### Functional gaps

- **Stats API** — `/api/admin/stats` returns 401 even with valid auth cookie. The `authenticateAdmin()` function reads cookies via `getRequestHeader("cookie")` from TanStack Start server context. This works for API routes called from server functions but may not work for direct `fetch()` calls from the client. Needs investigation.
- **Event CRUD** — the events table has a delete button but no create/edit form. The "Create Event" button exists but doesn't open a form yet.
- **Registration management** — check-in and cancel work via API, but there's no detail view for individual registrations.
- **Societies** — read-only table. No create/edit form.
- **Users** — role change works but no create/delete.
- **Execom** — read-only table. No create/edit form.
- **Check-in** — basic ticket ID input works, but no QR scanner integration.

## Credentials for testing

| Site | URL | Auth |
|------|-----|------|
| IEEE admin | https://test.ieeesahrdaya.com/admin/dashboard | PB auth cookie (see below) |
| submissionPortalV2 (reference) | https://portal.phloraxx.us.to/admin/dashboard | Email: `souravpbijoy@gmail.com`, Password: `Wasdqwe1@` |

### IEEE PocketBase auth token

```
pb_auth %7B%22token%22%3A%22eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJfcGJfdXNlcnNfYXV0aF8iLCJleHAiOjE3ODI3NTE4NzAsImlkIjoiZXBpMmQ2Zmh1MnY3ajIwIiwicmVmcmVzaGFibGUiOnRydWUsInR5cGUiOiJhdXRoIn0.EtKAfm-8dRmnBGEsk3xDiIk5kEaxDPi85fWkWly4eM0%22%2C%22record%22%3A%7B%22avatar%22%3A%22acg8oc_kr9_uiy_yn0w5_d3jp_gs_nxxl_mt0_16_hod_agkgw9i9_jc7pa8_qk_hw_s96_c_fc8xgtwdb0_ld5pcq4ll5.png%22%2C%22collectionId%22%3A%22_pb_users_auth_%22%2C%22collectionName%22%3A%22users%22%2C%22created%22%3A%222026-06-09%2008%3A06%3A11.111Z%22%2C%22email%22%3A%22sourav223929%40sahrdaya.ac.in%22%2C%22emailVisibility%22%3Afalse%2C%22id%22%3A%22epi2d6fhu2v7j20%22%2C%22name%22%3A%22Sourav%20223929%22%2C%22role%22%3A%22admin%22%2C%22updated%22%3A%222026-06-11%2016%3A30%3A45.746Z%22%2C%22verified%22%3Atrue%7D%7D
```

Set this as the `pb_auth` cookie on `test.ieeesahrdaya.com` to access admin pages.

## Files created/modified

### Modified (2)
- `src/features/globals.css` — dark mode tokens, motion system, admin-scoped CSS (`.vh-admin`)
- `src/routes/__root.tsx` — theme init script (dark default on `/admin` routes)

### Created — shared components (10)
- `src/components/admin/metric-card.tsx`
- `src/components/admin/panel-header.tsx`
- `src/components/admin/data-list.tsx`
- `src/components/admin/callout.tsx`
- `src/components/admin/confirm-button.tsx`
- `src/components/admin/page-transition.tsx`
- `src/components/admin/route-error-boundary.tsx`
- `src/components/admin/admin-sidebar.tsx`
- `src/components/admin/admin-topbar.tsx`
- `src/components/admin/admin-guard.tsx`

### Created — layout + pages (8)
- `src/routes/admin.tsx` — layout route (sidebar, topbar, auth guard, theme toggle)
- `src/routes/admin.dashboard.tsx` — stats overview
- `src/routes/admin.events.tsx` — events table with CRUD
- `src/routes/admin.registrations.tsx` — registrations table with actions
- `src/routes/admin.societies.tsx` — societies table
- `src/routes/admin.users.tsx` — users table with role management
- `src/routes/admin.execom.tsx` — execom members table
- `src/routes/admin.check-in.tsx` — ticket verification

## What needs to happen next

1. **Debug stats API auth** — why does `/api/admin/stats` return 401 with valid cookie?
2. **Visual audit** — open both sites side by side, compare every element, fix differences
3. **Wire up CRUD forms** — create/edit dialogs for events, societies, execom
4. **Verify dark mode tokens** — every component (table, badge, input, select, card, dialog) must use the oklch dark tokens, not fallback to light
5. **Verify Geist font** — all text must render in Geist, not Inter
6. **Test on mobile** — responsive sidebar, touch targets, table scrolling
