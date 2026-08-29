# Certificate System Implementation Ledger

Status: implementation in progress on `feature/certificate-platform`.

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

Complete locally. Added authoritative server-only `certificate_templates`, `certificate_batches`, and `certificates` collections plus the `certificate` notification-outbox kind/relation. All normal collection CRUD rules are closed; future browser/admin access must use scoped custom commands.

Verified on a fresh PocketBase 0.39.9 database through collection metadata and the existing clean-room backend smoke:

- protected source background/signature/render-base fields;
- unique template-version, credential-ID, and verification-token indexes;
- partial unique index allowing only one active certificate per registration/event/type;
- supersedes/supersededBy self-relations;
- outbox accepts `ticket`, `receipt`, and `certificate`;
- ordinary users and legacy application admins cannot directly list/read/create certificate core records;
- existing registration/payment/ticket/outbox backend smoke remains green.

Explicit capabilities are now `certificates.view`, `certificates.manage_templates`, `certificates.issue`, and `certificates.revoke`. Check-in, registration, content, and finance-only roles receive none by default; Event Lead receives view/issue but not template management or revocation.

## Phase 2 — template lifecycle and immutable publication

Complete locally. Event-scoped certificate template commands now provide create/list/get/update/publish/archive/new-version/delete-draft behavior while direct collection CRUD remains closed.

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

Implemented locally on the isolated certificate branch. Certificate administration now appears as a permission-gated `Certificates` tab inside the existing `/admin/events/:id` workspace rather than as a separate dashboard.

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

Local gate: 313/313 unit tests, typecheck, zero-warning lint, and production build are green. Feature-branch clean-room CI is also green, including fresh PocketBase migration, certificate template lifecycle, Razorpay/PayGate smokes, both container builds, and the real Browser E2E create/upload/save/publish/version flow.

## Phase 3A — audience review + immutable issuance backend

Implemented locally. Issue remains a separate command from email delivery.

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

## Next implementation phases

1. Event Admin Recipients → Review → Issue UI using the completed backend commands.
2. Public `/c/:token` verification and QR/PNG/PDF resources.
3. Outbox `certificate` mail kind and delivery dashboard.
4. Attendance sessions only where future multi-session qualification actually requires them.
5. Staging rehearsal with synthetic recipients only.

## Branch safety

`main` is not modified by this work. Certificate work remains isolated until its migrations, authorization, rendering, browser flow, and clean-room CI are green.

## Phase 3B — Event Admin Recipients → Review → Issue

Implemented locally in the existing Certificates tab. A published template now unlocks a separate issuance workflow beneath Template Studio.

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
