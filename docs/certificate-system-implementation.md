# Certificate System Implementation Ledger

Status: core certificate platform, v1 acceptance hardening, and Certificate Platform V2 hardening are complete. The project-owner-authorized synthetic v1 staging acceptance rehearsal remains the current staging baseline on `dev`; V2 is validated only on the isolated feature branch and has not been deployed to staging or production. Production remains undeployed and requires a separate explicit project-owner decision.

Source research: the 28 August 2026 IEEE Sahrdaya certificate issuance, verification, and email-delivery research plan supplied by the project owner.

## Reconciliation baseline

Research snapshot: `dev @ c418a7df15d9ddcd4bb7a4886314b81a3e371906`.

Implementation baseline: `dev @ 29d937198be52915ce24ac989b30e56dfc4c10ac`.

The reconciliation found no drift in the certificate-sensitive architecture between those SHAs. `AGENTS.md`, PocketBase hooks/migrations, event-admin route, workspace permission model, mail/outbox code, Docker topology, and route ownership are unchanged. The intervening work is public Execom and reduced-motion/UI polish.

Therefore the research architecture remains valid and implementation can proceed without changing the two-service `web + pocketbase` boundary.

## Locked product architecture

- Certificates are an event-admin capability, not a separate application.
- Flow: Template → Recipients → Review → Issue → Send → Delivery tracking.
- Issuance and email delivery are separate commands.
- PocketBase owns authorization, templates, issuance, batches, verification state, audit, revocation, and outbox state.
- React Router Node runtime owns QR/PNG/PDF resource rendering.
- Published template versions and issued credentials are immutable snapshots.
- Public verification uses random tokens and exposes only minimum verification data.
- Existing `notification_outbox` is extended rather than replaced.
- Historical multi-day attendance is never inferred when the data was not recorded.

## Gate status

### Gate 0 — coordination and reconciliation

Complete.

A dedicated worktree/branch was created from the current `origin/dev` before certificate changes began.

### Gate 1 — staging mail safety

Complete locally: 293/293 unit tests, typecheck, lint, production build, and Compose configuration validation are green.

Policy:

- production + unset mode → `live` for backward compatibility;
- non-production + unset mode → `disabled`;
- `live` is rejected outside production;
- `allowlist` sends only to exact configured addresses;
- `redirect` sends only to an explicit redirect inbox and adds a visible test banner;
- invalid modes fail closed;
- safety-policy blocks are terminal outbox failures instead of repeated SMTP retries.

Environment variables:

- `MAIL_DELIVERY_MODE=disabled|allowlist|redirect|live`
- `MAIL_ALLOWLIST=`
- `MAIL_REDIRECT_TO=`

No staging allowlist address is committed to the repository.

### Gate 2 — rendering spike

Complete locally. The accepted stack is `sharp@0.35.4` + the existing `qrcode` package + `pdf-lib@1.17.1`, with Alpine `font-noto` installed in the web runtime and `NotoSans-Regular.ttf` supplied to Sharp/Pango by absolute path.

Validated inside the repository production Docker image on Node 22 / Linux ARM64:

- deterministic 2400×1350 PNG (repeat renders produced identical SHA-256);
- one-page PDF with the same raster certificate;
- exact TTF-backed name measurement;
- long-name auto-fit from 132px down to 74px for the long fixture;
- apostrophe, hyphen, initials, and accented Latin fixtures;
- existing `qrcode` package composited into the certificate;
- 124 KB PNG and 173 KB PDF for the synthetic spike;
- no PocketBase credential or third runtime service required.

The spike visually confirms that the dynamic name, credential ID, and QR can be overlaid on an immutable template base.

Original spike criteria:

- deterministic high-resolution PNG output;
- exact canvas dimensions;
- approved-font loading and text measurement;
- long-name auto-fit with a minimum size and explicit failure state;
- apostrophe, hyphen, initials, and supported Unicode fixtures;
- QR composition using the existing `qrcode` package;
- one-page PDF with visual parity to PNG;
- no PocketBase superuser credential in the web runtime.

Accepted: Sharp/Pango text with explicit Noto TTF, Sharp composition, existing QR package, and pdf-lib PNG wrapping. SVG `@font-face` was rejected during the spike because librsvg/fontconfig did not honor the packaged WOFF reliably.

## Phase 1 — schema + authorization

Complete locally. Added authoritative server-only `certificate_templates`, `certificate_batches`, and `certificates` collections plus the `certificate` notification-outbox kind/relation. All normal collection CRUD rules are closed; browser/admin access uses scoped custom commands.

Verified on a fresh PocketBase 0.39.9 database through collection metadata and the existing clean-room backend smoke:

- protected source background/signature/render-base fields;
- unique template-version, credential-ID, and verification-token indexes;
- partial unique index allowing only one active certificate per registration/event/type;
- supersedes/supersededBy self-relations;
- outbox accepts `ticket`, `receipt`, and `certificate`;
- ordinary users and legacy application admins cannot directly list/read/create certificate core records;
- existing registration/payment/ticket/outbox backend smoke remains green.

Explicit capabilities are now `certificates.view`, `certificates.manage_templates`, `certificates.issue`, `certificates.send`, and `certificates.revoke`. Check-in, registration, content, and finance-only roles receive none by default; Event Lead receives view/issue but not template management or revocation.

## Phase 2 — template lifecycle and immutable publication

Complete locally. Event-scoped certificate template commands provide create/list/get/update/publish/archive/new-version/delete-draft behavior while direct collection CRUD remains closed.

Publication is guarded both by command routes and a lower-level PocketBase model invariant. Published/archived design content cannot be mutated in place; corrections create a new draft version.

Validated in the permanent clean-room template smoke:

- unauthorized users receive 403;
- draft defaults survive PocketBase JSONRaw serialization;
- render-base/signature/background uploads are inspected from actual bytes;
- PNG/JPEG format, dimensions, byte size, and pixel area are validated server-side;
- render-base dimensions come from the uploaded PNG rather than browser metadata;
- publication rejects incomplete layouts/email copy;
- admin asset preview uses a capability-checked route while core collection view rules remain closed;
- published templates reject route-level and direct-model mutation;
- archive is allowed without changing frozen content;
- published/archived versions clone their protected assets into the next draft version;
- only drafts may be deleted.

`tests/backend/certificate_template_smoke.py` is wired into clean-room CI.

## Phase 2B — Event Admin Template Studio

Implemented on the isolated certificate branch. Certificate administration appears as a permission-gated `Certificates` tab inside the existing `/admin/events/:id` workspace rather than as a separate dashboard.

The first UI surface intentionally covers template work only. Recipient selection, issuance, sending, and delivery tracking are not mixed into the editor.

Template Studio provides:

- event-scoped template/version browser;
- draft creation by certificate type;
- large render-base preview canvas;
- drag positioning for participant name, credential ID, and verification QR;
- exact normalized position/size controls;
- Noto Sans/Noto Serif participant-name controls with preferred/minimum fit sizes;
- protected render-base, source-background, and signature-source uploads;
- plain-text certificate email authoring using the documented placeholders;
- save, publish/freeze, archive, clone-next-version, and delete-draft actions;
- view-only rendering for users with `certificates.view` but without `certificates.manage_templates`.

The frontend uses only the custom certificate command/asset routes. It does not open direct PocketBase CRUD for the server-only certificate collections.

Regression coverage added for this phase:

- source-level admin integration/permission architecture tests;
- a clean-room Playwright flow that creates a real draft from Event Admin;
- generated 2400×1350 PNG and 800×240 signature uploads through the browser;
- save + protected preview verification;
- publication immutability;
- clone-to-v2 behavior;
- mobile horizontal-overflow check.

At that checkpoint: 313/313 unit tests, typecheck, zero-warning lint, production build, fresh PocketBase migration, template lifecycle, Razorpay/PayGate smokes, both container builds, and Browser E2E were green.

## Phase 3A — audience review + immutable issuance backend

Implemented. Issue remains a separate command from email delivery.

- supports `selected`, `checked_in`, and `confirmed` audiences;
- `attendance_qualified` returns an explicit unavailable error until attendance sessions exist;
- preview returns exact recipient snapshots, exclusions, email eligibility, and a deterministic audience fingerprint;
- selected registration IDs are canonicalized before fingerprinting;
- fingerprints include name/email snapshots and the published template content hash;
- Issue recomputes the audience inside the transaction and rejects stale reviews with `AUDIENCE_CHANGED`;
- issued batches store the reviewed audience snapshot and a unique idempotency key;
- exact Issue replays return the original batch/credentials instead of duplicating them;
- credentials receive readable random Credential IDs plus independent 48-character verification tokens;
- issued batch audience and credential identity snapshots are protected by model-level immutability hooks;
- Issue does not create notification-outbox records or send email.

`tests/backend/certificate_issuance_smoke.py` covers checked-in, selected, missing-email, cancellation, stale-review, replay/idempotency, uniqueness, immutability, and no-send behavior and is wired into clean-room CI.

The Phase 3 work also fixed a PocketBase multipart edge case: render-base-only template uploads now parse the multipart form once and create filesystem files from `FileHeader` values, rather than requiring another optional asset to be present.

## Phase 3B — Event Admin Recipients → Review → Issue

Implemented in the existing Certificates tab. A published template unlocks a separate issuance workflow beneath Template Studio.

- Checked-in, Confirmed, and organizer-Selected audiences are available.
- Attendance-qualified remains visibly unavailable until attendance sessions exist.
- Selected-recipient browsing uses a certificate-scoped projection authorized by `certificates.issue`; it exposes only name, email, registration status, checked-in state, and registration ID.
- No phone, SR number, payment data, form responses, or provider details are exposed to the certificate picker.
- Review shows the authoritative fingerprinted recipient snapshot, exclusions, email eligibility, and missing-email warnings.
- The organizer must explicitly confirm the reviewed people before Issue is enabled.
- `AUDIENCE_CHANGED` replaces Review with the server-refreshed audience and clears confirmation.
- Issue remains credential creation only. The success state explicitly says `No email has been sent yet.` and exposes no Send action.
- Issued credentials are shown with their permanent Credential IDs and future email readiness.

Browser coverage extends the clean-room Template Studio flow through Confirmed → Review and verifies that Issue remains disabled until organizer confirmation. The irreversible Issue command itself remains covered by the backend clean-room smoke, including idempotency and no-send guarantees.

## Phase 4 — public verification + credential resources

Complete on the isolated certificate branch.

### Public verification boundary

PocketBase now exposes a token-only public verification projection at:

- `GET /api/app/certificates/verify/{token}`

The lookup is keyed only by the independent random 48-character `verificationToken`, using the existing database uniqueness invariant. Credential IDs are not accepted as verification locators.

The projection exposes exactly these fields and no others:

- `recipientName`
- `event`
- `certificateType`
- `credentialId`
- `issueDate`
- `issuer`
- `status`

It does not expose email, phone, SR number, registration/payment state, attendance internals, form responses, provider data, batch internals, template internals, or protected files.

Status behavior is explicit:

- `ACTIVE`
- `REVOKED`
- `SUPERSEDED`
- `INVALID`

Revoked and superseded credentials remain verifiable records and do not become 404s. Unknown/malformed tokens return the invalid projection state.

### Narrow rendering-data capability

Normal CRUD rules on `certificates` and `certificate_templates` remain closed. React Router does not hold a PocketBase superuser credential.

Instead, the web runtime and PocketBase share a dedicated `CERTIFICATE_RENDER_CAPABILITY_KEY`. The protected server-to-PocketBase render boundary requires `X-Certificate-Render-Capability` and exposes only the data required to render one token-scoped issued credential:

- immutable recipient-name snapshot;
- immutable Credential ID;
- immutable template canvas dimensions/layout/content hash;
- the protected flattened render-base bytes.

The raw render base is never exposed through the public verification route and possession of a verification token alone is insufficient to download it. If the render capability is missing or invalid, rendering fails closed.

### Reusable deterministic renderer

The proven rendering spike was extracted into `src/server/certificates/render.server.ts` instead of duplicating spike logic.

The production renderer uses:

- Sharp/Pango;
- explicit Noto Sans/Noto Serif TTF resolution;
- QRCode;
- pdf-lib;
- exact immutable template canvas dimensions/layout;
- preferred-to-minimum long-name fitting with explicit failure below the minimum;
- XML escaping for rendered text;
- canvas-bound checks for name, Credential ID, and QR;
- deterministic PNG composition;
- deterministic one-page PDF wrapping with fixed PDF metadata timestamps.

The QR resolves exactly to:

`https://ieeesahrdaya.com/c/<verificationToken>`

### Public React Router resources

Added:

- `/c/:token`
- `/c/:token/certificate.png`
- `/c/:token/certificate.pdf`

The verification page exposes only the permitted projection and clearly distinguishes active, revoked, superseded, and invalid credentials. It is marked `noindex, nofollow`.

PNG/PDF routes return the final rendered credential only, with correct MIME types, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`. `no-store` is intentional so revocation/supersession state and regenerated public resources cannot be hidden behind stale caches.

### Permanent Phase 4 coverage

Added/wired:

- `tests/backend/certificate_public_smoke.py`
  - exact-field public projection assertion;
  - ACTIVE/REVOKED/SUPERSEDED/INVALID coverage;
  - malformed/unknown-token behavior;
  - missing/wrong/correct render-capability behavior;
  - protected render manifest/base tests;
  - revoked/superseded credentials remain verifiable/renderable.
- `tests/unit/certificate-renderer.test.ts`
  - canonical production verification URL;
  - deterministic PNG bytes and dimensions;
  - deterministic one-page PDF bytes.
- `tests/e2e/certificate-verification.e2e.ts`
  - safe active public projection;
  - explicit absence of recipient email;
  - revoked/superseded public states;
  - invalid state;
  - deterministic PNG/PDF resource responses, MIME types, `no-store`, and `nosniff`.

CI installs Noto fonts so deterministic renderer tests execute against the intended font stack.

### JSVM scoping defects found during the clean-room gate

The first Phase 4 clean-room pass exposed an important PocketBase JSVM behavior: route/hook callbacks cannot safely depend on ordinary top-level helper functions declared in a `.pb.js` hook file. Each callback must load shared behavior from a CommonJS helper module inside callback scope.

Two fixes were made without weakening policy:

1. Phase 4 public verification/render helpers were moved to `certificate-public-helpers.js` and required inside each route callback.
2. An older latent Phase 3 invariant bug was found in `certificate-issuance-invariants.pb.js`: update callbacks referenced the top-level `sameField` helper. The invariant now requires the existing template-rules helper inside callback scope and performs the same immutable-field comparison there.

The second defect would have prevented a legitimate future ACTIVE → REVOKED/SUPERSEDED transition. The repair preserves the frozen identity fields, allowed status set, prohibition on reactivation, and issued-batch immutability. Phase 4 smoke now exercises the legitimate transitions.

### Phase 4 clean-room gate

First full green implementation gate:

- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33260832698`
- feature SHA tested: `6cfc16618d222c17596b2ce1d8584b680fda835f`
- lint: green;
- typecheck: green;
- unit tests: 327 passed across 45 files;
- production build: green;
- fresh PocketBase migration/backend invariants: green;
- template lifecycle: green;
- issuance lifecycle: green;
- public certificate verification/render-boundary smoke: green;
- direct Razorpay smoke: green;
- temporary PayGate smoke: green;
- web Docker image: green;
- PocketBase Docker image: green;
- Browser E2E: 49 discovered, 40 passed, 9 intentionally skipped; all four Phase 4 verification/resource tests passed.

The public smoke reported only the seven approved fields and status coverage for ACTIVE/REVOKED/SUPERSEDED/INVALID.

No staging deployment occurred. No real certificate was issued, no real attendee record was changed, and no certificate email was sent.

## Next implementation phases

1. Keep `attendance_qualified` deferred until a real future multi-session attendance model exists; do not infer historical attendance.
2. Keep production deployment and any real certificate issuance/mail delivery blocked until a separate explicit project-owner decision.

## Branch safety

The project owner explicitly authorized the staging rehearsal, so the tested certificate runtime is now present on `dev` and staging. `main`/production remain untouched. Further production deployment, real certificate issuance, or real certificate email delivery still requires a separate explicit project-owner decision.


## Phase 5 — explicit Send + delivery tracking

Closed on the isolated certificate branch. Issuance remains email-free and delivery remains an explicit separate command.

- `certificates.send` is a separate explicit capability from `certificates.issue`; the current operational roles that may issue also receive Send, while registration/check-in/content/finance-only roles receive neither.
- Send is a dedicated PocketBase command on an already-issued batch. It only enqueues jobs and never performs SMTP synchronously.
- Certificate delivery reuses the existing `notification_outbox`, its transactional claim/stale-lock behavior, exponential retries, and the Gate 1 non-production mail-safety policy. No second queue, scheduler, or runtime service was added.
- There is exactly one deduplicated certificate outbox row per issued credential (`certificate:<certificateId>`). Replaying Send creates zero duplicates.
- Only ACTIVE credentials with a valid immutable recipient-email snapshot are queued. Missing-email credentials remain issued and verifiable but are not silently placed in the mail queue. Revoked or superseded credentials cannot be newly queued or manually retried.
- The frozen template email subject/body is expanded from the issued credential snapshot. Delivery links to the public verification page and PDF resource; protected template source/background/signature/render-base assets remain private.
- Batch `queuedCount`, `sentCount`, `failedCount`, `sendStartedAt`, `completedAt`, and delivery status are reconciled from outbox truth. Certificate jobs carry an indexed `certificateBatch` relation for direct reconciliation; the helper uses a valid deterministic `id` sort because `notification_outbox` has no `created` field. Retryable failures keep the batch in `sending`; attempt 8 is terminal and yields `partial_failure`.
- `retry-failed` is explicit and only resets terminal failed jobs that still belong to ACTIVE credentials.
- Event Admin now has a separate **Send & delivery** panel beneath the unchanged Recipients → Review → Issue flow. View-only certificate users can inspect delivery; only `certificates.send` users see queue/retry actions.
- Per-recipient delivery exposes credential status, delivery status, attempts, sent time/error and the public verification resource, without opening certificate/outbox collection CRUD.

Coverage added for this phase:

- source-level guards proving Issue contains no outbox/send behavior and Send reuses the existing mail-safety worker;
- permission vocabulary tests for `certificates.send`;
- `tests/backend/certificate_delivery_smoke.py` for no-send-on-Issue, authorization, dedupe/idempotency, missing email, sent reconciliation, terminal failure, retry reset and revoked-credential retry rejection;
- Browser E2E now continues the synthetic Template Studio flow through explicit Issue and then the separate Queue email action. The clean-room environment has no live SMTP path, so this cannot send a real certificate email.

Local gate after Phase 5 changes: zero-warning lint, typecheck, production build, and 333 unit tests discovered (332 passed; the existing Linux-only renderer assertion is skipped on macOS). A fresh disposable PocketBase container also passed the complete `certificate_delivery_smoke.py` lifecycle after the reconciliation fix (1 queued, 1 missing email, dedupe/retry/revocation checks green).

Phase 5 exact clean-room closure gate:

- feature SHA: `1850613504229ad40260dcdfe2e61928e994726f`;
- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33263110016`;
- lint/typecheck/unit/production build: green;
- certificate template, issue, public verification, and delivery smokes: green;
- direct Razorpay and temporary PayGate smokes: green;
- web + PocketBase container builds: green;
- Browser E2E: 40 passed, 9 intentionally skipped.

No staging deployment occurred and no real certificate email was sent. The draft PR used only to trigger CI was closed without merge.


## Phase 6 — revoke and replace credential lifecycle

Closed on the isolated certificate feature branch. Revocation and replacement preserve credential history and remain separate from certificate email delivery.

- `certificates.revoke` is the sole capability for both lifecycle-ending commands; ordinary event leads/secretaries that can Issue/Send still cannot revoke unless their role explicitly carries this narrower governance authority.
- **Revoke** changes ACTIVE → REVOKED in place, requires a private reason plus actor/time metadata, preserves the immutable credential and public verification URL, and never deletes history.
- **Replace** changes the old credential ACTIVE → SUPERSEDED, creates a new ACTIVE immutable credential with a new Credential ID and 48-character verification token, links `supersedes`/`supersededBy`, increments `metadataVersion`, and creates a dedicated one-recipient correction batch.
- Replacement can correct the frozen recipient name/email snapshot and can optionally use another published event template of the same certificate type. Keeping the original artwork remains valid even if that historical template has since been archived.
- Replacement Issue does **not** enqueue or send email. Its correction batch enters `issued` with zero queued jobs and must use the existing separate Send & delivery workflow.
- Any old certificate email job that has not already reached `sent` is terminally failed when that credential is revoked/superseded, preventing later automatic retry of an invalid credential. Already-sent delivery history is preserved.
- Public verification continues to expose only the locked seven-field projection; private revocation/replacement reasons and links are available only in Event Admin.
- Certificate invariants now require termination time/actor/reason, forbid reactivation, forbid deletion, prohibit active credentials from pointing at replacements, and freeze completed lifecycle metadata.
- Event Admin delivery rows expose Revoke/Replace controls only for ACTIVE credentials and only when `certificates.revoke` is present. The replacement dialog states explicitly that the new credential is not emailed automatically.

Permanent coverage added:

- `tests/unit/lib/certificate-lifecycle-architecture.test.ts` for permission boundary, immutable history, replacement-without-Send, terminal old delivery, and organizer UI warnings;
- `tests/backend/certificate_lifecycle_smoke.py` for authorization, required reason, queued-old-mail termination, REVOKED/SUPERSEDED/ACTIVE public status, seven-field public privacy, linked replacement metadata, idempotent replay, zero-email replacement batch, no duplicate replacement outbox job, no reactivation, and frozen replacement identity.

Phase 6 exact clean-room closure gate:

- feature SHA: `0858e527f968c70824b9c94dbbc791ba87957599`;
- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33264174590`;
- lint/typecheck: green;
- unit tests: 61 files, 339 passed on Linux, including the deterministic renderer;
- production build: green;
- backend invariants, template lifecycle, issuance lifecycle, public verification, delivery lifecycle, and revoke/replacement lifecycle: green;
- direct Razorpay and temporary PayGate smokes: green;
- web + PocketBase container builds: green;
- Browser E2E: 49 discovered, 40 passed, 9 intentionally skipped.

No staging deployment occurred, no real certificate was issued, no real attendee record was changed, and no real certificate email was sent. The draft PR remains a CI trigger only and is not authorized for merge.

## Phase 7 — v1 acceptance hardening

Closed on the isolated certificate feature branch. This phase adds production-readiness evidence without changing historical attendance rules or authorizing deployment.

- Template Studio now includes built-in stress-preview names covering short, ordinary, very long, initials, hyphen/apostrophe, and accented-Latin shapes before publication. These controls are preview aids only; the production renderer remains authoritative.
- Linux renderer coverage exercises the same stress-name fixtures through the real certificate renderer. Name fitting continues to shrink only to the configured minimum and rejects a credential for manual review rather than silently clipping it.
- A dedicated clean-room `certificate_bulk_smoke.py` creates 200 synthetic confirmed recipients and validates one reviewed audience decision through immutable issuance and idempotent replay.
- The 200-recipient gate verifies exactly 200 unique human-readable Credential IDs, 200 unique 48-character verification tokens, and zero certificate email jobs before the separate Send command.
- Certificate audit coverage now asserts actor/event/entity identity for Issue, explicit Send including replay, Revoke, and Supersede/Replace commands.
- The Admin dashboard failed-notification description now includes certificate delivery alongside ticket and receipt delivery.
- Existing public verification privacy, delivery, revoke/replace, payment integration, and browser flows continue to run after the scale gate on the same clean-room database.

Phase 7 exact functional clean-room closure gate:

- feature SHA: `3d6ca3e8b9045a7d0c7c97536315724acb656b80`;
- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33265107979`;
- lint/typecheck: green;
- unit tests: 61 files, 340 passed on Linux, including deterministic rendering and the stress-name renderer fixtures;
- production build: green;
- 200-recipient scale smoke: green — preview 0.014 s, issue transaction 0.208 s, 200 unique credentials, 200 unique verification tokens, zero pre-Send outbox jobs;
- certificate template, issuance, public verification, delivery, revoke/replacement, and audit assertions: green;
- direct Razorpay and temporary PayGate smokes: green;
- web + PocketBase container builds: green;
- Browser E2E: 49 discovered, 40 passed, 9 intentionally skipped.

`attendance_qualified` remains deliberately deferred until a real multi-session attendance model exists. No historical attendance is inferred. Staging rehearsal remains synthetic-only and requires an explicit project-owner request.

No staging or production deployment occurred, no real certificate was issued, no real attendee record was changed, and no real certificate email was sent. The draft PR is used only as a CI trigger and is not authorized for merge.

## Phase 8 — preflight review + safe test email

Closed on the isolated certificate feature branch. This phase finishes the remaining non-deployment v1 checks from the research plan without changing Issue/Send semantics or historical attendance rules.

- Template Studio exposes deterministic name-fit preflight warnings against the built-in stress-name set. Warnings cover names that require font auto-fit, names likely to exceed the configured minimum size, and names that require font-coverage review.
- Recipient Review computes the same shared backend preflight against the exact snapshotted recipient names and surfaces a per-recipient **Name fit** status plus a warning count before Issue. Organizers explicitly acknowledge those warnings together with the audience confirmation.
- Preflight remains advisory. The production renderer is still authoritative and continues to fail closed rather than clip a name that cannot fit.
- Template Studio now has **Send test email** for draft/published templates. The recipient is fixed to the authenticated organizer's own account; there is no arbitrary-recipient field.
- Test email uses sample identity/credential values only, is visibly marked `TEST / NOT VALID`, creates no certificate, batch, or outbox job, and routes through the existing centralized mail-delivery safety policy. Archived templates cannot send tests.
- Successful test-email commands are audited as `certificate.template-test-email`. Clean-room CI intentionally has no SMTP configuration and proves the command fails safely without creating certificate/outbox state.

Phase 8 exact functional clean-room closure gate:

- feature SHA: `64991586739719d80db18cc9b4cb09c8634f0b46`;
- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33266331542`;
- lint/typecheck: green;
- unit tests: 61 files, 343 passed on Linux;
- production build: green;
- certificate template smoke: green, including deterministic preflight metadata plus unauthorized/unavailable test-email safety with no credential/outbox mutation;
- certificate issuance smoke: green, including a real long-name recipient receiving the expected preflight warning;
- 200-recipient scale smoke: green — preview 0.025 s, issue transaction 0.174 s, 200 unique credentials, 200 unique verification tokens, zero pre-Send outbox jobs;
- public verification, delivery, revoke/replacement, Razorpay, and temporary PayGate smokes: green;
- web + PocketBase container builds: green;
- Browser E2E: 49 discovered, 40 passed, 9 intentionally skipped.

`attendance_qualified` remains deliberately deferred until a real multi-session attendance model exists. Staging rehearsal remains synthetic-only and requires an explicit project-owner request.

No staging or production deployment occurred, no real certificate was issued, no real attendee record was changed, and no real certificate or test email was sent. The draft PR is used only as a CI trigger and is not authorized for merge.

## Phase 9 — staging deployment + synthetic acceptance rehearsal

Complete after explicit project-owner authorization. The certificate runtime was advanced to staging only; `main`/production were not changed.

The first live rehearsal deliberately exposed three staging acceptance defects before any production decision:

- the credential HTML route replaced the root response headers and lost `X-Robots-Tag: noindex, nofollow`;
- `CERTIFICATE_RENDER_CAPABILITY_KEY` was allowed to resolve to an empty value, causing PNG/PDF resources to return 500;
- rendered verification QR URLs were hardcoded to production rather than using the current environment origin.

The partial synthetic fixture was rolled back to its pre-run PocketBase backup before fixes were deployed. The corrective runtime commit is `792905e1df7fe6a997f1856f48a09e446bedd713`.

Corrections:

- credential HTML, PNG, and PDF resources explicitly return `X-Robots-Tag: noindex, nofollow`;
- Compose requires a non-empty renderer capability key for both web and PocketBase instead of silently accepting an empty value;
- staging Dokploy metadata holds a generated environment-only 64-character renderer capability key; no secret value is committed;
- QR verification origin is derived from `SITE_URL`, with the production site only as the safe fallback;
- `.env.example`, deployment documentation, unit architecture coverage, and browser E2E assertions were updated.

Exact validation evidence:

- clean-room PR CI for the corrective commit: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33269111065` — success;
- `dev` push CI on the same exact SHA: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33269356295` — success;
- staging CD: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33269456849` — success and explicitly logged `TESTED_SHA=792905e1df7fe6a997f1856f48a09e446bedd713` before invoking the staging Dokploy webhook;
- deployed staging source: exact SHA `792905e1df7fe6a997f1856f48a09e446bedd713` on `dev`;
- staging web and PocketBase containers: healthy;
- runtime renderer capability: 64 characters in generated staging `.env`, web container, and PocketBase container.

The final live rehearsal used 12 synthetic recipients and passed the complete platform lifecycle:

- 12 reviewed and issued credentials with unique Credential IDs and 48-character verification tokens;
- 10 email-eligible recipients and 2 explicit missing-email recipients;
- 3 recipient name-fit warnings exercised before Issue;
- test email returned the expected staging safety block and created no credential/outbox state;
- Issue created zero certificate email jobs; Send separately queued exactly 10 jobs and replay queued none;
- the real once-per-minute staging worker terminally failed all 10 synthetic jobs through the central non-production mail safety policy, with no SMTP delivery;
- public verification exposed only the locked seven fields and returned ACTIVE/REVOKED/SUPERSEDED status correctly;
- live credential HTML, PNG, and PDF resources rendered successfully with no-store/noindex protections;
- Revoke and Replace/Supersede preserved public history, and replacement created no email job until a separate Send;
- audit history contained template create/update/publish, `certificate.batch-issue`, two explicit Send entries including replay, Revoke, and Supersede.

Cleanup was completed immediately after acceptance:

- a fresh pre-run PocketBase backup (83,931,492 bytes) was restored;
- post-restore residue checks found zero synthetic events, societies, users, notification-outbox rows, or audit rows;
- both temporary rehearsal backup archives were deleted;
- the temporary rehearsal PocketBase superuser was deleted and subsequent authentication returned 400;
- staging remained healthy and continued returning `X-Robots-Tag: noindex, nofollow` after cleanup.

No real attendee record was mutated, no real certificate was issued, no real certificate/test email was sent, and production was not deployed or modified.

`attendance_qualified` remains intentionally deferred until a genuine multi-session attendance model exists. Production activation and any real certificate issuance remain separate explicit project-owner decisions.

## Phase 10 — Certificate Platform V2 hardening

Closed on the isolated `feature/certificate-platform` branch after a full Linux clean-room gate. V2 simplifies organizer work while preserving the existing immutable issuance and public-verification guarantees.

- Template Studio now accepts one finished certificate artwork. Static logos, signatures, borders, event wording and decoration are baked into that artwork; new separate background/signature uploads are rejected while legacy stored assets remain readable for historical versions.
- Recipient name and Credential ID are the mandatory dynamic overlays. QR is optional and defaults off for new templates. Existing published layouts remain backward compatible.
- Artwork dimensions are read immediately after local selection, before Save, so the editor uses the real canvas ratio while positioning overlays. Visible preview object URLs now remain alive until the replacement image has loaded; the prior early-revoke race that produced Chromium `ERR_FILE_NOT_FOUND` is covered by the browser gate.
- `/verify` accepts the human-readable, non-sequential Credential ID printed on the certificate. The 48-character random token remains the canonical direct/email locator. Both routes expose only the locked seven-field public projection.
- Published versions remain immutable and expose an explicit **Edit as new version** path. Dirty version switching still requires confirmation.
- Certificate email transport now has a provider abstraction. SMTP is presented as transport acceptance only; Resend can progress delivery through accepted, delivered, delayed, bounced, failed, suppressed, and complained states.
- Resend webhook ingestion verifies the raw-body Svix signature, ignores unrelated event types with HTTP 200, records provider events, and handles replay/out-of-order updates without weakening certificate history.
- Test Email uses the configured provider but remains self-addressed, `TEST / NOT VALID`, safety-policy controlled, and outside certificate/batch/outbox issuance. Clean-room CI uses staging-style redirect mode and a fake Resend sink.
- Issue and Send remain separate commands. `attendance_qualified` remains deferred until genuine multi-session attendance exists.

Clean-room review caught two defects before closure:

1. the initial provider refactor left an outbox-record reference inside the Resend Test Email path, so the request threw before transport; Test Email and real outbox sends now carry explicit independent provider metadata;
2. immediate local artwork dimensions initially reused/revoked the visible blob URL too early, producing a Chromium `ERR_FILE_NOT_FOUND`; dimension probing and visible-preview URL lifecycles are now separate, and stateful Playwright retries use independent certificate types so a late failed attempt cannot contaminate a retry.

Phase 10 exact functional closure gate:

- feature SHA: `8483290723bf8b2a945e08e5fb5d7ccd1c5fd23b`;
- workflow: `https://github.com/Phloraxx/IEEE-sahrdayaCET/actions/runs/33298388643` — success;
- lint/typecheck and production client/SSR build: green;
- unit tests: 62 files, 348 passed on the local gate; Linux validation green;
- web + PocketBase container builds: green;
- template, issuance, public verification, provider-aware delivery, revoke/replacement, direct Razorpay, and temporary PayGate clean-room smokes: green;
- 200-recipient scale: preview 0.022 s, issuance transaction 0.181 s, 200 unique Credential IDs, 200 unique 48-character verification tokens, zero certificate outbox jobs before explicit Send;
- public verification projection: exactly `recipientName`, `event`, `certificateType`, `credentialId`, `issueDate`, `issuer`, `status` with ACTIVE/REVOKED/SUPERSEDED/INVALID coverage;
- Browser E2E: 50 discovered, 41 passed, 9 intentionally skipped, including Template Studio desktop/mobile, printed Credential-ID verification, token verification, revocation/supersession, and deterministic PNG/PDF resources.

No V2 staging or production deployment occurred. No real attendee record was changed, no real certificate was issued, and no real certificate or test email was sent. The draft PR was used only as a clean-room CI trigger and is not authorized for merge. A separate project-owner decision is still required before advancing V2 to `dev`/staging or issuing any real workshop certificates.

## Phase 11 — V2 staging visual acceptance

Completed on staging after repeated clean-room and live-browser passes. Exact deployed staging SHA: `90a025db081711242d62267966f086cc2f98514a` on `dev`; production `main` remained untouched.

- PR clean-room CI `33304878917` passed before promotion; exact `dev` push CI `33304997178` passed validation, both container builds, all certificate/payment smokes, and Browser E2E.
- staging CD `33305096213` explicitly logged `BRANCH=dev`, `TARGET=staging`, and `TESTED_SHA=90a025db081711242d62267966f086cc2f98514a` before Dokploy accepted the deployment.
- live staging Playwright exercised create → upload → Save → Publish → Review → Issue, manual Credential-ID verification, token verification, deterministic PNG/PDF, and **Edit as new version** with carried artwork and a saved coordinate change.
- synthetic audience: 12 recipients, 11 email-ready, one deliberate missing-email case; Send remained a separate step and was not executed.
- QR remained off by default. Long-name preview and final render were tested with `Mohammed Abdul Rahman Kizhakkedath`; the rendered name stayed clear of the artwork emblem.
- mobile geometry at 390 px was measured from actual element bounds: document 390 px, admin main 390 px, event-title right edge 349 px. Public verification also had zero horizontal overflow.
- stable-dwell browser pass produced zero console errors and no React Router manifest failures; only Cloudflare RUM requests were aborted during intentional navigation.
- screenshot review caught and fixed a renderer/editor mismatch: Credential ID preview anchoring now follows left/center/right semantics exactly like the production renderer. The shared mobile panel header now stacks actions instead of compressing explanatory text.
- staging Test Email returned `409 TEST_EMAIL_BLOCKED` / `delivery_disabled`, confirming non-production mail safety. Staging remains SMTP-fallback configured with delivery disabled, so staging does not claim real inbox-delivery proof.
- the pre-acceptance PocketBase snapshot was restored after testing. Final residue audit: zero synthetic events, societies, users, certificates, or certificate notification-outbox rows; temporary backup archive removed; staging health remained green.

A physical Android acceptance pass was attempted using the previously authorized Motorola Edge 60 Stylus at `100.99.14.85:5555`. The device became unreachable at the Tailscale network layer (no ping and TCP/5555 closed from both Mac and Oracle), so no claim of physical-device Chrome acceptance is made. The emulated 390 px Chromium acceptance is complete; physical-device verification remains a follow-up once the tailnet device is reachable again.

## Phase 12 — Certificate mail readiness preflight

Completed on staging to prevent operators from queuing certificate email when the runtime cannot safely deliver it. Functional SHA: `88d1f432737fe201762cb0377f57aab2f5de68f6`.

- Added authenticated `GET /api/app/events/{eventId}/certificate-mail/readiness` with non-secret provider, safety-mode, transport, and tracking readiness.
- Send and Retry now fail before any outbox mutation when readiness is false, returning `409 MAIL_NOT_READY`.
- Admin delivery UI surfaces `Mail transport ready` or `Mail not ready` before queue controls and distinguishes SMTP accepted-only tracking from Resend delivery-tracked mode.
- Resend webhook readiness is passed to PocketBase only as a derived non-secret presence flag; the actual webhook signing secret remains web-runtime-only.
- Production deployment guidance now treats SMTP as the selected certificate transport. Resend remains optional support. SMTP acceptance is reported honestly as accepted-only, and SPF/DKIM/DMARC hygiene remains part of production deliverability readiness.

Validation evidence:

- local lint/typecheck green; 62 Vitest files, 349 passed, 3 expected macOS renderer skips; production client/SSR build green;
- CI-only draft PR gate `33307839336` passed validation, both container builds, certificate/payment clean-room smokes, fake-Resend delivery lifecycle, readiness backend assertions, and Browser E2E;
- exact `dev` push CI `33307984311` passed the same full gate;
- staging CD `33308090577` logged `BRANCH=dev`, `TARGET=staging`, and exact tested SHA `88d1f432737fe201762cb0377f57aab2f5de68f6` before successful Dokploy deployment.
Live staging acceptance used a fresh reversible snapshot and a 12-recipient synthetic issued batch:

- runtime readiness resolved to `provider=smtp`, `deliveryMode=disabled`, `trackingMode=accepted_only`, `readyToQueue=false`;
- the UI showed **Mail not ready**, `SMTP`, `DISABLED`, `ACCEPTED ONLY`, and a disabled queue action;
- a direct authenticated Send attempt returned `409 MAIL_NOT_READY` with `Mail delivery is disabled in this environment.`;
- the synthetic batch had zero certificate outbox rows after the blocked Send attempt. One unrelated pre-existing staging certificate outbox row remained outside the synthetic batch and was not modified;
- a separate UI-only Chromium dwell pass produced zero console/page errors, and screenshot review confirmed the readiness warning and disabled action were visually clear.

Cleanup restored the exact pre-test PocketBase snapshot. Raw restored-database marker checks found neither the synthetic event nor temporary template; both staging containers returned healthy; the temporary backup archive and staging-login handoff files were deleted.

Current DNS audit before production mail activation:

- root SPF exists;
- Resend DKIM material exists;
- `send.ieeesahrdaya.com` has SES-style MX and SPF records;
- `_dmarc.ieeesahrdaya.com` is currently absent and must be added before real certificate bulk delivery;
- production certificate mail should use the existing SMTP path with `CERTIFICATE_MAIL_PROVIDER=smtp` and `MAIL_DELIVERY_MODE=live` only after a controlled real-inbox test; Resend credentials/webhooks are not required for the selected SMTP rollout.

No real certificate email was sent. Production `main` remains untouched; real transactional-mail activation and any controlled inbox-delivery test remain separate explicit release steps.
A later physical-device follow-up reached Chrome 151 on the Motorola Edge 60 Stylus over Tailscale/ADB. An operator-supplied real-device screenshot of `/verify` confirmed the public verification layout reflows correctly without horizontal clipping. The displayed credential was intentionally INVALID because its synthetic fixture had already been restored out; therefore this is responsive-layout evidence, not an ACTIVE-credential delivery claim. Authenticated physical-admin capture remained blocked by the execution environment.

## Phase 13 — Public verification design-system integration

Completed on staging after comparing the certificate registry directly against the live homepage and replacing the standalone SaaS-style verification shell with the public IEEE Sahrdaya design language.

- `/verify` and `/c/:token` now share the real public Navbar, dotted technical field, numbered mono section labels, oversized black/IEEE-blue typography, thin rules, dark registry result treatment, and the real public footer.
- The old rounded/pastel credential card language was removed. ACTIVE/REVOKED/SUPERSEDED/INVALID now render as public registry states inside the same editorial system as the homepage.
- Both public routes share one credential-record component, preserving the locked seven-field public projection and preventing visual/data drift between manual Credential-ID lookup and token verification.
- Status is presented once, not duplicated as both badge and record row. PDF/PNG download controls remain available on direct credential pages.
- Local visual review covered empty and INVALID states at 1440 px and 390×844 px with zero overflow; Linux E2E added an explicit mobile public-design-shell regression.
- Clean-room functional head `7800bc52c2aefc1f37f04b76ade37c58c9c11e30` passed CI `33398732182`; exact `dev` push CI `33399127791` passed; CD `33399363286` deployed that exact tested SHA to staging.
- Live staging ACTIVE acceptance used 12 synthetic recipients and exercised both `/c/:token` and `/verify?id=...` on desktop and mobile. The long recipient name wrapped correctly, Credential ID remained readable, public email stayed hidden, and all four layouts had zero horizontal overflow.
- Screenshot review confirmed the ACTIVE registry page now visually belongs to the main IEEE Sahrdaya site rather than a separate utility application.
- A final public-only dwell pass returned zero console errors, zero relevant failed requests, and zero overflow on both routes at desktop and mobile sizes.
- The exact pre-test PocketBase snapshot was restored. Raw restored-volume checks found no synthetic event marker, Credential ID, or test-user prefix; the temporary backup and handoff files were deleted; staging remained healthy.

Production `main` remains untouched. No real attendee, certificate, or email was modified or sent during this phase.
