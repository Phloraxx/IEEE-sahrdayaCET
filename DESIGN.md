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

The Events page uses a playful editorial language on a light `#F8F9FA` surface:

- very large type;
- IEEE blue as the main accent;
- rounded white event cards;
- handwritten annotations/doodles;
- strong whitespace and asymmetrical poster-like compositions;
- real event banners remain appropriate on event cards/detail surfaces.

The Infinia teaser sits between Upcoming Events and the event archive. It is intentionally a teaser, not a conventional registration card: oversized background type, chef cutout, handwritten leak-style copy, recipe metadata, and the flagship lineage strip.

Do not turn that section into a generic blue CTA block unless the product intent changes from tease to launch.

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
