# PocketBase Collection Rules — IEEE Sahrdaya Migration

> **Status**: Audit complete. These are the declarative rules to replace imperative Next.js BFF guards.
> **Migration date**: 2026-06-20

## Philosophy Change

| Before (Next.js BFF) | After (PB Rules) |
|---|---|
| `lib/auth.ts` — `requireAuth()`, `requireAdmin()`, `requireRole()` run in every API route | Collection Rules evaluate every request at PB layer |
| `lib/chair-scope.ts` — 142 lines of imperative filter building | Relations + `?=` operator in rules |
| `getChairScope()` + `buildSocietyFilter()` — 4 DB calls per API route | Zero extra calls; rules are evaluated inline |
| `assertChairEventAccess()` — manual membership check | `@request.auth.id ?= society.chairs.id` |

---

## Users Collection (Auth)

| Rule | Expression | Notes |
|---|---|---|
| **List** | `@request.auth.role = "admin"` | Only admins see all users |
| **View** | `@request.auth.id = id \|\| @request.auth.role = "admin"` | Users see themselves; admins see anyone |
| **Create** | `@request.auth.role = "admin"` | Only admins create users |
| **Update** | `@request.auth.id = id \|\| @request.auth.role = "admin"` | Users edit themselves; admins edit anyone |
| **Delete** | `@request.auth.role = "admin"` | Only admins delete |
| **Manage** | `@request.auth.role = "admin"` | Only admins manage (change email, password) |

---

## Societies Collection

| Rule | Expression | Notes |
|---|---|---|
| **List** | `@request.auth.id != ""` | Authenticated users see all societies |
| **View** | `@request.auth.id != ""` | Same |
| **Create** | `@request.auth.role = "admin"` | Only admins create societies |
| **Update** | `@request.auth.role = "admin" \|\| @request.auth.id ?= chairs.id` | Admins + assigned chairs |
| **Delete** | `@request.auth.role = "admin"` | Only admins delete |

**Chair relation**: `chairs` is a `relation` field on `societies` pointing to `users`. Multiple chairs allowed. Uses `?=` operator for matching any element in multi-select.

---

## Events Collection

| Rule | Expression | Notes |
|---|---|---|
| **List (public)** | `status = "published" \|\| @request.auth.id != ""` | Public sees published; auth sees all |
| **List (admin)** | `@request.auth.role = "admin"` | Already covered by public rule above |
| **List (chair)** | `@request.auth.id ?= society.chairs.id` | See only own societies' events |
| **View (public)** | `status = "published" \|\| @request.auth.id != ""` | Public views published only |
| **Create** | `@request.auth.role = "admin" \|\| @request.auth.id ?= society.chairs.id` | Admin or chair of target society |
| **Update** | `@request.auth.role = "admin" \|\| @request.auth.id ?= society.chairs.id` | Admin or chair of owning society |
| **Delete** | `@request.auth.role = "admin" \|\| @request.auth.id ?= society.chairs.id` | Admin or chair of owning society |

**Combined list rule** (use this in PB UI):
```sql
status = "published" || (
  @request.auth.id != "" && (
    @request.auth.role = "admin" ||
    @request.auth.id ?= society.chairs.id
  )
)
```

> Admin-only read for draft events: This rule lets admins see draft events, while chairs only see events for societies they manage, and public users only see published.

---

## Registrations Collection

| Rule | Expression | Notes |
|---|---|---|
| **List (self)** | `@request.auth.id = user.id` | Users see their own registrations |
| **List (admin)** | `@request.auth.role = "admin"` | Admins see all |
| **List (chair)** | `@request.auth.id ?= event.society.chairs.id` | Chairs see registrations for their events |
| **View** | `@request.auth.id = user.id \|\| @request.auth.role = "admin" \|\| @request.auth.id ?= event.society.chairs.id` | Self + admin + chair |
| **Create** | `@request.auth.id != "" && event.registrationOpen = true` | Auth users when registration is open |
| **Update** | `@request.auth.role = "admin" \|\| @request.auth.id ?= event.society.chairs.id` | Admin or chair of event |
| **Delete** | `@request.auth.role = "admin"` | Only admins delete |

**Combined view rule**:
```sql
@request.auth.id = user.id || @request.auth.role = "admin" || @request.auth.id ?= event.society.chairs.id
```

---

## Execom Collection

| Rule | Expression | Notes |
|---|---|---|
| **List** | `@request.auth.id != ""` | All authenticated users |
| **View** | `@request.auth.id != ""` | All authenticated users |
| **Create** | `@request.auth.role = "admin"` | Only admins |
| **Update** | `@request.auth.role = "admin"` | Only admins |
| **Delete** | `@request.auth.role = "admin"` | Only admins |

---

## Application-Level Authorization (Client-Side)

PB rules are **defense-in-depth**, not UI authorization. The client still needs to know what to show/hide.

### Client Patters (TanStack Router / React)

```typescript
// isAdmin check — for hiding nav items, buttons
const { user } = useAuth()
const isAdmin = user?.role === 'admin'

// Chair check — for scoping UI
const isChair = user?.role === 'chair'

// Event ownership check (for "Edit" button visibility)
const isEventOwner = isAdmin || (isChair && event.society?.chairs?.includes(user?.id))

// Route guard — redirect unauthenticated
const beforeLoad = async () => {
  if (!pb.authStore.isValid) throw redirect({ to: '/login' })
}
```

> **Important**: Never trust client-side checks for security. Always rely on PB collection rules for data access. Client-side checks are purely UX optimization.

---

## Migration Checklist

- [ ] Backup `pb_data/data.db` before changing rules
- [ ] Test in staging environment (separate PB instance)
- [ ] Verify chair user can list events for their societies only
- [ ] Verify chair user can edit events for their societies
- [ ] Verify chair user CANNOT list events for other societies
- [ ] Verify admin can list/edit all events
- [ ] Verify public user sees only `status = "published"` events
- [ ] Verify registration view: self can see own, chair can see theirs, admin can see all
- [ ] Rollback plan: restore DB from backup if rules are too restrictive
