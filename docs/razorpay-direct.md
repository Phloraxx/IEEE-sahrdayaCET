# Direct Razorpay payments

IEEE PocketBase talks directly to Razorpay. PayGate, Kotak/Slice routing, direct-UPI fingerprint pricing, and the legacy payment-confirm webhook are retired.

## Runtime

Required on the PocketBase service:

```env
RAZORPAY_API_BASE_URL=https://api.razorpay.com
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_CHECKOUT_HOLD_SECONDS=600
PAYMENTS_ENABLED=true
```

`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only. `PAYMENTS_ENABLED=false` pauses new paid registrations/orders but does not stop reconciliation, webhook processing, or refunds.

## Flow

1. Paid internal registration snapshots the exact fee in integer paise.
2. PocketBase creates or recovers one Razorpay Order using a deterministic receipt.
3. Standard Checkout returns order ID, payment ID and signature.
4. PocketBase verifies the signature using the server-stored Order ID, then fetches canonical payment state from Razorpay.
5. Only `captured` confirms the registration and mints a ticket.
6. Signed webhooks are deduped into a small inbox and processed asynchronously from canonical Razorpay API state.
7. Late captures never resurrect seats; they are flagged for a manual refund in the Razorpay Dashboard.

## Financial data

`registrations` owns seat/attendee state. `payments`, `payment_attempts`, `payment_refunds`, and `payment_webhook_events` own financial state. All canonical money values are integer paise. Historical PayGate rows remain readable as `legacy_paygate`; they are not an active payment rail.

## Refunds

IEEE never initiates Razorpay refunds. Event cancellation and late captures flag the payment for manual resolution; an admin refunds it in the Razorpay Dashboard, and webhook/reconciliation updates IEEE after Razorpay confirms it. Manual/legacy payments use the explicit external-refund recording path.

## Release gate

Before production cutover, verify there are no unresolved active legacy PayGate sessions. Historical completed rows may remain read-only. Run the direct Razorpay fake-provider integration suite, concurrency/refund tests, migration tests, and authenticated Admin V2 browser tests before enabling paid registrations.
