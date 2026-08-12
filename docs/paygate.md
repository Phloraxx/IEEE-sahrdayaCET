# PayGate event payments

IEEE event payments use the separately deployed PayGate service for direct-UPI verification. PocketBase is the integration boundary; the React application never receives the PayGate API key and never decides a payment amount.

## Flow

```text
attendee submits registration
        │
        ▼
IEEE PocketBase transaction
  - validates event/window/capacity
  - applies coupon
  - stores final whole-rupee amount
  - reserves one pending seat
        │
        ▼
POST /api/app/registrations/{id}/payment
        │ server-to-server
        ▼
PayGate POST /api/payments
  externalId = ieee-registration:<registrationId>
  idempotency = ieee-paygate-<registrationId>
        │
        ▼
IEEE payment page renders exact PayGate amount + UPI QR
        │
        ▼
bank credit evidence → PayGate
        │
        ├── signed payment.paid webhook ──► IEEE confirms + mints TKT-*
        │
        └── IEEE status reconciliation ───► same transition if webhook is delayed
```

The browser only receives the public payment session required to render the checkout. It cannot create an arbitrary-priced PayGate payment.

## Configuration

The PocketBase service accepts:

```env
PAYGATE_URL=https://paygate.example.org
PAYGATE_API_KEY=<server-to-server key>
PAYGATE_WEBHOOK_SECRET=<outgoing PayGate HMAC secret>
PAYGATE_REGISTRATION_GRACE_SECONDS=600
PAYGATE_WEBHOOK_TOLERANCE_SECONDS=300
```

`PAYGATE_API_KEY` and `PAYGATE_WEBHOOK_SECRET` are backend-only credentials. Do not put them in `VITE_*`, React Router web-service environment variables, client-side code, logs, screenshots, or repository files.

`PAYMENT_WEBHOOK_SECRET` is the older generic payment callback secret and remains separate during migration.

Each environment must have its own credentials and data. In particular, `dev`/staging must not point at the production PayGate account/UPI destination.

## PayGate outgoing webhook

Configure the PayGate instance to deliver its outgoing webhook to the IEEE PocketBase origin:

```text
https://<ieee-host>/api/webhooks/paygate
```

IEEE verifies:

- `X-PayGate-Event-Id`;
- `X-PayGate-Timestamp` freshness;
- `X-PayGate-Signature: v1=<HMAC-SHA256>` over `<timestamp>.<raw body>`;
- event ID consistency between header and body;
- PayGate payment ID consistency with the registration;
- requested amount equals `registration.amount * 100`;
- payable amount is requested amount plus exactly 1–99 paise;
- event type matches the embedded PayGate payment status.

PayGate event IDs are retained in `registration.paymentData` for webhook replay deduplication.

## Payment state mapping

| PayGate | IEEE registration | Notes |
| --- | --- | --- |
| `pending` | pending / pending | Seat remains reserved. |
| `paid` | confirmed / paid | A real `TKT-*` ticket is minted. |
| `expired` | pending / pending temporarily | IEEE keeps a grace window because an on-time bank payment can be reported late. |
| `cancelled` | cancelled / failed | Seat is released. |
| `late` | cancelled / failed + manual review | Never auto-resurrects a released seat. |

Cancellation is terminal. If PayGate later reports money after IEEE has released the seat, the evidence is retained for organizer review/refund handling rather than automatically taking a seat from another attendee.

## Grace window

PayGate evaluates the bank/provider occurrence timestamp, not only SMS arrival time. A transaction performed before PayGate expiry can therefore become `paid` even if the bank SMS arrives later.

For this reason IEEE does not release a registration immediately on `payment.expired`. It waits until `expiresAt + PAYGATE_REGISTRATION_GRACE_SECONDS`.

A registration whose PayGate session was never initialized is also released after the same grace duration. This prevents a lost/abandoned browser request from occupying event capacity indefinitely.

The default IEEE grace is 10 minutes. Changing it is an operational tradeoff between seat turnover and tolerance for delayed bank evidence.

## The 99-fingerprint limit

Direct PayGate UPI identifies payments by a paise fingerprint. For a requested whole-rupee price such as ₹100, the available exact amounts are:

```text
₹100.01 ... ₹100.99
```

`.00` is not allocated. Therefore a single whole-rupee base price has **99 simultaneous or quarantined fingerprints**.

A resolved/expired amount remains quarantined in PayGate before it can be reused. With a long quarantine, 99 payment allocations at the same event price can temporarily exhaust that price pool even when some users have already paid or abandoned checkout.

Consequences:

- do not assume a paid event with hundreds of registrations can burst through PayGate direct UPI at one identical price;
- monitor PayGate capacity before large launches;
- stagger high-volume registration openings or use another provider/rail when expected throughput exceeds the fingerprint pool;
- do not shorten PayGate quarantine casually: it protects against delayed/old payment evidence being assigned to a newer payment.

IEEE translates PayGate `AMOUNT_CAPACITY_EXHAUSTED` into a retryable user-facing payment-capacity error; it does not silently generate a different event price.

## Idempotency and refreshes

One IEEE registration has one deterministic PayGate idempotency key and one stored PayGate payment ID. Repeated browser requests return the same payment session instead of allocating a new paise fingerprint.

The event registration command itself is also recoverable: if the browser loses the original registration response, submitting again for the same user/event returns the existing active registration rather than reserving a second seat.

## Payment recovery IDs are not tickets

`paymentTicketId` exists only as a private recovery handle for the owner/admin while a paid registration is pending. It is not a public event ticket.

Public ticket lookup resolves real `ticketId` values. An authenticated owner can resolve a `paymentTicketId` so the UI can route them back to `/payment/<registrationId>`. Once paid, the UI canonicalizes the temporary URL to the real `TKT-*` URL.

## Testing

CI runs both payment paths:

1. the existing legacy `payment-confirm` smoke tests, to prevent accidental migration regressions;
2. `tests/backend/paygate_smoke.py`, which starts a fake PayGate HTTP server and tests the actual PocketBase server-to-server integration.

The PayGate clean-room test covers:

- registration recovery/idempotency;
- payment creation and exact paise amount;
- duplicate creation protection;
- polling-based paid reconciliation;
- private temporary payment IDs;
- HMAC signature rejection;
- stale timestamp rejection;
- requested-amount mismatch rejection;
- webhook replay deduplication;
- delayed confirmation after provider expiry;
- late-payment manual review;
- real ticket issuance.

No real UPI account, real PayGate API key, or production payment webhook is used by CI.

## Deployment checklist

Before enabling paid registrations in an environment:

1. configure `PAYGATE_URL`, `PAYGATE_API_KEY`, and `PAYGATE_WEBHOOK_SECRET` on the IEEE PocketBase service;
2. configure PayGate outgoing webhooks to `/api/webhooks/paygate` with the same HMAC secret;
3. verify the PayGate UPI destination/payee is correct for that environment;
4. confirm the PayGate connector/bank evidence path is healthy;
5. make a controlled low-value test registration and verify `pending → paid → confirmed → TKT-*`;
6. verify a bad webhook signature is rejected;
7. verify an expired/late payment does not incorrectly consume or resurrect a seat;
8. check fingerprint-pool capacity before opening a high-volume paid event.
