# Certificate System Implementation Ledger

Status: implementation in progress on `feature/certificate-platform`; Phases 1–4 are complete on the isolated branch. Send/delivery work has not started.

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

1. Close Phase 5 only after its dedicated clean-room backend, Browser E2E, production build, and both container builds are green on the exact feature SHA.
2. Add organizer-facing revocation/supersession commands only through the existing explicit credential-state model and `certificates.revoke` capability; public verification must continue to preserve historical revoked/superseded records.
3. Add `attendance_qualified` only when a real future multi-session attendance model exists; do not infer historical attendance.
4. Rehearse on staging with synthetic recipients only after the full feature-branch gate is green and the project owner explicitly requests staging deployment.

## Branch safety

Certificate work remains isolated on `feature/certificate-platform`. `dev` and `main` are not to be modified by this work until an explicit merge decision. Phase 4 completion by itself does not authorize staging or production deployment.


## Phase 5 — explicit Send + delivery tracking

Implemented locally on the isolated certificate branch; clean-room CI is the remaining gate before this phase is closed. Issuance is still email-free.

- `certificates.send` is a separate explicit capability from `certificates.issue`; the current operational roles that may issue also receive Send, while registration/check-in/content/finance-only roles receive neither.
- Send is a dedicated PocketBase command on an already-issued batch. It only enqueues jobs and never performs SMTP synchronously.
- Certificate delivery reuses the existing `notification_outbox`, its transactional claim/stale-lock behavior, exponential retries, and the Gate 1 non-production mail-safety policy. No second queue, scheduler, or runtime service was added.
- There is exactly one deduplicated certificate outbox row per issued credential (`certificate:<certificateId>`). Replaying Send creates zero duplicates.
- Only ACTIVE credentials with a valid immutable recipient-email snapshot are queued. Missing-email credentials remain issued and verifiable but are not silently placed in the mail queue. Revoked or superseded credentials cannot be newly queued or manually retried.
- The frozen template email subject/body is expanded from the issued credential snapshot. Delivery links to the public verification page and PDF resource; protected template source/background/signature/render-base assets remain private.
- Batch `queuedCount`, `sentCount`, `failedCount`, `sendStartedAt`, `completedAt`, and delivery status are reconciled from outbox truth. Retryable failures keep the batch in `sending`; attempt 8 is terminal and yields `partial_failure`.
- `retry-failed` is explicit and only resets terminal failed jobs that still belong to ACTIVE credentials.
- Event Admin now has a separate **Send & delivery** panel beneath the unchanged Recipients → Review → Issue flow. View-only certificate users can inspect delivery; only `certificates.send` users see queue/retry actions.
- Per-recipient delivery exposes credential status, delivery status, attempts, sent time/error and the public verification resource, without opening certificate/outbox collection CRUD.

Coverage added for this phase:

- source-level guards proving Issue contains no outbox/send behavior and Send reuses the existing mail-safety worker;
- permission vocabulary tests for `certificates.send`;
- `tests/backend/certificate_delivery_smoke.py` for no-send-on-Issue, authorization, dedupe/idempotency, missing email, sent reconciliation, terminal failure, retry reset and revoked-credential retry rejection;
- Browser E2E now continues the synthetic Template Studio flow through explicit Issue and then the separate Queue email action. The clean-room environment has no live SMTP path, so this cannot send a real certificate email.

Local gate after Phase 5 changes: zero-warning lint, typecheck, production build, and 333 unit tests discovered (332 passed; the existing Linux-only renderer assertion is skipped on macOS).
