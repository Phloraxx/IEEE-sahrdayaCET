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

## Next implementation phases

1. Admin Certificates tab + visual template editor using the completed Phase 2 commands.
2. Audience preview + fingerprint + idempotent issuance.
3. Public `/c/:token` verification and QR/PNG/PDF resources.
4. Outbox `certificate` mail kind and delivery dashboard.
5. Attendance sessions only where future multi-session qualification actually requires them.
6. Staging rehearsal with synthetic recipients only.

## Branch safety

`main` is not modified by this work. Certificate work remains isolated until its migrations, authorization, rendering, browser flow, and clean-room CI are green.
