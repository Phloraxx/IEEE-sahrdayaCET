# 02 — Attendee Experience

## Goal

The attendee should always understand: what event am I part of, what do I need to do next, and where are my ticket/payment/access/certificate records?

## Public discovery and event detail

- Public CTA must use the canonical lifecycle projection.
- Registration opening/deadline, capacity and event end must agree across SSR, registration UI and backend.
- Explicit attendance mode replaces venue-text inference for new events.
- Public event data may include venue/address and a public supporting link.
- Private online meeting access must never appear in public SSR, JSON-LD, search metadata or raw event records.

## Registration/payment continuity

Keep the current transactional registration/payment architecture. Improve continuity rather than rewriting it:

- registration success should always lead to a stable registration/ticket state;
- pending payment should expose a clear resume/recovery path;
- expired/failed payment must never resurrect a cancelled registration;
- coupon/capacity errors need actionable messages;
- ticket and receipt actions should remain available after navigation away from payment.

## My Events

Add `/my-events` as the persistent attendee home. It should show upcoming, action-needed and past events with status, ticket, payment, attendance and certificate actions.
### My Events cards

Each card should expose only the next useful action: continue payment, view ticket, add to calendar, view attendee-only join details, cancel/request refund, feedback, or certificate.

Private join details are retrieved only for a confirmed registration. They are not copied into the attendee profile or cached in public data.

## Self-service additions

Planned additions:

- ICS / Add to Calendar.
- Free-registration self-cancellation before a policy deadline.
- Paid-event refund request rather than automatic refund in the first version.
- Waitlist join/claim state when capacity is full.
- Post-event feedback inside My Events, without requiring email prompts.

## Accessibility and mobile

- 44px-class practical touch targets for primary mobile controls.
- No hover-only information.
- Errors associated with fields and announced.
- Do not make users re-enter known account information without a reason.
- Authentication and ticket retrieval must remain usable with keyboard/screen reader and mobile browsers.

## Explicit non-goal

No attendee social network, chat, seat map, merchandise, recommendation engine or marketing automation is planned.
