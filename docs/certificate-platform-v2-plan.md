# Certificate Platform V2 — Research & Implementation Plan

Date: 2026-08-30
Branch: `feature/certificate-platform`

## Why this pass exists

The staging acceptance proved the backend lifecycle, but the organizer-facing certificate editor still exposes implementation details (`source background`, `flattened render base`, signature sources) and the browser preview is not faithful enough to the production renderer. Email currently proves SMTP acceptance, not downstream delivery.

## External patterns reviewed

- Certifier: one certificate design canvas, reusable static artwork, dynamic attributes, optional QR, preview-before-issue, separate email decision, resend controls.
- Accredible: reusable credential design with mapped recipient/credential attributes and public credential pages.
- Sertifier: unique certificate ID + verification page are the durable verification core; QR is optional. Delivery tooling surfaces undelivered credentials and resend.
- Credly: public credential URL is the primary verification surface; a LinkedIn Credential ID is optional.
- Gmail sender guidance: authenticate transactional mail with SPF/DKIM and preferably DMARC; SMTP acceptance alone is not inbox-delivery evidence.
- Resend: API/webhook events distinguish sent, delivered, delayed, bounced, failed, suppressed and complained.
## Locked V2 product decisions

1. **One artwork upload.** The organizer uploads the finished certificate artwork. Logos, signatures, static wording, event title, borders and decorations belong in that artwork. The backend continues to store this authoritative image in `renderBase`; legacy source-background/signature fields remain readable only for backward compatibility and disappear from the organizer UI.
2. **Only truly dynamic fields are overlaid.** Recipient name and Credential ID are mandatory dynamic fields. QR becomes optional and is off by default.
3. **Credential ID becomes a verification locator.** The existing ID is non-sequential and includes 10 random characters. `/verify` accepts that exact ID and returns the same seven-field public projection as token verification. The 48-character token remains the canonical emailed/deep-link locator.
4. **Editor fidelity over cleverness.** Canvas aspect ratio follows the uploaded artwork, positions scale from real canvas pixels, switching templates cannot silently discard unsaved edits, and published versions get an explicit “Edit as new version” action.
5. **Delivery states must mean what they say.** SMTP `sent` means upstream accepted, not delivered. Add a provider abstraction with Resend support and webhook-backed delivered/bounced/delayed/complained states. SMTP remains a fallback.
6. **Issue and Send remain separate.** No change to the lifecycle safety boundary.

## Implementation order

- Phase A: simplify template model/UI and repair editor fidelity.
- Phase B: add Credential-ID verification and make QR optional.
- Phase C: add transactional email provider abstraction + delivery webhooks/status UI.
- Phase D: clean-room tests, staging deployment, synthetic acceptance, and documentation.
