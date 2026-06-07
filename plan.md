# IEEE Sahrdaya — Migration & Development Plan

## Status
- **Backend**: PocketBase 0.23.x at `db.phloraxx.us.to`
- **Collections**: `societies` (14), `execom` (89), `events` (29), `registrations` (empty, used by live app)
- **Build**: TypeScript clean (`tsc --noEmit`)
- **Hosting**: Dokploy VPS (planned), Docker Compose for local/deployment

## Done

### Migration (Appwrite → PocketBase)
- [x] Migration script `scripts/migrate-to-pb.ts` — imports societies + execom from `ieee_export.sql`
- [x] Events migration `scripts/migrate-events.ts` — imports all 29 events with banner downloads from external URLs (28 banners downloaded)
- [x] Google OAuth2 configured on PB (manual code exchange via Next.js route)
- [x] Superuser impersonation token generated

### Code Cleanup
- [x] Comprehensive code audit (84 findings: 5 critical, 10 high, 43 medium, 26 low)
- [x] `tmp_login.json` — removed from filesystem, added to `.gitignore`
- [x] Orphaned scripts deleted: `scripts/fix-admin.ts`, `scripts/check-user.mjs` (contained hardcoded PostgreSQL credentials)
- [x] Payload CMS artifacts cleaned: `data/payload.db*` files deleted
- [x] `.env.example` — removed stale `DATABASE_URL` (Payload CMS reference)
- [x] Hardcoded `BASE_URL` consolidated into `src/lib/constants.ts` — reads `NEXT_PUBLIC_APP_URL` with fallback
- [x] Ticket page (`ticket/[ticketId]/page.tsx`) — fixed `event` TDZ reference in `handleDownloadQR`

### Over-engineering / Redundancy
- [x] Orphaned Payload CMS collections/payload directories deleted
- [x] `FloatingAction.tsx` deleted (unused)
- [x] `useEvents.ts` hook deleted (unused after SSR migration)
- [x] `src/lib/api.ts` flagged — used in 1 file; kept as utility but noted for future inlining
- [x] `TransitionLink.tsx` flagged — thin wrapper around Next.js `<Link>`; kept due to 29 import sites

### Docker
- [x] `Dockerfile` — Node 22 multi-stage with BuildKit mount cache for npm + Next.js
- [x] `docker-compose.yml` — 3 Next.js replicas behind Caddy reverse proxy, automatic HTTPS
- [x] `Caddyfile` — compression, security headers, static asset caching, round-robin load balancing

## Remaining Findings (Deferred)

### High Priority
- [ ] **`src/lib/pb.ts` superuser fallback** — `createPB()` falls back to `POCKETBASE_SUPERUSER_TOKEN` when no auth cookie is present. Every server-side call without user session runs as superuser. Mitigation: only ever used for read-only SSR pages fetching public data. Fix: create separate `createAdminPB()` for admin operations.
- [ ] **CSV export routes merged** — `api/events/[eventId]/export/route.ts` and `api/admin/events/[id]/registrations.csv/route.ts` have ~80% duplicate logic. Extract shared CSV generation utility.
- [ ] **Duplicate EventCard components** — `src/components/EventCard.tsx` and `src/components/events/EventCard.tsx` with different interfaces. Unify into one.
- [ ] **Overly large files** — `EventRegistrationModal.tsx` (719 lines), `DynamicRegistrationForm.tsx` (711 lines), `PaymentModal.tsx` (457 lines). Extract sub-components.

### Medium Priority
- [ ] **Filter injection across 7+ routes** — PB filter param string interpolation like `filter: \`society="${userInput}"\``. Not SQL injection-safe; single quote in input breaks filter. Use PB's `filter` with positional args when available.
- [ ] **DDM payment webhook** — Not tested end-to-end. `PATCH /api/registrations/[id]` doesn't exist yet (used by payment flow).
- [ ] **`console.error` in production code** — 7+ files have `console.error` in catch blocks. Replace with structured logging or suppress before build.
- [ ] **Missing Suspense/error boundaries** on SSR pages with `force-dynamic`.
- [ ] **`JSON.parse(JSON.stringify(fields))`** in `DbRegForm.tsx` (line 746) — used as shallow clone; consider `structuredClone`.
- [ ] **Zod validation on API routes** for `formResponses` field — no shape validation currently.

### Low Priority
- [ ] `React.memo` on `MemberCard` and `EventCard` — premature; remove unless profiling shows benefit.
- [ ] `JsonLd.tsx` (15 lines) — could be inlined in layout file.
- [ ] Inconsistent `React.FC<Props>` vs `function Component({...})` patterns across components.
- [ ] `shimmer` animation in `DynamicRegistrationForm.tsx` — arbitrary animation not defined in Tailwind config.

## Next Steps
1. **Deploy to Dokploy** — use `docker-compose.yml` for app cluster, point to existing PB at `db.phloraxx.us.to`
2. **Disable new sign-ups on production PB** — set `users` collection createRule to admin-only
3. **Backup `ieee_export.sql`** — contains user + registration data for future migration
4. **Regenerate/replace `POCKETBASE_SUPERUSER_TOKEN`** — current token exposed during audit; rotate after deployment
5. **Test DDM payment webhook** — create a registration for a paid event and walk through UPI flow

## Architecture
```
                         Internet
                             |
                      ┌──────┴──────┐
                      │   Caddy     │  ← HTTPS, LB, caching
                      │  (replica)  │
                      └──────┬──────┘
                             |
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  app:0    │ │  app:1    │ │  app:2    │
        │ Next.js   │ │ Next.js   │ │ Next.js   │
        │ (replica) │ │ (replica) │ │ (replica) │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────┴────────┐
                    │ PocketBase      │
                    │ db.phloraxx.us.to│
                    │ (external)      │
                    └─────────────────┘
```

## Migrated Collections
| Collection | Items | Source |
|-----------|-------|--------|
| societies | 14 | `ieee_export.sql` → `scripts/migrate-to-pb.ts` |
| execom | 89 | `ieee_export.sql` → `scripts/migrate-to-pb.ts`, order fixed via `scripts/fix-execom-order.ts` |
| events | 29 | `ieee_export.sql` → `scripts/migrate-events.ts` (28 banners from external URLs) |
| registrations | live data | Created via live app (registration flow) |
| users | live data | Created via Google OAuth sign-in |
