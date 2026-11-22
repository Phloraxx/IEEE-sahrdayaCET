# Public audit improvements — staging

Scope: public navigation, discovery, lifecycle language, keyboard access and failure recovery. Payments, notification delivery, and production data are excluded. Staging must retain MAIL_DELIVERY_MODE=disabled. Acceptance must not submit registration, resend, delivery, or SMTP-test commands.

## Changes

- Replace unsourced footer figures with useful branch and attendee navigation; label the IEEE LINK logo correctly.
- Keep desktop navigation stable while scrolling; use active-page semantics and route EXECOM to the full directory. Retain the existing mobile bottom dock.
- Use Radix for sign-in and account menus, including keyboard focus, Escape, background isolation, and restoration. Display a recoverable OAuth failure.
- Keep pixel branding and curated photos. Add visible hero actions, shorten desktop hero spacing, remove build-version chrome, and compact the no-upcoming state.
- Read the homepage core committee from the same public projection as the full directory. Render a canonical manually scrollable list with optional published social links and branch contact fallback.
- Add archive pause/resume, reduced-motion/manual access, decorative clone treatment, time-based movement, hidden/offscreen suspension, and failed-image fallback.
- Classify past published events as history in pricing and detail. Use the same end-date lifecycle for community activity. Define community metrics precisely.
- Preserve event archive search, society, and progressive reveal in the URL; preserve the society context from its profile.
- Distinguish public read failures (503) from missing records (404) and actual empty lists. Use safe public error copy and retry/support actions. Homepage partial failures are labelled and suppress unsupported counters.
- Associate registration validation messages with core fields and focus an error summary. Provide receipt failure feedback and a retry/manual-ID fallback for QR generation.
- Establish shared public focus indicators and anchor offsets while keeping each page's art direction.

## Acceptance

Run lint, typecheck, unit tests and production build. Run the full repository CI gate on the change PR, including disposable clean-room integration checks, before merging into dev. Then verify the deployed exact revision on staging using read-only desktop/mobile checks at 320, 390, 768 and 1440 pixels. Check keyboard dialogs, navigation, search reload/Back, canonical roster, pause/reduced motion, pricing history, empty states, public 404/503, and no horizontal overflow. Check staging mail remains disabled. Do not deploy main.

## Remaining work requiring separate evidence or editorial decisions

Historical schedule corrections, approved About/policy factual copy, committee term governance, real-user performance measurement, restoration rehearsal, and physical scanner/event-operation acceptance. Payment exceptions and historical notification failures remain intentionally accepted by the owner.
