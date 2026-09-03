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

## Remaining debt — prioritize separately

### P1 — Execom/workspace authorization reconciliation

`pb_hooks/execom-workspace-sync.js` still treats several assignment-deactivation/backlink-save failures as best-effort. A rare database failure can leave an active authorization assignment orphaned from its Execom record. Current production has no Execom-sourced assignments, so there is no existing drift. Fix this as a transactional/reconciliation design, not a logging-only patch.

### P2 — Oversized responsibility boundaries

Largest modules remain concentrated rather than systemic:

- `src/features/payment/PaymentPage.tsx` — 1,229 lines
- `src/features/societies/wie/WIEPage.tsx` — 1,156 lines
- `src/routes/admin.events.$id.tsx` — 1,091 lines
- `src/features/admin/events/certificate-template-panel.tsx` — 835 lines
- `pb_hooks/paygate-helpers.js` — 803 lines
- `pb_hooks/admin-operations.pb.js` — 768 lines

Refactor by workflow/responsibility with characterization tests first. Do not split files only to reduce line counts.

### P2 — Full-collection administrative scans

Resolved in the bounded Data Health follow-up: the browser now calls `/api/admin/data-health`, while PocketBase performs aggregate/count queries and returns only derived issues plus bounded anomalous rows. Full registration/payment/coupon datasets are no longer downloaded into the admin browser for this check.

Remaining: the payment summary and certificate registry still aggregate full datasets server-side before returning summaries/pages. Current production cardinality is small, so this is not an incident; move those remaining aggregations into bounded database queries before growth makes them expensive.

### P2 — Source-string architecture tests

37 unit-test files read implementation source with `readFileSync` and assert literal code strings. These tests have caught architectural regressions, but they also make harmless refactors brittle and previously kept dead UI alive. Gradually replace them with behavioral tests, schema assertions, or exported pure helpers.

### P3 — Exact duplication hotspots

The earlier dominant admin-game duplication has been retired with that temporary event feature. Re-run duplication analysis before the next structural refactor and extract only domain concepts with multiple live consumers.

### P3 — Static asset weight

After the dead AGM asset and temporary event media were removed, keep monitoring live public assets for unnecessarily large transfers:

- `public/Execom/alfin_joshi.jpeg` — ~2.03 MiB
- `public/Execom/angelina-victor/angelina-victor.jpg` — ~1.11 MiB

Resize/re-encode the portraits in a visual-performance change, with screenshot comparison, rather than silently changing binaries in this code-quality PR.

### P3 — React Router v8 future flags

The current 7.18.3 build is clean but emits v8 future-flag notices for middleware, route splitting, Vite Environment API, request handling and trailing-slash-aware data requests. Test these flags in a dedicated compatibility branch before the eventual v8 upgrade.

## Explicitly not changed here

- Razorpay KYC/compliance page work.
- Certificate mail delivery mode or SMTP configuration.
- Event content, handpicked Event Showcase content, or the 13-visible-society presentation.
- Payment algorithms, reconciliation semantics, certificate issuance semantics, or attendance lifecycle.
- Production containers, databases, DNS, or Dokploy configuration.
