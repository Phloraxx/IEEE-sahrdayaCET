# Direct Razorpay Payment Architecture

Target: `admin-v2-razorpay-direct-20260813` -> `dev`/staging only after all release gates pass. Production remains untouched until a separate approval.

## Principles

- Razorpay is the only online payment rail.
- `registrations` owns attendee/seat state; financial state is normalized into payment collections.
- All money is stored as integer paise.
- Manual/offline confirmations remain a separate audited rail and never masquerade as provider capture.
- Tickets are issued only after a Razorpay payment is `captured`.
- Provider HTTP calls happen outside SQLite transactions; state transitions re-read current records inside short transactions.

## Collections

### `payments`
One Razorpay Order-level record per paid internal registration.

Fields: registration, event, provider (`razorpay`), providerOrderId, receipt, status, baseFeePaise, discountPaise, finalFeePaise, collectedPaise, refundedPaise, currency, capturedPaymentId, paymentMethod, confirmationSource, createdAt, capturedAt, lastSyncedAt, manualReview, reviewReason.

Unique indexes: registration (for active Razorpay order), providerOrderId when non-empty, receipt.

### `payment_attempts`
Stores individual Razorpay payment attempts linked to one payment/order. This preserves failed retries without overloading the order row.

Fields: payment, providerPaymentId, status, amountPaise, method, errorCode, errorDescription, createdAt, capturedAt.

### `payment_refunds`
One row per refund request/result.

Fields: payment, providerRefundId, idempotencyKey, amountPaise, status, reason, source, requestedBy, requestedAt, processedAt, failedAt, failureReason.

### `payment_webhook_events`
Small durable inbox for verified webhook metadata. Store event ID, event type, entity IDs, provider-created timestamp, payload hash, processing status and error. Do not retain full Razorpay payloads long-term.

## Order creation

Create a Razorpay Order directly from PocketBase using server-only credentials. Use a deterministic unique receipt derived from the registration. Razorpay treats duplicate receipts as duplicate requests; on timeout/ambiguous create, recover the existing order by receipt rather than creating another order.

Use the exact `finalFeePaise`, INR, `partial_payment=false`, registration/event identifiers in notes, and automatic capture.

## Checkout verification

The browser returns `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.

The server must use the order ID stored in its own database, verify HMAC-SHA256 of `order_id|payment_id`, fetch the payment from Razorpay, verify order/payment identity + amount + INR, then confirm only if the provider says `captured`.

A valid signature proves callback authenticity; it does not by itself prove capture.

## Webhooks

Endpoint: `POST /api/webhooks/razorpay`.

Verify the signature against the raw request body and a dedicated webhook secret. Deduplicate by Razorpay event ID. The request should do only fast signature validation + inbox persistence and return 200 quickly; a recurring worker processes the event and fetches canonical provider state.

Subscribe to payment capture/failure, order paid, refund created/processed/failed, and payment dispute events.

## State rules

- Active seat + captured payment -> confirmed + paid, issue ticket.
- Cancelled/released seat + captured payment -> stay cancelled, mark paid, queue automatic full refund; never resurrect capacity.
- Failed payment attempt -> keep seat pending until local hold expires; user may retry the same Razorpay Order.
- Hold expiry -> reconcile provider state first; if no capture exists, transactionally release the seat.
- Full processed refund -> financial state refunded; preserve original receipt/history.
- Partial refund -> preserve paid history, record exact refunded paise, surface entitlement review if required.
- Refund failure -> keep paid state and surface attention.

## Event cancellation

For Razorpay-paid attendees, automatically enqueue full refunds. For manual/offline payments, enqueue a `manual refund required` task. Free attendees are simply cancelled. Event cancellation must remain a command, not a raw status PATCH.

## Reconciliation and disputes

Run lightweight periodic reconciliation for unresolved orders/refunds. Subscribe to `payment.dispute.created` and surface disputes as high-priority Payment Desk attention because active disputes can affect refund handling.

## Remove from the old architecture

Delete PayGate payment routes/webhooks/crons/helpers, Kotak/Slice provider choices, direct-UPI fingerprint pricing, event-level payment provider selection, PayGate env variables, and PayGate-specific CI tests.

Historical PayGate rows remain read-only legacy financial history. Before production promotion, require zero unresolved active PayGate sessions or explicitly resolve them.

## Release gates

Require lint, TypeScript, full unit suite, client+SSR build, PocketBase hook syntax, fresh/staging-history/production-snapshot migrations with final-schema comparison, fake-Razorpay integration tests, checkout verification, duplicate/out-of-order webhook tests, capture-vs-expiry races, full/partial/failed refund tests, late-capture automatic refund, notifications, CSV tests, public Playwright, authenticated Admin V2 Playwright, and deployed staging health/log/header verification.