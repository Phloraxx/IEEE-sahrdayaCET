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

Flagship Events provides a permanent story hub for Infinia and Altair, with separate edition histories and contextual media. This editorial archive links to the existing event programme and published recaps; it does not duplicate registrations or event operations.

## Authenticated surfaces

Authenticated attendees use My Events and related ticket/certificate flows. Authorized IEEE operators use the Workspace for event operations, registrations, payments, check-in, content, societies, users/access, certificates, and data-health tooling.

## Architecture relationship

The public site and operations product share one identity model, PocketBase data plane, deployment pipeline, and design system. High-risk multi-record changes use dedicated transactional commands rather than generic client-side CRUD.

See `AGENTS.md`, `DESIGN.md`, `docs/architecture.md`, and `docs/security-architecture.md` for implementation contracts.

## Separate flagship editions (3 October 2026)

The public flagship hub now presents Altair (2022), Altair 2.0 (2023), TechX Infinia (2024), and Infinia 2.0 (2025) as distinct chapters in a latest-first timeline (2025 → 2024 → 2023 → 2022). Stable edition URLs use `/flagships/:slug/:year`; parent programme histories remain at `/flagships/infinia` and `/flagships/altair`. Edition content is shared from the existing typed, source-backed editorial archive. Unknown programme/year combinations return 404. Production sitemap includes all edition leaves; staging stays noindex.

Altair 2.0 is a brochure-derived programme archive. No inferred completion date, attendance or award was added. Photography is confined to the year it documents. Existing event, registration, payment and notification data and delivery flows are untouched.
