# 05 — Waitlist, Cancellations and Refunds

## Waitlist model

Do not overload registrations with `waitlisted`. Use a separate `event_waitlist` lifecycle: `waiting → offered → accepted | declined | expired | cancelled`.

A waitlist row belongs to one event/user and records join time, offer time, expiry and the promoted registration when claimed. Capacity is not consumed while waiting.

Seat release from cancellation/payment expiry should transactionally make the next eligible waitlist entry offerable. The initial implementation can expose the claim in My Events; it must not depend on email.

For paid events, an offer leads into the normal payment flow. Do not pre-authorize cards or invent a special UPI payment mechanism.

## Free-event cancellation

Add event policy fields for whether attendees may self-cancel and until when. A free confirmed registration can be cancelled transactionally, releasing capacity/coupon usage exactly once and invalidating the ticket.

## Paid events

First version should create an attendee `refund_request`, not move money automatically. Finance resolves the request using existing payment evidence and explicit refund/manual-review commands.

## Invariants

- Cancellation and refund are different state transitions.
- A provider callback cannot reactivate an attendee after cancellation.
- Capacity release, coupon restoration and registration status move atomically.
- Waitlist promotion must be idempotent and safe under concurrent seat release.
- A user may not hold both an active registration and active waitlist position for the same event.
- Offer expiry must not consume capacity permanently.

## UI

When full, the event CTA should become `Join waitlist` when enabled rather than a dead-end `Full` label. My Events should show position/offer state without promising an exact queue number if concurrency makes it misleading.

Cancellation UI must clearly state consequences before confirmation: ticket invalidation, seat release, refund-request behavior and whether re-registration is possible.

## Deferred

Automatic gateway refunds, waitlist payments with preauthorization, priority tiers and complex transfer/resale workflows are deliberately deferred.
