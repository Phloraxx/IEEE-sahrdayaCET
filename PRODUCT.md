# Product

## Product purpose

The IEEE Sahrdaya platform is the Student Branch's public website and event-operations system. It combines public content, event discovery and registration, attendee self-service, certificates, and a scoped staff workspace in one React Router + PocketBase application.

## Primary users

- students discovering IEEE activities, societies, blogs, and events;
- registered attendees managing their event participation and certificates;
- society/content teams publishing branch information;
- event operators handling registrations, payments, check-in, attendance, and certificates;
- platform administrators managing access, users, data health, and production operations.

## Product principles

1. **Public first.** Core information should be clear, fast, mobile-friendly, and useful without signing in.
2. **One event lifecycle.** Discovery, registration, payment state, ticketing, check-in, attendance, cancellation, and certificates should form one coherent flow.
3. **Server truth wins.** Capacity, payment, ticket, attendance, certificate, and permission invariants are enforced at the PocketBase boundary.
4. **Scoped administration.** Staff see only the capabilities and society/event data their assignment grants.
5. **Auditable operations.** Financial-style and credential-changing commands preserve evidence and avoid partial writes.
6. **Accessible by default.** Important actions work on mobile, keyboard, reduced-motion settings, and without hover-only interaction.

## Public surfaces

The main public product includes the home page, events, flagship stories, societies, society detail pages, blog, Execom, legal/compliance pages, public certificate verification, and attendee-facing event state.

Infinia has a dedicated flagship showcase at /infinia, with separate 2025 and 2024 stories, source-backed figures, workshops, posters, photographs and a 2024 highlights film. Altair remains an independent archive. These showcase surfaces do not duplicate registrations or event operations.

## Authenticated surfaces

Authenticated attendees use My Events and related ticket/certificate flows. Authorized IEEE operators use the Workspace for event operations, registrations, payments, check-in, content, societies, users/access, certificates, and data-health tooling.

## Architecture relationship

The public site and operations product share one identity model, PocketBase data plane, deployment pipeline, and design system. High-risk multi-record changes use dedicated transactional commands rather than generic client-side CRUD.

See `AGENTS.md`, `DESIGN.md`, `docs/architecture.md`, and `docs/security-architecture.md` for implementation contracts.

## Distinct Infinia chapters (4 October 2026)

Infinia 2.0 (2025) and TechX Infinia (2024) have stable SSR URLs at /infinia/2025 and /infinia/2024. The showcase hub opens with an RC-car film and three separate, pausable 2024 video scenes: robot football, a short flight demonstration and Lantern Fest and ends with a latest-first flagship timeline with all four archived Infinia/Altair editions; each links to its independent story. Legacy /flagships and Infinia paths redirect permanently; valid Altair parent/edition URLs are reachable directly from the timeline and compact archive link. Unknown editions return 404. The shared site footer closes every Infinia page. Six original workshop photographs and a full-frame evening photograph lead the 2025 story, with the programme organised into its three actual days.

The completed 2025 report supports 400+ participants, 70 volunteers, 15 professional speakers and 10+ industry collaborations. Workshop attendance is per session. Vitals 24 registration figures belong to the separate 2025 pre-event. Conflicting 2024 attendance claims remain unpublished. Original posters and full-frame photographs have keyboard-accessible viewers; the 2024 film is silent, user-initiated and described in text.

Altair 2.0 remains a brochure-derived programme archive. No inferred date, attendance, award or successor relationship is added. Existing event, registration, payment, notification and mail data/delivery flows are untouched. Source and visual decisions are documented in docs/infinia-showcase-20261004.md.

The current festival canvas replaces the rejected graphite/lime split layout with a blue-and-white oversized identity, a central oval film, a wide expo composition and unboxed workshop/programme rows. Scroll-linked desktop scenes preserve native navigation; short desktops, phones, reduced-motion and data-saving visitors get naturally stacked sections and static media fallbacks. Only the active scene plays. The 2025 programme and media remain distinctly labelled. See docs/infinia-blue-canvas-20261004.md.