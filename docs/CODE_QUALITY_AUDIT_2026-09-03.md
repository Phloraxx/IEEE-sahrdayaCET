# Code Quality Audit — 2026-09-03

## Scope

Production baseline audited: `main` at `447afe8487b19393c3e16888144e0c7d01397611`.

The pass covered React/React Router source, PocketBase hooks and migrations, dependency security, import structure, dead code, duplication, schema drift, runtime logs, build output, public assets, CI coverage, and production-data migration rehearsal. Razorpay website-verification content remains a separate workstream.

## Remediation in this branch

- Patch React Router 7.18.0 -> 7.18.3 and `sanitize-html` -> 2.17.7.
- Override transitive `qs` to 6.16.0 so the production dependency audit has zero known vulnerabilities.
- Add syntax checking for PocketBase hook/migration JS and shell scripts to CI.
- Add Dependabot version-update checks for Bun dependencies and GitHub Actions.
- Add an additive migration that restores missing production indexes while preserving legacy fields/indexes.
- Add clean-room assertions for the canonical index set and society-slug uniqueness.
- Remove abandoned Home/event/admin UI and its unused 3.1 MB AGM image.
- Remove the orphaned `chair-scope` abstraction and its self-only test suite.
- Remove unused `execom.category` DTO plumbing.

Net effect before this report: more than 1,100 source/test lines removed with no runtime feature removal.

## Validation evidence

- Runtime script syntax: pass with Node 20.
- ESLint: pass, zero warnings.
- React Router type generation + TypeScript: pass.
- Unit suite: 71 files, 389 passed, 3 expected certificate-renderer skips.
- Production client + SSR build: pass.
- Production-style Docker web smoke: `/healthz`, `/verify`, `/robots.txt` all HTTP 200.
- Production dependency audit after overrides: 0 known vulnerabilities.
- Import cycles: none across 234 TypeScript/TSX source modules.
- Runtime orphans after cleanup: none outside route/declaration entrypoints.
- Production automatic PocketBase backup exists for 2026-09-03 03:00 IST.
- Production-backup migration rehearsal: SQLite integrity `ok`, migrations 202 -> 203, collections unchanged at 35, and zero application-table data/hash changes.

## Follow-up status and remaining debt

### Resolved — Execom/workspace authorization reconciliation

The Execom authorization follow-up now gives each Execom-sourced assignment an explicit `sourceExecom` owner, enforces one-to-one active-source/backlink integrity, performs assignment lifecycle + backlink writes transactionally, and rejects any Execom-sourced assignment whose source/backlink/security fields drift. A five-minute reconciler repairs valid sources and deactivates stale/orphaned rows. Duplicate Execom records with the same user/role/scope now receive independent assignment rows, so deleting one cannot revoke the other.

The copied production-backup rehearsal confirmed the live dataset has zero Execom-sourced assignments/backlinks, applied the new migration cleanly, retained SQLite integrity, preserved Execom/assignment row counts, and produced zero data/hash changes across 23 common non-FIFA application tables. Fresh-PocketBase CI additionally characterizes deliberate source drift, duplicate-source isolation, role replacement, and deletion cleanup.

### P2 — Oversized responsibility boundaries

Largest modules remain concentrated rather than systemic:

- `src/features/admin/events/certificate-template-panel.tsx` — 404 lines after editor/controller split (from 835)
- `pb_hooks/paygate-helpers.js` — 803 lines
- `pb_hooks/admin-operations.pb.js` — 788 lines
- `src/features/payment/PaymentPage.tsx` — 694 lines after responsibility split (from 1,229)

First responsibility follow-up completed: `src/routes/admin.events.$id.tsx` is now ~690 lines (from 1,091). Registration-operation metrics, rows and decision/manual-entry dialogs moved to `src/features/admin/events/event-operations-components.tsx` (~435 lines), while queries, mutations, permissions, event lifecycle/workflow decisions and tab orchestration remain in the route. The extraction also converted the session/legacy check-in button rule from literal-source assertions to a directly tested pure decision helper.

Third responsibility follow-up completed: `src/features/societies/wie/WIEPage.tsx` is now ~507 lines (from 1,156). Activity/media rendering moved to `WIEActivitySection.tsx` (~373 lines), team/contact rendering moved to `WIETeamContactSections.tsx` (~347 lines), and the shared reveal timing moved to `wie-page-motion.ts`. The page retains workspace permission lookup, public event visibility, featured/archive filtering, team/advisor derivation, hero scroll behavior, organization schema, and overall section orchestration. Stable WIE event routing is now directly behavior-tested instead of asserted as an implementation string.

Fourth responsibility follow-up completed: `src/features/admin/events/certificate-template-panel.tsx` is now ~404 lines (from 835). Certificate preview, drag/layout controls, field inputs, template status, artwork dimension helper, certificate-type labels, and create-template dialog moved to `certificate-template-editor.tsx` (~431 lines). Query/mutation state, permissions, draft persistence, publication/versioning, test-email action, issuance and delivery orchestration remain in the controller.

Second responsibility follow-up completed: `src/features/payment/PaymentPage.tsx` is now ~694 lines (from 1,229). Provider-specific Razorpay/Kotak presentation plus shared payment-shell visuals moved to `src/features/payment/payment-provider-panels.tsx` (~615 lines), while session creation, local polling, provider reconciliation/backoff, expiry, Razorpay SDK wiring/verification, QR generation and ticket navigation remain in `PaymentPage`. Payment architecture tests now assert orchestration and provider UI against their owning modules instead of assuming all payment code lives in one file.

Payment UI coverage now also includes a clean-room Browser E2E contract. `paygate_smoke.py` leaves one dedicated pending session created against the local fake PayGate, and Playwright opens the real `/payment/:registrationId` route to verify the event, exact unique payable amount, Kotak identity, generated UPI QR and manual recheck control without contacting a live payment rail.

Continue refactoring by workflow/responsibility with characterization tests first. Do not split files only to reduce line counts.

### P2 — Full-collection administrative scans

Resolved in the bounded Data Health follow-up: the browser now calls `/api/admin/data-health`, while PocketBase performs aggregate/count queries and returns only derived issues plus bounded anomalous rows. Full registration/payment/coupon datasets are no longer downloaded into the admin browser for this check.

Resolved in the payment-summary follow-up: `/api/admin/payments/summary` now computes provider totals, collection/refund amounts, attention counts, and refund-state counts directly in SQLite instead of materializing every payment/refund record in PocketBase JS.

Resolved in the certificate-registry follow-up: authorization is reduced to accessible event IDs first, then SQLite performs certificate search, delivery-state joining, summary aggregation, and pagination. PocketBase JS receives only the requested page and reapplies the existing per-event recipient-email and delivery-error redaction rules.

No known admin summary or registry path now materializes an unbounded operational collection solely to compute a view.

### P2 — Source-string architecture tests

39 unit-test files still read implementation source with `readFileSync` and assert at least some literal code strings. These tests have caught architectural regressions, but they also make harmless refactors brittle and previously kept dead UI alive. The admin-event boundary refactor removed two concrete brittle assertions: legacy check-in visibility is now tested through a pure helper, and refund-decision money semantics rely on the existing clean-room lifecycle instead of UI-copy wording. The file count remains 39 because those same test files still contain other architecture assertions. Gradually replace the remaining literals with behavioral tests, schema assertions, or exported pure helpers.

### P3 — Exact duplication hotspots

The earlier dominant admin-game duplication has been retired with that temporary event feature. Re-run duplication analysis before the next structural refactor and extract only domain concepts with multiple live consumers.

### P3 — Static asset weight

The earlier oversized Execom portraits have already been re-encoded (`alfin_joshi.jpeg` ~384 KiB; `angelina-victor.jpg` ~319 KiB). The current live public-asset hotspots above 500 KiB are:

- `public/web.png` — ~1.00 MiB; global OpenGraph/fallback image, currently 2559×680 (3.76:1)
- `public/media/sustainx/sustainx-hero-loop.webm` — ~824 KiB
- `public/Execom/binu-ashik/Binu_ashik.jpg` — ~504 KiB

Treat `web.png` as a visual/metadata redesign rather than a blind compression task because its aspect ratio is also unsuitable for a conventional social card. Re-encode other assets only with visual comparison.

### Resolved — React Router v8 future flags

The pinned React Router 7.18.3 build now opts into all five supported v8 compatibility flags: middleware, route-module splitting, Vite Environment API, pass-through request handling, and trailing-slash-aware data requests. Local typecheck/unit/build validation is green and the previous future-flag warnings are eliminated; browser E2E remains the deployment acceptance gate before the eventual v8 package upgrade.

## Explicitly not changed here

- Razorpay KYC/compliance page work.
- Certificate mail delivery mode or SMTP configuration.
- Event content, handpicked Event Showcase content, or the 13-visible-society presentation.
- Payment algorithms, reconciliation semantics, certificate issuance semantics, or attendance lifecycle.
- Production containers, databases, DNS, or Dokploy configuration.
