# Design Contract

The site intentionally has several related visual registers instead of one flat SaaS theme. New work should extend the register of the page it belongs to.

The implementation source of truth is `src/features/globals.css`, `src/features/shadcn-tailwind.css`, and the existing feature components.

## Shared IEEE brand

Core Tailwind theme tokens:

| Token | Value | Typical use |
| --- | --- | --- |
| `--color-ieee-blue` | `#00629B` | primary IEEE brand, links, primary public actions |
| `--color-ieee-light-blue` | `#0099D6` | secondary accent, live/energy details |
| `--color-ieee-slate` | `#1e293b` | dark ink/body text |
| `--color-ieee-slate-light` | `#334155` | secondary dark text |
| `--color-ieee-success` | `#16a34a` | success/won/positive state |
| `--color-ieee-warning` | `#d97706` | warning/pending/live state |
| `--color-ieee-danger` | `#dc2626` | error/lost/void state |

Use shadcn semantic variables (`background`, `foreground`, `card`, `muted`, `border`, `primary`, etc.) for admin/product surfaces that already use those tokens.

## Typography

Fonts bundled from `src/root.tsx` are:

- Geist Variable;
- Press Start 2P;
- Caveat.

Existing registers use them differently:

- normal public UI uses the global sans stack;
- `.vh-admin` explicitly uses Geist Variable;
- `.font-pixel` uses Press Start 2P for retro IEEE/homepage accents;
- handwritten event annotations use the Caveat-style handwritten treatment;
- numeric/admin instrumentation should prefer the existing mono utilities/tokens.

Do not introduce remote Google Font requests or a new display family for one isolated component without intentionally updating the global typography system.

## Public homepage

The homepage is expressive/brand-first rather than dashboard-like:

- large IEEE/Sahrdaya pixel hero;
- restrained star/shooting-star motion;
- bento-style `WHAT'S HAPPENING` section;
- current event information remains dynamic, but its homepage hero visual is intentionally the stable `/AGM.webp` image instead of arbitrary event-poster ratios;
- legacy event-photo marquees remain a separate decorative showcase.

Do not couple homepage card layout to uploaded event-poster aspect ratios.

## Events page

The Events page uses an OFFF Forum-inspired programme register while remaining recognisably IEEE Sahrdaya: a light `#F8F9FA` surface, precise rules, asymmetric calendar columns, pixel/mono labels, and real event artwork used as small supporting signals.

- The opening experience starts directly below the shared Navbar with a compact programme header; there is no standalone dark hero or preamble.
- The live programme header uses a three-column left rail for the index/count and a larger title/calendar area, then places the first useful event row immediately in the first viewport.
- Upcoming events are direct, crawlable links in an editorial schedule. Every row keeps date, society, entry state, time/TBC, venue, availability and an inline artwork/fallback thumbnail visible without hover.
- The first/next row may carry only a restrained IEEE-blue rule/dot; do not turn rows into dark selected cards.
- The layout adapts for zero, one or many upcoming events and never allocates a fixed poster rail or duplicated preview area.
- Upcoming and archived events read as one continuous programme canvas. Upcoming rows own the future schedule; the past programme is a searchable, society-filtered archive with chronological groups and direct leaf routes. Do not duplicate future events in a second status-filter system.
- Keep substantive schedule content visible in the server-rendered baseline. Motion is limited to brief hover/focus colour, thumbnail and arrow feedback plus the restrained next-event signal; honour `prefers-reduced-motion`.
- Real event banners remain appropriate on event detail surfaces; the index should not depend on their aspect ratio.

### SustainX event story

The completed `/events/sustainx` route is a bespoke editorial dossier inside the Events register, not a second blog or microsite data source. It keeps the shared Navbar/Footer and canonical event record while translating the event's poster identity into a more refined case-study layout.

- Use the SustainX off-white/lilac surface, black type, restrained violet/teal accents, curved-line geometry, and the split-colour `X`.
- Lead with verified event facts and real event artwork; do not invent impact numbers, testimonials, awards, or project outcomes.
- The story structure is documentary: context → three phases → challenge themes → winners → team index → judging framework → closing statement.
- Public participant material is limited to approved team/project information. Never surface registration-sheet contact details or other private submission metadata.
- The route must remain readable without motion, keep all critical information outside hover-only interactions, and avoid scroll hijacking or decorative WebGL.
- The event is complete, so the page closes into the event archive instead of presenting a registration CTA.

## WIE public society page

The dedicated `/societies/wie` route uses the **WIE Field Notes** register: an editorial, human-centred extension of the public IEEE design system.

- Keep the shared Navbar, Footer, IEEE blue parent-brand cues, and existing font system.
- Use approved WIE purple as a restrained sub-brand accent, never as a generic gradient theme.
- Lead with verified activities and real people rather than generic empowerment claims.
- Treat the current wide WIE banner as contained identity artwork; do not crop text-bearing brand artwork as a mobile cover image.
- Give one verified activity visual priority, then present the rest as accessible links to `/events/:slug`.
- Missing event media uses an intentional typographic fallback, not an empty grey placeholder.
- Committee names remain complete on mobile; public contact actions degrade gracefully when optional fields are empty.
- Do not introduce Infinia, proposal/funding copy, hover-only details, stock or AI-generated people, a separate WIE navigation system, or a second event data source.

## Admin register

Admin pages are scoped under `.vh-admin` and use the submissionPortalV2-inspired instrument-panel language:

- Geist Variable;
- tight information density;
- warm paper/amber light mode;
- chrome-warm dark mode;
- semantic shadcn variables;
- compact radii;
- tabular/mono numerics for operational data;
- cards lift only when interactive.

Prefer existing admin utilities such as `.vh-touch`, `.vh-press`, `.vh-mono`, `.vh-divider`, stagger helpers, and the shared shadcn/Radix primitives that remain in the repository.

## Layout

- Mobile-first.
- Avoid hover-only information on user-critical flows.
- Keep touch targets at least 44px where practical.
- On mobile, the shared public shell uses a fixed bottom navigation dock with four frequent destinations (Home, Events, Societies, Blog) and a `More` action for secondary navigation and account actions. Use icons with visible labels; do not rely on icon-only navigation.
- The mobile `More` action opens the shared navigation dialog as a contained bottom sheet. Keep its active-page state, account separation, focus handling, Escape/outside dismissal, scroll lock, and reduced-motion behavior intact.
- Use existing page max-widths rather than forcing one width across the whole site.
- Preserve meaningful whitespace; avoid nested cards for every grouping.
- Uploaded media should use an explicit aspect ratio and `object-cover`/`object-contain` based on the content, not accidental intrinsic dimensions.

## Motion

Framer Motion is available and global CSS defines several motion utilities.

Motion should communicate hierarchy/state, not exist everywhere:

- entrance/reveal motion should be brief;
- continuous marquee/live indicators must have reduced-motion behaviour;
- no scroll hijacking;
- no custom cursor requirement;
- no heavy WebGL dependency for decorative sections.

Global `prefers-reduced-motion` handling sharply reduces animation/transition duration. Feature code should not deliberately defeat it.

## Accessibility

- WCAG AA contrast is the target.
- Do not use color alone to communicate state.
- Keyboard focus must remain visible.
- Modal/dialog flows must keep focus handling and Escape behaviour.
- Decorative oversized type/doodles should be hidden from assistive technology when they duplicate visible copy.
- Images need useful alt text when informative and empty/decorative treatment when they add no content.

## Icons

Use `lucide-react` for interface icons. Do not mix in arbitrary icon packs for isolated features.

Emoji are acceptable only where the existing playful public/event language calls for them; they should not replace semantic UI icons in admin or transactional flows.

## Design-change rule

Before adding a new visual system, identify whether the work belongs to the public IEEE, Events editorial, or Admin register. Extend that register first.

When a design change introduces a reusable token, font, motion rule, or layout convention, update this document and the global CSS deliberately rather than leaving the convention trapped in one component.

## Public audit interaction update (October 2026)

Desktop navigation remains available during scroll. Homepage core-team cards use the directory's public projection and manual scroll controls; names and published contacts remain visible. The curated photo archive has a persistent pause control and a single accessible canonical set. Hero actions and real content are visible without a staged reveal, with a shorter desktop composition. Shared focus outlines and anchor offsets apply across page families; error and empty states must distinguish service failure from a genuinely empty programme.

## Public discovery refinements (October 2026)

An empty programme uses a compact editorial row and a direct archive action. Blog search includes every published story; the featured promotion yields to active search/topic results. Blog and Execom search, group/topic and view preferences live in URL parameters and survive reload/Back. Public filters use at least 44px controls with readable mono labels; mobile Execom groups use full names in a native select. Member profiles use the shared Radix modal with background isolation and focus restoration. Empty data states describe unpublished content; filtered zero-results states offer a reset.


## Society discovery refinements (October 2026)

The community directory follows the shared URL-based discovery pattern: search and grid/list view survive reload and detail-page Back navigation. Search counts describe the current subset without repeating unbounded input. Network nodes show abbreviations, provide 44px targets, and disable destinations excluded by the active search. Full community names wrap in the list; descriptions join the row only when desktop width allows them. Directory content is visible in the server-rendered baseline. Generic society profiles use readable metadata and wrapping titles, with touch-sized activity links. Empty published data and zero search results have different recovery actions.

## Support and policy pages

- The mobile More sheet includes a labelled Help & branch group for Contact, certificate verification, event pricing and About. Keep these routes in its active state and preserve account focus handling.
- Contact offers direct self-service links before official branch contact details. Any account requirement is visible before navigation; contact links never send automatically.
- Long policy pages retain their official wording, use native section anchors and explicit ordered-list markers, and keep text within a readable column. Mobile contents use a native disclosure; desktop contents remain alongside the text.
- Catalog cards expose full event names and direct policy links. Display polish must not alter fees, discounts or payment behavior.
