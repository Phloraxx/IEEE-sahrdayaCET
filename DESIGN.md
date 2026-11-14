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
- the curated event-photo strip restores the June 2026 light gallery: a white canvas, -3 degree oversized moving photo strip, centered Explore Events action, and large black scrolling category names; retain a pause control and reduced-motion behavior.
- the homepage Execom uses the original drag-and-inertia, automatically moving portrait carousel, with public PocketBase data rather than the historical hardcoded member list.

Do not couple homepage card layout to uploaded event-poster aspect ratios.

## Events page

The Events page is a **yearbook**: a warm, photographic programme that reads as a story rather than an archive. Light `#F8F9FA` ground, soft rounded shapes, real photographs, handwriting for captions, and the branch's own posters as the subject.

- The page opens on a **ticket**: one ticket for the next event, lying on the page with a soft shadow and tilting with the pointer. The body carries the title, the date as a large numeral, the time and venue; the stub is separated by a perforation with two punched notches and holds `Admit one` set vertically plus a drawn barcode. `Grab a ticket` opens the external form in a new tab where the event uses one, otherwise the internal registration page.
- When nothing is upcoming — the normal case — the ticket becomes a next-season stub: blank date, `TBA`, and the action reads `Tell me when`. Never a sad empty state, and never a statistic.
- Do not put counts on this page. Upcoming is usually zero or one and the society count is fixed, so numbers are furniture, not information.
- Each year opens with a real photograph from that year's flagship, captioned with the event it actually came from — never a photo relabelled as a different event. Wide bands for landscape photos, a split for portrait ones.
- The archive is a masonry wall, not a uniform grid: two columns on mobile, three at `md`, four at `xl`. Poster frames are rounded and show the artwork in full on a dark mat; never crop a poster.
- **Events without a poster become field notes**, not holes: a warm paper card with a handwritten date in `Caveat`, the title in normal type for legibility, the society and entry underneath, and a slight tilt that straightens on hover. A scrapbook has posters and notes.
- Hovering one card recedes the rest of the wall to 42%, so the wall always has a single subject. A soft light follows the pointer across posters.
- A floating filter rail carries search, society and year chips plus a wall/list toggle, all in rounded pills. The chip highlight slides between chips, and the URL stays the source of truth (`q`, `society`, `year`, `view`, `limit`).
- The list view preserves the earlier editorial rows for scanning text. Wall is the default.
- Every card is a direct, crawlable link with its date and title visible underneath — nothing is hover-only. Content stays in the server-rendered baseline; no scroll-triggered reveal may hide the wall without JavaScript. Honour `prefers-reduced-motion`.
- The page closes on the campus photograph behind `the wall keeps growing`, with links into societies and contact. The one campus image the project has is used here, once.
- An event detail page is a **single ticket**: society, title, date numeral, time and venue in the body, then a perforated stub carrying `Admit one`, entry and status, and a drawn barcode. Real artwork appears as a small stamp in the corner; poster-less events simply omit it. Keep the page short — no related-events block. Restyling must never change registration behaviour: open, closed, full, waitlist, external form, payment review, confirmed and completed all keep their logic.
- `#event-archive` and `?society=` remain the anchors other pages link to.

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

Desktop navigation remains available during scroll. Homepage core-team cards use the directory's public projection and manual scroll controls; names and published contacts remain visible. The curated photo gallery is free of a visible pause button: pointer hover, keyboard focus or a touch on the gallery pauses it; reduced-motion users receive a static seven-photo set. Motion resumes where it paused rather than snapping backward. The hero identity, tagline and live strip form a single centered, responsive column, without absolute bottom positioning. The identity hero occupies at least the full dynamic viewport height on desktop and mobile. Keep the title, tagline, and live programme strip vertically grouped with natural flex spacing; the next section must not peek into the initial viewport at scroll position zero. The decorative mascot is positioned within and clipped by the hero rather than fixed to the browser viewport, so it never covers subsequent headings. Paused animations keep their duplicate strips mounted inside clipped containers so native scrollbars never appear. The Home hero intentionally contains only IEEE/Sahrdaya identity, the branch tagline, and the small live programme strip: no descriptive paragraph or CTA buttons. Events and communities remain reachable from shared navigation and programme content. The shorter desktop composition and real content are visible without a staged reveal. Shared focus outlines and anchor offsets apply across page families; error and empty states must distinguish service failure from a genuinely empty programme.

## Public discovery refinements (October 2026)

An empty programme uses a compact editorial row and a direct archive action. Blog search includes every published story; the featured promotion yields to active search/topic results. Blog and Execom search, group/topic and view preferences live in URL parameters and survive reload/Back. Public filters use at least 44px controls with readable mono labels; mobile Execom groups use full names in a native select. Member profiles use the shared Radix modal with background isolation and focus restoration. Empty data states describe unpublished content; filtered zero-results states offer a reset.


## Society discovery refinements (October 2026)

The community directory follows the shared URL-based discovery pattern: search and grid/list view survive reload and detail-page Back navigation. Search counts describe the current subset without repeating unbounded input. Network nodes show abbreviations, provide 44px targets, and disable destinations excluded by the active search. Full community names wrap in the list; descriptions join the row only when desktop width allows them. Directory content is visible in the server-rendered baseline. Generic society profiles use readable metadata and wrapping titles, with touch-sized activity links. Empty published data and zero search results have different recovery actions.

## Support and policy pages

- The mobile More sheet includes a labelled Help & branch group for Contact, certificate verification, event pricing and About. Keep these routes in its active state and preserve account focus handling.
- Contact offers direct self-service links before official branch contact details. Any account requirement is visible before navigation; contact links never send automatically.
- Long policy pages retain their official wording, use native section anchors and explicit ordered-list markers, and keep text within a readable column. Mobile contents use a compact visible link grid with stable height across fragment reloads; desktop contents remain alongside the text.
- Catalog cards expose full event names and direct policy links. Display polish must not alter fees, discounts or payment behavior.

## Verification and event detail usability

- Credential ID lookup reports pending, invalid, active, revoked, superseded and unavailable states beside the input. A failed registry read returns 503 and never becomes an invalid-certificate claim. Keep all verification data no-store/noindex and preserve the safe public projection.
- The GET lookup remains usable without JavaScript, moves keyboard focus to its result after submission, and restores the displayed ID on browser history navigation. Invalid QR references offer an ID lookup recovery link.
- Generic event details show date/time/full venue/entry status before artwork on phones and below the title/artwork row on desktop. Use semantic facts and wrap all venue text. Critical title/navigation/artwork/actions remain server-visible.

## Article reading and profile navigation

- Article contents remain available below 1280px through a native disclosure; desktop uses its sticky contents rail. All section links have 44px targets and work without JavaScript. Keep a single article h1 and stable section anchors.
- Article metadata uses readable 11px mono labels and sufficient contrast. Long titles, authors and inline URLs wrap; preformatted code retains its horizontal scroll area.
- Every article offers archive and back-to-top navigation, including when it has no related stories.
- Generic society profiles expose About/People/Activity shortcuts, semantic facts in two columns on phones, complete wrapping headings and touch-sized community links. Preserve all public record counts and the bespoke WIE surface.

Mobile native scrolling keeps focused controls clear of the fixed dock using bottom scroll padding/margins, including when JavaScript is disabled.

Article sidebars must stick to the page viewport. Use horizontal clipping that does not create a scroll container, place sticky positioning on the grid item itself and keep long desktop contents scrollable within the viewport.

## Infinia showcase and Altair archive

Infinia uses a playful three-film portrait hero: Lantern Fest, the RC car and flight, with curved seams, a flowing pastel rainbow wordmark, spectrum ribbon and rounded programme invitation. Tall desktop native scrolling opens the side panels and widens the RC car without stretching footage; phones and short desktops retain native flow. Small metadata labels have curved dark backing. Violet accents and softened photo corners connect the programme to the hero. The three portrait clips appear only in the hero. One subsequent robot-football scene uses different footage, clear 2024 attribution and reachable controls. A self-hosted Bricolage Grotesque display face gives the rainbow hub wordmark rounded lowercase lettering; edition titles retain their normal case. Body and shared navigation typography are unchanged. The 2025 leaf uses its own photograph. Workshops and programme days stay photo-led with native details, original full-size viewers and source-labelled statistics. The bottom newest-first four-edition Infinia/Altair timeline and actual shared Footer outside the scoped wrapper remain intact.

- Canonical chapters are /infinia/2025 and /infinia/2024, latest first. No year-mixed galleries. Historical numbers include edition/source labels; session attendance and pre-event registrations stay separate.
- INFINIA replaces FLAGSHIPS in shared desktop and mobile More navigation. Rainbow text uses contrast-safe palettes, pauses on hover/focus, stops under reduced motion and respects forced colours. Preserve the four dock destinations.
- Critical copy and chapter links render in SSR. Workshop disclosures use native details. Poster/photo viewers use accessible Radix dialogs with Escape, focus trapping and focus return. Preserve full image framing and visible captions.
- The hub and 2024 leaf use a three-film hero group and one separate silent robot-football scene. The active desktop hero may play three portrait clips together; mobile plays only its RC clip with two companion stills. Only the stage containing the viewport centre may autoplay; sources mount only after entering that stage, and off-screen/page-hidden/user-paused scenes suspend playback. Reduced motion, data saving and slow connections use source-free corresponding stills; rejected autoplay retains a usable play button, and resource failure restores the still. The hero flight panel loops only its clear opening three seconds. The full 2024 highlights player stays user-initiated with native controls and text descriptions. No 2024 footage is mounted on the 2025 leaf.
- Altair retains its independent blue/slate archive, 2023 brochure status and 2022/2023 galleries. No successor relationship, future date, award or unsupported outcome is inferred.
- Scoped CSS preserves all other page identities. The route-scoped Latin display font is preloaded from the same origin, uses swap fallback and includes its OFL licence. See docs/infinia-showcase-20261004.md for Drive provenance and docs/infinia-playful-20261005.md for the current reference boundary and interaction plan.