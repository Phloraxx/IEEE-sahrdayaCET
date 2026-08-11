# PayGate event payments

IEEE Sahrdaya uses PayGate as an optional direct-UPI verification provider for paid event registrations.

## Trust boundary

- IEEE PocketBase owns event pricing, coupons, capacity, registrations, and tickets.
- The browser never receives `PAYGATE_API_KEY` or `PAYGATE_WEBHOOK_SECRET`.
- Paid registration creation fails closed when PayGate is not configured.
- PayGate receives the registration amount only from PocketBase, never from a browser-submitted amount.
- `externalId` is `ieee-registration:<registrationId>` and the idempotency key is deterministic per registration.
- PayGate's paise fingerprint changes only the payable amount. IEEE verifies `requestedAmountPaise === registration.amount * 100`.

## Routes

```text
POST /api/app/registrations/{id}/payment
GET  /api/app/registrations/{id}/payment
POST /api/webhooks/paygate
```

The payment routes require the registration owner or an admin. The webhook is authenticated by PayGate HMAC headers.

## Webhook verification

PayGate signs the exact raw body using HMAC-SHA256 over:

```text
<timestamp>.<raw request body>
```

IEEE verifies:

- `X-PayGate-Event-Id`
- `X-PayGate-Timestamp`
- `X-PayGate-Signature: v1=<hex hmac>`
- timestamp freshness
- event envelope ID
- `externalId` registration identity
- persisted PayGate payment ID when present
- requested amount in paise

## Lifecycle

```text
payment.paid      -> confirmed + real TKT-* ticket
payment.expired   -> keep pending during grace, then release seat
payment.cancelled -> cancel registration and release seat
payment.late      -> cancel automatic registration path and mark manual review
```

A cancelled registration is terminal. A later payment callback never resurrects a released seat.

The expiry grace exists because PayGate evaluates the bank-credit occurrence time. A payment made before expiry can be reported after expiry if the bank SMS arrives late.

## Capacity limitation

Direct UPI verification uses one of 99 paise fingerprints (`.01` through `.99`) for each whole-rupee requested amount. A fingerprint remains unavailable through PayGate's quarantine window. Large events with many simultaneous registrations at the same price can therefore exhaust the pool and should have an operational fallback.

## Environment

PocketBase-only values:

```text
PAYGATE_URL
PAYGATE_API_KEY
PAYGATE_WEBHOOK_SECRET
PAYGATE_REGISTRATION_GRACE_SECONDS
PAYGATE_WEBHOOK_TOLERANCE_SECONDS
```

Staging and production must use separate secrets and provider configuration. Do not copy production payment secrets into staging.

## PayGate configuration

Configure PayGate's outgoing webhook to the matching IEEE environment:

```text
https://<ieee-host>/api/webhooks/paygate
```

The PayGate `OUTGOING_WEBHOOK_SECRET` must equal IEEE's `PAYGATE_WEBHOOK_SECRET` for that environment.

## Testing

CI runs:

- pure lifecycle/amount invariant tests against the deployed helper source;
- clean-room PocketBase smoke tests;
- a mock PayGate integration smoke test for server-authoritative amount creation, authentication, HMAC rejection, identity/amount mismatch rejection, successful confirmation, expiry grace, and late-payment handling.
