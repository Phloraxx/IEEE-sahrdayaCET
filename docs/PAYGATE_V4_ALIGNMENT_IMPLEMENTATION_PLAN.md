# PayGate v4 Alignment Implementation Plan

## Scope

Align the IEEE Sahrdaya `dev` branch so paid IEEE-site registrations use PayGate v4 as the only active online payment path. Keep historical financial records readable, but remove provider selection and retired checkout runtimes from new user flows.

## Verified current state

- `origin/dev` and this worktree started at `0d94567271b2cdc8f9201097b456744d319420a8`.
- Staging already runs with `PAYGATE_API_VERSION=v4`.
- Production still advertises `PAYGATE_API_VERSION=v3`; production must be switched to the v4 contract before a future production deploy of this change.
- No production or staging registration is currently both `registrationStatus=pending` and `paymentStatus=pending` on Razorpay.
- Production has no Razorpay-backed registration records; staging has one historical cancelled/paid Razorpay registration and one captured Razorpay ledger row.
- Historical provider values must therefore remain readable in ledger/reporting data, but no active Razorpay checkout continuity is required.

## Current dependency map

```text
registration-create.pb.js
  ├─ payment-provider-selection.js ── Razorpay / Kotak decision
  ├─ razorpay-direct-helpers.js ───── Razorpay availability
  └─ paygate-helpers.js ───────────── PayGate availability

/payment, /payment/reconcile
  └─ razorpay-direct.pb.js
       ├─ PayGate delegation
       └─ active Razorpay order/verify/reconcile path

PaymentPage.tsx
  ├─ PayGate exact-amount QR
  └─ Razorpay Custom Checkout + UPI intent/QR
```

The generic payment endpoints must be separated from the Razorpay route file before the Razorpay runtime is removed.

## Target runtime

```text
paid registration
  → paymentData.provider = paygate
  → POST /api/app/registrations/:id/payment
  → PayGate POST /v1/payments
  → exact PayGate upi_uri + payable_amount
  → signed payment webhook and/or reconciliation
  → registration confirmed
```

## Implementation

1. Make `paygate-helpers.js` v4-only: snake-case v4 normalization, `/v1/payments`, metadata/environment identity, v4 fingerprint validation, no runtime v3 switch.
2. Move generic payment create/read/reconcile routes into a PayGate-only route module.
3. Remove active Razorpay checkout routes, webhook workers, frontend checkout client, and Razorpay CSP allowances.
4. Make every new paid registration lock to PayGate; retain whole-rupee requested-fee validation because PayGate v4 requires an integer INR request and owns the paise fingerprint.
5. Remove event-admin provider selection and add a forward migration removing `events.paymentProvider`. Historical migrations remain untouched.
6. Use the exact PayGate-provided `upi_uri` for QR and mobile UPI intent. Do not strip or reconstruct query parameters.
7. Make attendee payment copy provider-neutral: PayGate/UPI only, with no bank, relay, parser, or notification-source wording.
8. Extract provider-neutral ledger lookup used by admin/manual-refund/cancellation workflows. Preserve historical Razorpay rows as historical finance evidence without keeping Razorpay checkout runtime.
9. Keep webhook signature/timestamp/idempotency, registration/environment/payment identity, amount validation, reconciliation fallback, seat/coupon consistency, and manual-review guards.
10. Update tests so v3/Razorpay/Kotak paths are rejected as architecture regressions rather than expected behavior.

## Validation gates

- runtime syntax, typecheck, lint, full unit suite, build;
- clean-room PocketBase migration/bootstrap;
- registration/privacy exploit matrix;
- PayGate webhook + reconciliation smoke;
- expiry, duplicate webhook, wrong identity/amount, late/cancelled/manual-review, refresh/resume;
- QR encodes the exact `upi_uri` and mobile link uses the same URI;
- staging paid-event end-to-end on PayGate v4;
- independent security/regression review after implementation.

## Deployment boundary

No production deployment is part of this pass. A future production deployment is blocked until the production PayGate environment is confirmed on the v4 API contract and its obsolete v3 setting is removed or changed.