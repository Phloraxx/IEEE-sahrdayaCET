# IEEE Sahrdaya — Site Redesign Roadmap

Status: planning only — no redesign implementation is authorized by this document.

Branch baseline: `dev`
Production branch: `main` — do not modify or promote without explicit approval.

## Why this document exists

The recent Societies and Blog redesigns established a clearer public-site identity. This roadmap turns the full staging audit into a deliberate sequence instead of redesigning pages independently.

The target is not visual uniformity. IEEE Sahrdaya should keep related visual registers, but the pages must feel like parts of one product with consistent information architecture, data truth, typography, motion discipline, navigation, responsive quality, and footer behaviour.

## Confirmed constraints

- There are **13 public societies**. All public counts and statistics must resolve to 13.
- `EventsShowcase.tsx` remains a **curated, hardcoded showcase**. Its handpicked event/poster assets are intentional and must not be replaced with an automatic event feed.
- The Home pixel hero, star field, IEEE/Sahrdaya corner marks, and overall first-view identity are assets to preserve, not redesign targets.
- Events index, Societies index, the new Blog system, and WIE are the strongest current references and should not be casually reworked.
- No WebGL-for-decoration, scroll hijacking, custom-cursor dependency, or animation that defeats reduced-motion preferences.
- Mobile is a first-class layout, not a compressed desktop composition.
- Existing event/payment/coupon/registration behaviour must not regress.

## Current hierarchy after the audit

### Preserve as baselines

1. **Societies index** — anti-hero entrance, searchable directory, restrained technical metadata, Live Signal section.
2. **Blog** — Home-aligned star/noise environment, pixel metadata, IEEE blue/slate palette, lead story + signals + Grid/Index archive.
3. **Events index** — dark programme opening, cream programme body, live/upcoming hierarchy, archive index.
4. **WIE** — bespoke sub-brand page with strong activity, people, archive, and CTA hierarchy.
5. **Shared Navbar/Footer** — visually strong enough to preserve while improving consistency of use.

### Highest-priority gaps

1. **Home below the hero** — strongest opportunity; current sections do not form one narrative and mix real data with hardcoded pseudo-live content.
2. **Data truth / shared counts / dates** — 13 societies, timezone-safe event dates, proper TBC handling.
3. **Event detail pages** — functional but visually underpowered relative to the Events index.
4. **Generic society detail pages** — older design generation; WIE demonstrates a much stronger standard.
5. **Full Execom** — useful filters and portraits but visually generic and disconnected from Home.
6. **Cross-page polish** — motion, detail-page navigation, empty media states, metadata language, and mobile consistency.

## Site-level design principle

The main public register should feel like a modern IEEE student-branch operating system rather than a generic corporate site or a literal fake terminal.

Use: white space, IEEE blue, slate/black, pixel type for small identity moments, normal Geist/sans for reading, mono for instrumentation, thin rules, asymmetry, real imagery, and selective modular UI.

Avoid: nested SaaS cards everywhere, decorative dashboards with fake live data, arbitrary gradients, generic stock visual language, and page-specific gimmicks that do not recur elsewhere.

## Phase 0 — Data and architecture corrections before visual work

These should be completed first because visual polish must not preserve incorrect content behaviour.

### Society count

- Public baseline is **13 societies**.
- `fetchHomeData()` must use the same visibility rule as the Societies directory: hidden societies must not be included in public counts or strips.
- Remove the hardcoded Home Execom statistic `Societies 14`; derive the value from public society data or a shared server-side statistic.
- Add a regression asserting Home and Societies resolve the same public society count.

### Event dates and timezone

- The public app timezone is `Asia/Kolkata`.
- Replace raw `new Date(...).getDate()` / browser-local date extraction in Events programme components with the shared date helpers.
- Month grouping, day chips, programme previews, event-detail dates, and Home event metadata must all represent the same IST calendar day.
- Add a regression using an event near the UTC/IST day boundary, because that is the exact class of bug currently visible.

### Time-to-be-confirmed state

- Midnight must not silently mean a confirmed `12:00 am` event.
- Define one explicit source-of-truth representation for `timeTbc` / date-only events.
- Event cards, detail pages, registration screens, email/receipt surfaces, and Home summaries must share the same presentation rule.
- Do not infer TBC from prose; it should be structured data.

### Home live-data rule

- Anything labelled `LIVE`, `LATEST`, `NEXT`, `UPCOMING`, or similar must originate from current server data.
- Curated/historical content is allowed, but it must be labelled as curated or retrospective rather than live.

## Phase 1 — Home: preserve the hero, rebuild the journey below it

### Home hero: preserve with only precision polish

Keep:
- full-height star field and restrained shooting stars;
- `IEEE / SAHRDAYA` pixel identity;
- `INNOVATE · CONNECT · INSPIRE`;
- crisp IEEE and Sahrdaya top-corner marks;
- floating main Navbar;
- small playful astronaut/character if it remains unobtrusive.

Possible polish only:
- improve the handoff at the bottom of the first viewport;
- replace low-value build/copyright instrumentation with useful branch metadata only if it remains visually subtle;
- examples: `NEXT / 29 AUG`, `13 COMMUNITIES`, `04 UPCOMING`;
- never turn this into another text-heavy hero or hero carousel.

### Home narrative after the hero

The page should read in this order:

1. `01 / NOW AT SAHRDAYA` — current activity.
2. `02 / THE PEOPLE` — human layer / Execom.
3. `03 / FROM THE BRANCH` — curated visual history via the handpicked Event Showcase.
4. `04 / LATEST SIGNALS` — newest Blog stories.
5. Footer.

The goal is a clear progression: **identity → now → people → culture/history → stories**.

### 01 / NOW AT SAHRDAYA

Replace the current dashboard/bento feel with a stronger editorial live module.

Recommended composition:
- one dominant next-event panel using the actual event title, date/status, society, and direct event link;
- use the event banner when appropriate, with a deliberate fallback for missing/awkward artwork;
- one narrow activity rail beside it for real upcoming events / latest branch signals;
- a compact statistics line below rather than multiple separate dashboard cards;
- society count = 13 from public data;
- no hardcoded fake `LATEST NEWS` items;
- no hardcoded Computer Society spotlight presented as a live/current choice;
- `Register / View event` should link to the actual event, not just `/events`.

The section can visually borrow from the new Blog lead-story + `LATEST SIGNALS` structure because that pattern now clearly belongs to the same site.

### 02 / THE PEOPLE

Keep the current Home Execom section concept but refine it instead of replacing it.

- Preserve the strong `Meet the people behind the vision.` hierarchy.
- Keep real portraits as the visual focus.
- Reduce unused vertical space and tighten the transition into/out of the carousel.
- Make all statistics data-backed; remove `80`, `100+`, or `14` if they cannot be reliably sourced.
- If useful data exists, prefer meaningful facts such as current roster size, public societies, or current-year event activity.
- Keep the `View full Execom` action.
- The preview should feel like a teaser for a richer roster page, not a duplicate of it.

### 03 / FROM THE BRANCH — curated Event Showcase

This section is intentionally **not data-driven**.

- Preserve the handpicked `public/Events/*` assets and the curated ordering in `EventsShowcase.tsx`.
- The purpose is visual memory / culture, not programme accuracy.
- Keep the moving poster strip because it adds motion and personality that the more informational sections deliberately avoid.
- Label the section clearly as retrospective/curated, for example `FROM THE BRANCH`, `SELECTED MOMENTS`, or `RECENTLY AT SAHRDAYA`.
- Do not label these handpicked posters as upcoming/current/live.
- Keep an explicit action to `/events` for the live programme.
- Retain the large event-format marquee (`CONFERENCES · LECTURES · ...`) but reduce it if it dominates the page transition on smaller screens.
- Add proper reduced-motion handling: a static/scrollable strip when animation is reduced.
- Preserve image ordering unless manually curated later.

### 04 / LATEST SIGNALS — Blog teaser

Home should use the new Blog identity rather than generic cards.

- Fetch the newest published Blog entries server-side.
- Show one primary latest story plus 2 secondary signals on desktop, or a compact 3-story stack on mobile.
- Use the same content-type labels as Blog (`EVENT LOG`, `TECH NOTE`, `PEOPLE`, `EXPLAINER`, etc.).
- Reuse Blog's white/blue/slate/pixel metadata language, but keep the Home version lighter than the full archive.
- Avoid duplicating Blog's whole Grid/Index interface on Home.
- `View all stories` remains the only archive-level CTA.

### Home acceptance criteria

- The hero remains recognisably the existing hero.
- No fake live content remains.
- The first dynamic event links to its own detail route.
- Public society count reads 13 everywhere.
- Curated Event Showcase remains handpicked and visually distinct from live event data.
- Home desktop and mobile both establish the same five-part narrative without excessive empty height.

## Phase 2 — Events: preserve the index, upgrade correctness and details

### Events index

The current `/events` page is a preserve-first surface.

Keep:
- dark opening programme block;
- cream/light programme body;
- `Upcoming programme` hierarchy;
- `Past, present, next.` archive language;
- search/filter controls;
- strong desktop/mobile information density;
- current footer transition.

Change only where necessary:
- timezone-safe day/month rendering;
- structured TBC time handling;
- clearer state labels for `OPEN`, `CLOSED`, `FREE`, `PAID`, `TBC`;
- verify no event uses browser-local date methods directly;
- ensure upcoming/past grouping uses the same lifecycle logic as detail/registration surfaces.

### Event detail template

The current detail page is too sparse relative to the Events index. Build one shared editorial detail system without turning every event into a custom microsite.

Recommended structure:
- compact back/programme rail;
- `EVENT / YEAR` + society/content-type metadata;
- strong title block;
- actual event artwork/banner when available;
- structured logistics rail: date, time/TBC, venue, entry, availability;
- concise About section;
- registration panel with one unambiguous primary state/action;
- society link and related event context;
- 2–3 related/upcoming events at the bottom when data exists.

### Event detail visual language

Use the Events index as the parent register:
- cream/light reading surface;
- black/slate typography;
- IEEE blue for interaction and metadata;
- sparse technical labels;
- large type where hierarchy requires it;
- real media rather than decorative stock imagery;
- minimal card nesting.

Do not import the Blog star field into event detail pages. The goal is family resemblance through typography, controls, footer, metadata, and interaction quality—not identical backgrounds.

### Event detail functional acceptance

- Date on index, detail, registration, ticket, and email resolves to the same IST calendar date.
- TBC time never renders as `12:00 am` unless midnight is genuinely intended.
- Closed events cannot imply that registration is open.
- Free/paid state is unambiguous.
- Missing banner produces a designed fallback, not a broken/empty grey box.
- Registration flows remain unchanged unless explicitly required by the state-model fix.

## Phase 3 — Society detail system

The `/societies` index remains the source of truth for directory identity. Generic society detail pages need to catch up to it.

### Shared society-detail structure

1. Compact identity entrance: acronym/index, full society name, accent, logo, short mission.
2. `ABOUT` — concise body copy with controlled line length.
3. Leadership — faculty adviser + office bearers with useful contact/social actions where available.
4. `ACTIVITY SIGNAL` — upcoming events first, then recent/past activity.
5. Related Blog stories when society-linked content exists.
6. Join/contact CTA using the society's real WhatsApp/contact data when available.
7. Footer.

### Society visual rules

- Use the parent site's white/slate/blue framework, then allow each society accent to appear in small identity moments.
- Society accent colour should not repaint the whole site chrome.
- Logos should be crisp brand anchors, not decorative watermarks.
- Avoid the old pattern of large faded banner + centered About + generic white cards.
- Give real people and activity more visual priority than mission-statement prose.
- Reuse the directory's indexing language where useful (`10 / 13`, `IEEE / RAS`, etc.).
- Mobile should not rely on hover, horizontal carousels, or clipped long names.

### WIE exception

`/societies/wie` stays bespoke.

- Do not collapse WIE into the generic template.
- Preserve its verified activity-first hierarchy, WIE purple sub-brand, real people, archive, and CTA structure.
- Shared fixes may be applied to Navbar/Footer/accessibility/data helpers, but the page's art direction remains intentionally distinct.

### Society detail acceptance

- Every public society detail uses the same information architecture unless it has an approved bespoke route like WIE.
- Society logo/name/accent are immediately identifiable.
- Office-bearer names and roles are readable without hover.
- Events link to the canonical event detail route.
- Empty social/contact fields do not create dead controls.
- Long society names remain stable at 390/768/1024/1440 widths.

## Phase 4 — Full Execom: from photo grid to useful roster

The current `/full-execom` data/filtering is useful; the presentation should evolve without losing that utility.

Recommended direction:
- keep category filters;
- add `GRID / ROSTER` view switch;
- Grid = portrait-led browsing with role/society metadata;
- Roster = compact name / role / society / contact index;
- selected category should visibly reshape the page rather than merely hide cards;
- use Home's pixel/technical metadata sparingly, with normal readable type for names;
- add clear current-year context and total visible-member count;
- keep portraits uncropped where possible and preserve role hierarchy.

The page should feel like the complete version of Home's `THE PEOPLE` section, not a separate directory product.

## Phase 5 — Cross-page system polish

After the major surfaces align, standardize:
- top spacing beneath Navbar on every public detail route;
- corner-logo rules where appropriate;
- focus states and keyboard navigation;
- loading / empty / missing-media states;
- metadata labels and content-type vocabulary;
- button/arrow treatments;
- footer entrance spacing and separation;
- reduced-motion behaviour for marquees, stars, carousels, and view transitions;
- image loading, explicit aspect ratios, and useful alt text;
- URL/canonical/meta consistency.

Potential shared transition later: a short, restrained pixel/scan reveal between major public routes. This is optional and should only be attempted after all page structures are stable.

Do not add a transition if it delays navigation, harms reduced-motion users, or becomes more noticeable than the content.

## Implementation order and checkpoints

### Pass A — correctness foundation

1. Public society count = 13 everywhere.
2. Home public-society query uses `isHidden=false`.
3. Event date rendering uses shared IST helpers everywhere.
4. Introduce explicit TBC time state.
5. Add regression coverage before visual restructuring.

Implementation status: **complete and verified on staging.** Public society count is 13, IST-safe event dates are live, structured `timeTbc` is deployed through public/registration/payment paths, and the curated `EventsShowcase.tsx` asset list remains intentionally untouched.

Checkpoint: deploy to staging and verify no visual redesign yet; only data correctness should change.

### Pass B — Home restructuring

1. Extend Home loader with the data required for real activity signals and latest Blog stories.
2. Rebuild `WHAT'S HAPPENING` into `NOW AT SAHRDAYA`.
3. Refine Home Execom spacing/stats.
4. Keep curated `EventsShowcase` assets unchanged; improve section framing/reduced motion only.
5. Replace the current generic Blog teaser with the new Blog-aligned `LATEST SIGNALS` treatment.
6. Test the full Home narrative before any other page redesign.

Implementation status: **complete and verified on staging.** Home now follows identity → `NOW AT SAHRDAYA` → `THE PEOPLE` → curated `FROM THE BRANCH` → `LATEST SIGNALS`, with real programme/blog/count data and permanent Home regressions.

Checkpoint: user visual approval on staging before proceeding.

### Pass C — Events detail

Implement shared event-detail composition, TBC state, media fallback, related events, and direct registration-state presentation.

Implementation status: **complete and verified on staging.** The detail page opens in the Events index dark programme language, always renders uploaded artwork or a society-aware generated fallback, keeps registration/ticket/payment state intact, removes duplicate logistics, and adds a future-first related-programme handoff. Free/TBC/no-banner, paid/open, completed/artwork and WIE states have been verified on the deployed build.

Checkpoint: passed across the representative state matrix and deployed browser regressions.

### Pass D — Society details

Implementation: generic society routes now use a shared profile system built around identity, mission, people, public activity, optional society-linked Blog stories, and previous/next directory navigation. WIE remains on its bespoke route. Public society payloads also reject hidden societies and exclude draft/deleted events rather than hiding them only after hydration.

Implementation status: **complete and verified on staging.** Verification covers all 12 generic public societies, RAS at 390/768/1024/1280/1440/1920, long-name EMBS/NPSS cases, event-empty NPSS, high-volume Computer Society activity, WIE route separation, hidden Photonics returning 404, and deployed RAS/NPSS/EMBS smoke checks.

### Pass E — Full Execom

Implementation status: **in local release gate.** The page now uses the Home/Blog technical visual language, opens as a searchable `ROSTER` across all public Execom records, keeps `GRID` as the visual browse mode, adds `ALL` plus every live PocketBase group filter with counts, and uses a technical member detail drawer instead of the old rounded modal. The current real dataset is 91 people / 21 groups / 13 society groups / 2026.

Checkpoint: full unit/build suite, clean-room-safe Execom Playwright, all six breakpoints, keyboard/filter/search behaviour, complete role/name visibility, then deployed staging inspection.

### Pass F — shared polish

Apply only after the major pages are approved:
- shared page spacing;
- motion consistency;
- detail-page metadata vocabulary;
- footer entrances;
- optional shared transition;
- final accessibility/performance pass.

## Testing matrix for every major pass

Viewport checks:
- 390 × 844;
- 768 × representative tablet height;
- 1024;
- 1280;
- 1440 × 900;
- 1920.

Automated gates:
- typecheck;
- lint with zero warnings;
- all unit tests;
- production build;
- permanent page-specific Playwright regressions;
- clean-room CI browser suite;
- deployed staging Playwright checks.

Visual/deployment gates:
- no horizontal overflow;
- no broken public images;
- keyboard-accessible primary controls;
- `prefers-reduced-motion` check;
- Home and affected detail routes inspected after actual staging deployment;
- `main` remains unchanged until explicit production approval.

## Likely implementation touchpoints

This is a planning map, not a requirement to edit every file listed.

Home:
- `src/routes/index.tsx`
- `src/server/public/home.server.ts`
- `src/components/WhatsHappening.tsx`
- `src/components/Execom.tsx`
- `src/components/EventsShowcase.tsx`
- `src/components/blog/ContextualBlogLinks.tsx`
- `src/components/SocietyStrip.tsx`

Events:
- `src/features/events/EventsPageClient.tsx`
- event list/card/preview components under `src/components/events/`
- `src/routes/events.$slug.tsx`
- event server/public helpers and `src/lib/dates.ts`

Societies:
- `src/routes/societies_.$slug.tsx`
- society detail server helper(s)
- shared society-detail components to be extracted rather than further growing one route file
- `/societies/wie` should consume shared fixes only where appropriate

Execom:
- `src/routes/full-execom.tsx`
- shared Execom data/components currently used on Home.

Tests:
- unit tests for public counts/date presentation/lifecycle rules;
- dedicated Home, Event Detail, Society Detail, and Execom E2E regressions.

## Risks to actively avoid

### Visual homogenization

Do not make every page use the Blog star field or the Events cream surface. Cohesion should come from shared brand, type, metadata discipline, navigation, controls, and quality—not identical backgrounds.

### Replacing curated content accidentally

`EventsShowcase.tsx` is a curated visual archive. Automated cleanup must not "fix" its hardcoded asset list into a live feed. Add a source comment/test if necessary so future refactors understand this intent.

### Fake statistics

Do not retain numeric claims purely because they look good in a layout. Every public count should either be data-backed or explicitly stable institutional information with a documented source.

### Data-model work hidden inside a redesign

The TBC-time change affects multiple user-facing flows. Treat it as a small product/data migration with its own tests rather than a CSS-only event-page change.

### Detail-page overdesign

Event and society detail pages are information surfaces. They need stronger identity, not cinematic hero experiments. Reading and action clarity take priority over spectacle.

### Mobile afterthoughts

Avoid desktop-only preview interactions as critical functionality. Grid/Index, filters, event states, society contacts, and roster information must remain complete on touch/mobile.

## Decision ledger

Confirmed:
- [x] 13 public societies.
- [x] Curated hardcoded Event Showcase stays curated/hardcoded.
- [x] Home hero stays.
- [x] Blog current redesign is a baseline, not a redesign target.
- [x] Societies index current anti-hero/directory is a baseline.
- [x] Events index is preserve-first.
- [x] WIE remains bespoke.
- [x] Production `main` requires explicit approval.

Still to decide during implementation:
- [ ] Exact label for the curated Event Showcase section.
- [ ] Which Home statistics are reliable enough to display.
- [ ] Final structured field/schema for event time TBC.
- [ ] Whether generic society pages share one banner/hero media rule or default to identity-only entrances.
- [ ] Whether the optional global pixel/scan page transition adds enough value to keep.

## Definition of done for the site-wide pass

The redesign is complete only when:
- Home tells a coherent story without fake live data;
- public society count is 13 everywhere;
- event dates/times are timezone-safe and TBC-safe;
- Event Showcase is still intentionally curated and handpicked;
- Events index remains recognisably the approved design;
- event detail pages feel like part of the Events system;
- generic society detail pages feel like part of the new Societies system;
- WIE remains recognisably WIE;
- Full Execom feels like the complete roster behind the Home teaser;
- Blog retains its approved site-aligned identity;
- no public route regresses payment, registration, coupon, check-in, accessibility, or mobile behaviour;
- all major public pages share a high-quality responsive and interaction standard.

## Working rule for the next session/pass

Do **not** begin with another visual experiment.

Start with **Pass A — correctness foundation**, deploy that alone to staging, verify it, then move to **Pass B — Home**. Home should receive one complete end-to-end pass and user review before Event Detail, Society Detail, or Full Execom redesign begins.

After a visual direction is approved and stable, update `DESIGN.md` so the implemented behaviour becomes the formal design source of truth. Until then, this roadmap records intent and sequencing.

Last updated: 2026-08-28

## Execution status — 28 August 2026

### Pass A — correctness foundation

Status: **complete and verified on staging**.

- Public society baseline is 13.
- Home and Societies use `isHidden=false` consistently.
- Event calendar presentation is Asia/Kolkata-safe.
- Structured `timeTbc` is live through public, registration and payment flows.
- Curated `EventsShowcase.tsx` remains deliberately handpicked/hardcoded.
- Verified staging checkpoint commit: `21aeb2eb508e99362e0bce8340a0597f31764e12`.

### Pass B — Home restructuring

Status: **implemented and entering staging review**.

- Existing identity hero is preserved; only a restrained live metadata rail was added near its lower edge.
- Home narrative is now `NOW AT SAHRDAYA → THE PEOPLE → FROM THE BRANCH → LATEST SIGNALS`.
- Live event content is data-backed and links directly to event detail routes.
- Home people statistics use real public counts rather than decorative estimates.
- The curated poster archive is visually separated from the live programme and supports reduced motion.
- Latest Blog stories are server-loaded and use the same content-type language as `/blog`.
- Permanent Home narrative/browser regressions were added before staging rollout.

Checkpoint remains: **visual approval on staging before Pass C begins**.
