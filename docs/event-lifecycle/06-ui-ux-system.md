# 06 — UI/UX System

## Direction

Keep the current public visual identity. The lifecycle programme is primarily a continuity/clarity redesign, not another aesthetic rewrite.

## Organizer UX

The event workspace should progressively emphasize the current phase. Drafts emphasize readiness/setup, registration-phase events emphasize attendee/payment exceptions, live events emphasize event-day operations, and ended events emphasize closeout.

Use human language for next actions and blockers. Detailed status badges remain secondary evidence, not the main navigation model.

Separate destructive concepts visually and verbally:

- Unpublish = return public event to draft.
- Cancel = event will not take place and registrations/payments are reconciled.
- Archive = hide settled history from active operational lists.

## Attendee UX

Public pages must never offer an action the backend will reject under normal conditions. Full/open/closing-soon/scheduled states come from the canonical projection.

My Events becomes the persistent home for ticket, payment, join access, attendance, feedback and certificate state.

Private attendee details should be visibly marked as attendee-only and never copied into shareable public URLs.
## Mobile/accessibility baseline

- Primary touch targets should be comfortably tappable, including scanner controls.
- No critical state/action may be hover-only or color-only.
- Preserve visible keyboard focus.
- Validation errors must identify the failing field/action.
- Avoid horizontal overflow at 390px-class widths.
- Respect reduced-motion preferences.
- Authentication should avoid cognitive puzzles or unnecessary repeated data entry.

## Forms

Event creation remains short. The editor progressively reveals advanced registration/payment/private-access settings. Use plain labels that distinguish public links from attendee-only secrets.

Do not expose raw infrastructure/provider terminology unless an operator needs it. Payment provider selection belongs under advanced finance setup; ordinary organizers should think in terms of Free/Paid and readiness.

## Event-day UX

Scanning prioritizes speed and confidence: large camera target, instant result, persistent recent scans, duplicate context, session selector and manual fallback. Avoid modal-heavy operation while a queue is waiting.

## Post-event UX

After effective end, replace registration-centric emphasis with closeout progress. Certificates and optional feedback should appear as independent tasks; neither should imply that communications are enabled.
