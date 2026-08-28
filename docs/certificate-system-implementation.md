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

Pending after Gate 1 validation.

Spike must prove, inside the current Node 22 Alpine web image:

- deterministic high-resolution PNG output;
- exact canvas dimensions;
- approved-font loading and text measurement;
- long-name auto-fit with a minimum size and explicit failure state;
- apostrophe, hyphen, initials, and supported Unicode fixtures;
- QR composition using the existing `qrcode` package;
- one-page PDF with visual parity to PNG;
- no PocketBase superuser credential in the web runtime.

Preferred first candidate: `sharp` with SVG/text overlays and the existing QR package. A dependency is accepted only if the Docker spike passes.

## Next implementation phases

1. Schema + explicit certificate capabilities.
2. Template versioning/editor and immutable render base.
3. Audience preview + fingerprint + idempotent issuance.
4. Public `/c/:token` verification and QR/PNG/PDF resources.
5. Outbox `certificate` mail kind and delivery dashboard.
6. Attendance sessions only where future multi-session qualification actually requires them.
7. Staging rehearsal with synthetic recipients only.

## Branch safety

`main` is not modified by this work. Certificate work remains isolated until its migrations, authorization, rendering, browser flow, and clean-room CI are green.
