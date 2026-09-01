# 08 — Research and Decisions

This plan borrows proven interaction/state patterns, not product scope. IEEE Sahrdaya does not need to reproduce a commercial ticketing SaaS.

## Pretix — attendance/check-in

Official Pretix check-in documentation models independent check-in lists, repeated entries, entry-after-exit, entry/exit record types, nonce-based idempotency and explicit search/scanner APIs.

Sources:
- https://docs.pretix.eu/dev/api/resources/checkinlists.html
- https://docs.pretix.eu/dev/api/resources/checkin.html

Decision: adopt append-only/session-aware attendance records and idempotency concepts. Do not initially adopt Pretix's full offline synchronization complexity.

## Eventbrite — permissions and attendee self-service

Eventbrite exposes dedicated check-in-only roles rather than requiring broad organizer access, and its attendee account provides ticket management, free-order cancellation and refund-request workflows.

Sources:
- https://www.eventbrite.com/help/en-us/articles/509534/
- https://www.eventbrite.com/help/en-us/articles/557726/
- https://www.eventbrite.com/help/en-us/articles/990713/

Decision: preserve IEEE Sahrdaya's event-scoped `checkin.manage` least privilege; add My Events, free self-cancellation and paid refund requests without copying Eventbrite's commerce model.
## Luma — waitlist

Luma automatically exposes waitlisting after an event reaches capacity and gives organizers explicit approval/decline states. Paid waitlists use payment authorization, which does not map cleanly to this project's current UPI flows.

Source: https://help.luma.com/p/waitlist

Decision: adopt a separate waitlist/offer/claim lifecycle, but for paid IEEE events the offered attendee completes the normal payment flow rather than preauthorizing payment while waiting.

## WCAG 2.2 — interaction baseline

WCAG 2.2 adds requirements around target size, dragging alternatives, redundant entry, focus visibility and accessible authentication.

Sources:
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

Decision: use these as the accessibility floor for new scanner, My Events and lifecycle controls. Product design should generally exceed the 24px minimum pointer-target criterion for touch-heavy operations.

## Deliberately rejected scope

No vTools/L31 reporting, seat maps, ticket classes, merchandise, sponsor CRM, attendee social network, mass marketing suite, native apps, automatic gateway refunds, or full offline scanner sync are part of this programme.
