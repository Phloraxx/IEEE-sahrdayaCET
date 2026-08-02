# IEEE Sahrdaya WIE Page — UI Design Blueprint

**Status:** Visual design source of truth  
**Prepared:** 2 August 2026  
**Repository:** `Phloraxx/IEEE-sahrdayaCET`  
**Branch:** `docs/wie-content-blueprint`  
**Base:** `dev`  
**Target route:** `/societies/wie`  
**Related document:** `docs/wie-page-content-blueprint.md`

---

## 1. Final design decision

The WIE page should use a visual direction called:

> **WIE Field Notes — an editorial record of women learning, building and leading at Sahrdaya.**

This direction combines:

- the editorial confidence and hierarchy seen in strong Awwwards work;
- the warmth and people-first presentation common in women-in-tech community design;
- the current IEEE Sahrdaya website’s retro-technical labels, strong typography and dark footer;
- the credibility of real events, real people and verified dates;
- a restrained IEEE WIE identity rather than a generic purple landing-page theme.

The page should feel impressive because it is composed carefully, not because it uses excessive effects.

### The intended impression

A visitor should think:

> This is an active, well-organised and distinctive WIE Student Branch Affinity Group with a real body of work.

The visitor should not think:

> This is a temporary proposal page, a commercial course website, an AI startup template or a separate microsite unrelated to IEEE Sahrdaya.

---

## 2. Why the earlier visual direction needed refinement

The earlier concept contained useful ideas, but it risked overcorrecting the current generic page.

### Risks in a pure “community yearbook” design

- The page could become too museum-like or archival.
- Oversized typography could overpower the actual content.
- An asymmetric grid for every section could make maintenance difficult.
- A sticky year timeline could feel excessive with only a small number of verified events.
- The WIE page could begin to look like a separate brand rather than part of IEEE Sahrdaya.
- Heavy Awwwards-inspired interaction could hurt mobile usability and accessibility.

### Corrected approach

Use a **balanced editorial system**:

- one expressive hero;
- one concise mission section;
- one featured event;
- a practical event archive;
- a warm leadership section;
- one strong contact conclusion;
- restrained motion and retro-technical details.

The layout may become more ambitious as the verified archive grows. The first release should already look polished without pretending that the page has more content than it does.

---

## 3. Non-negotiable product constraints

The UI must respect the actual product and repository.

- The page remains inside the current IEEE Sahrdaya website.
- The current global `Navbar` and `Footer` remain.
- PocketBase remains the source of society, event and team data.
- The WIE page remains at `/societies/wie`.
- Every event should link to its existing `/events/:slug` page.
- Infinia is not shown or mentioned.
- The funding requirement is not part of the public page copy.
- No invented activities, speakers, dates or impact figures.
- No AI-generated people or stock photography presented as WIE Sahrdaya.
- No essential information may depend on hover.
- The mobile version must be designed intentionally, not produced by collapsing desktop columns.

---

## 4. Research synthesis

## 4.1 Official IEEE WIE guidance

The IEEE WIE Visual Identity Toolkit says WIE communications should maintain a consistent look and theme, work with the IEEE master brand and never distort or alter either the IEEE or WIE logo.

This means:

- the official WIE logo is an identity mark, not a decorative object;
- the logo should not be recoloured, stretched, masked or placed inside effects that reduce legibility;
- IEEE blue should remain visible as the parent-brand anchor;
- WIE purple should act as a sub-brand accent;
- the page must continue to look like part of the official Student Branch website.

IEEE describes WIE Affinity Groups as local networks that organise guest speakers, workshops, seminars, mentoring, volunteering and officer opportunities. The UI should therefore emphasise **activity, people and participation**, not generic empowerment slogans alone.

## 4.2 Awwwards findings

### Designed by Women

Useful characteristics:

- strong editorial typography;
- a limited palette;
- photography as the primary evidence;
- a clear single-page narrative;
- strong responsive design;
- content treated as an exhibition rather than a database table.

Use:

- confident headings;
- generous spacing;
- clean chapter transitions;
- a prominent photograph or event story.

Do not copy:

- hover-only image reveals;
- experimental navigation;
- interactions that hide information from touch users.

### Klub Ada community website

Useful characteristics:

- a women-in-tech community identity;
- colourful but purposeful retro-tech details;
- team members treated as real community participants;
- clear actions for joining, attending and partnering.

Use:

- friendly technical details;
- strong action blocks;
- visible community energy;
- distinct but coordinated section treatments.

Do not copy:

- a large multi-colour palette;
- playful styling on every element;
- a completely separate identity from the parent organisation.

### Club Transit event section

Useful characteristics:

- a clear event grid;
- flat layouts;
- one visual hierarchy rather than identical cards;
- desktop and mobile versions designed as separate compositions.

Use:

- one featured event;
- a supporting archive;
- clear dates and metadata;
- predictable card behaviour.

### ELEF team section

Useful characteristics:

- human-centred portraits;
- microinteractions;
- clear team roles;
- mobile-specific treatment.

Use:

- consistent portrait crops;
- full names and visible roles;
- small social/contact actions;
- subtle image movement.

Do not copy:

- custom cursor behaviour;
- hover as the only way to reveal identity or role.

### Wondermake navigation cards

Useful characteristics:

- offset or bento composition;
- hierarchy through card size;
- clear action-oriented surfaces.

Use only for:

- the featured event and supporting archive;
- the final contact actions.

Do not turn every section into a bento grid.

## 4.3 Dribbble findings

Women-in-tech and community concepts commonly use:

- bold mission statements;
- clean neutral surfaces;
- warm portrait photography;
- purple or coral as a limited accent;
- obvious event and community entry points;
- large hero compositions;
- clear calls to action.

Useful lesson:

> Human presence must be stronger than abstract technology decoration.

Dribbble is only a mood-board source. Many concepts do not prove:

- accessibility;
- long-name handling;
- missing-image states;
- real data density;
- responsive behaviour;
- production performance.

Therefore, Dribbble should influence visual tone, not interaction logic.

---

## 5. Design principles

## 5.1 Show proof before making claims

Use real events, dates, speakers and participants to demonstrate WIE’s value.

Avoid a long sequence of generic statements such as:

- empowering women;
- inspiring change;
- building the future;
- breaking barriers.

One strong local mission statement is enough. The archive should provide the evidence.

## 5.2 Human first, technology second

The page should show:

- students building;
- speakers interacting;
- teams collaborating;
- real leadership portraits;
- event outcomes.

Technology appears through activities and small visual details, not through fictional futuristic illustrations.

## 5.3 One expressive moment per section

Each section should have one main visual idea:

- Hero: typography plus photograph.
- Mission: large local statement.
- Focus areas: numbered editorial rows.
- Featured event: image-led case study.
- Archive: organised event cards.
- Team: portraits and roles.
- Contact: bold action block.

Do not combine large type, gradients, doodles, animations, cards and illustrations in the same section.

## 5.4 Borrow composition, not spectacle

Awwwards references are useful for hierarchy and art direction. They are not permission to add:

- scroll hijacking;
- WebGL;
- custom cursors;
- long preloaders;
- horizontal scrolling required for reading;
- autoplay video backgrounds;
- information hidden behind hover;
- excessive page transitions.

## 5.5 The page must age well

The layout must remain usable when:

- events increase from 3 to 15;
- the committee changes;
- one event has no image;
- there are no upcoming events;
- there are no WIE blog posts;
- contact fields change;
- the banner is replaced.

---

## 6. Final page narrative

Recommended section order:

```text
Global Navbar
    ↓
WIE Hero
    ↓
Local Mission + Focus Areas
    ↓
Verified Highlights
    ↓
Featured Activity
    ↓
Activity Archive
    ↓
Leadership + Faculty Incharge
    ↓
Contact / Collaboration CTA
    ↓
Optional Related Stories
    ↓
Global Footer
```

### Why this order works

- Identity is established immediately.
- The page explains WIE locally before showing records.
- Events prove activity before the page asks visitors to care about the committee.
- Leadership creates trust after visitors understand the group’s work.
- Contact ends the page with a useful action.

---

## 7. Desktop wireframe

```text
┌──────────────────────────────────────────────────────────────────────┐
│ GLOBAL IEEE SAHRDAYA NAVBAR                                         │
├──────────────────────────────────────────────────────────────────────┤
│ WIE / SAHRDAYA / 2024—2026                        WIE OFFICIAL MARK │
│                                                                      │
│ WOMEN IN                       ┌───────────────────────────────────┐ │
│ ENGINEERING                    │                                   │ │
│ AT SAHRDAYA                    │ Real WIE event photograph         │ │
│                                │ or controlled two-image collage   │ │
│ Learn. Lead. Build together.   │                                   │ │
│                                └───────────────────────────────────┘ │
│ [EXPLORE ACTIVITIES] [CONTACT WIE]                                  │
├──────────────────────────────────────────────────────────────────────┤
│ WE CREATE ROOM FOR WOMEN       │ Two short paragraphs describing   │
│ TO LEARN, BUILD AND LEAD.      │ the local Affinity Group.          │
├──────────────────────────────────────────────────────────────────────┤
│ 01 TECHNICAL CONFIDENCE        Hands-on workshops and hackathons    │
│ 02 LEADERSHIP & IDENTITY       Communication and professional growth│
│ 03 COMMUNITY & COLLABORATION   Mentoring and partnerships           │
├──────────────────────────────────────────────────────────────────────┤
│ 2024—2026 ACTIVITY RECORD      3 PUBLISHED 2026 EVENTS     4 LEADERS│
├──────────────────────────────────────────────────────────────────────┤
│ FEATURED ACTIVITY                                                    │
│ ┌──────────────────────────────────────┬───────────────────────────┐ │
│ │ WiTech-Ideathon image                │ Title                     │ │
│ │                                      │ Date / venue / speaker    │ │
│ │                                      │ Summary                   │ │
│ │                                      │ [VIEW ACTIVITY →]         │ │
│ └──────────────────────────────────────┴───────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│ ACTIVITY ARCHIVE                [2026] [2025] [2024]                 │
│ ┌──────────────────────┐ ┌──────────────────────┐                    │
│ │ Event card           │ │ Event card           │                    │
│ └──────────────────────┘ └──────────────────────┘                    │
│ ┌──────────────────────────────┐ ┌──────────────┐                    │
│ │ Wider event card             │ │ Compact card │                    │
│ └──────────────────────────────┘ └──────────────┘                    │
├──────────────────────────────────────────────────────────────────────┤
│ THE PEOPLE BEHIND WIE                                                │
│ [Chair portrait] [Vice Chair portrait] [Secretary portrait]          │
│                                                                      │
│ FACULTY INCHARGE: Rehna Baby Joseph                                  │
├──────────────────────────────────────────────────────────────────────┤
│ LET’S CREATE SOMETHING MEANINGFUL.                                   │
│ [COLLABORATE] [CONTACT THE TEAM] [FOLLOW WIE]                         │
├──────────────────────────────────────────────────────────────────────┤
│ GLOBAL IEEE SAHRDAYA FOOTER                                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Mobile wireframe

```text
┌──────────────────────────────┐
│ GLOBAL MOBILE NAV            │
├──────────────────────────────┤
│ WIE / SAHRDAYA               │
│                              │
│ WOMEN IN                     │
│ ENGINEERING                  │
│ AT SAHRDAYA                  │
│                              │
│ Learn. Lead. Build together. │
│                              │
│ [EXPLORE ACTIVITIES]         │
│ [CONTACT WIE]                │
│                              │
│ ┌──────────────────────────┐ │
│ │ Real event photograph    │ │
│ └──────────────────────────┘ │
│ WIE official mark            │
├──────────────────────────────┤
│ WE CREATE ROOM FOR WOMEN     │
│ TO LEARN, BUILD AND LEAD.    │
│                              │
│ Two short local paragraphs.  │
├──────────────────────────────┤
│ 01 TECHNICAL CONFIDENCE      │
│ Short explanation            │
│ ──────────────────────────── │
│ 02 LEADERSHIP & IDENTITY     │
│ Short explanation            │
│ ──────────────────────────── │
│ 03 COMMUNITY                 │
│ Short explanation            │
├──────────────────────────────┤
│ VERIFIED HIGHLIGHTS          │
│ 2024—26 / 3 EVENTS / 4 TEAM  │
├──────────────────────────────┤
│ FEATURED ACTIVITY            │
│ ┌──────────────────────────┐ │
│ │ Event image              │ │
│ └──────────────────────────┘ │
│ WiTech-Ideathon 2026         │
│ Date / venue / speaker       │
│ Summary                      │
│ [VIEW ACTIVITY →]            │
├──────────────────────────────┤
│ ACTIVITY ARCHIVE             │
│ [2026] [2025] [2024]        │
│                              │
│ ┌──────────────────────────┐ │
│ │ Event card               │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Event card               │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ THE PEOPLE BEHIND WIE        │
│ ┌──────────────────────────┐ │
│ │ Chair portrait           │ │
│ │ Full name and role       │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Vice Chair               │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Secretary                │ │
│ └──────────────────────────┘ │
│                              │
│ Faculty Incharge            │
├──────────────────────────────┤
│ LET’S CREATE SOMETHING       │
│ MEANINGFUL.                  │
│ [CONTACT] [COLLABORATE]      │
├──────────────────────────────┤
│ GLOBAL FOOTER                │
└──────────────────────────────┘
```

### Mobile rule

Mobile is not a smaller desktop layout.

On mobile:

- one portrait per row;
- one event card per row;
- no sticky year rail;
- no hover-dependent content;
- full names remain visible;
- action buttons stack;
- the hero image appears below the copy;
- the WIE logo becomes smaller supporting identification;
- section padding is reduced, but content remains breathable.

---

## 9. Hero specification

## 9.1 Purpose

The hero must establish:

- WIE;
- Sahrdaya;
- technical community;
- real people;
- a clear path to activities and contact.

## 9.2 Recommended copy

Small label:

```text
IEEE WOMEN IN ENGINEERING / SAHRDAYA
```

Primary heading:

```text
Women in Engineering
at Sahrdaya
```

Supporting line:

```text
A student community for technical confidence, leadership and collaboration.
```

Primary action:

```text
Explore activities
```

Secondary action:

```text
Contact WIE
```

## 9.3 Composition

Desktop:

- 7/5 editorial grid;
- heading on the left;
- one approved real image or two-image collage on the right;
- official WIE mark aligned to a quiet corner;
- small technical metadata labels;
- subtle thin-line grid or registration marks.

Mobile:

- copy first;
- actions second;
- image third;
- official mark fourth;
- no attempt to preserve the desktop side-by-side composition.

## 9.4 Current banner decision

The current 1108 × 277 banner should not be used as a full-width `object-cover` hero.

Reasons:

- it contains text and logos inside the image;
- its 4:1 aspect ratio crops badly on mobile;
- it duplicates the HTML heading;
- it weakens the visual hierarchy.

Acceptable uses:

1. Replace it in PocketBase with a high-quality event/community photograph.
2. Show it as a contained identity ribbon lower in the page.
3. Retain it only as the Open Graph image until a stronger approved image exists.

## 9.5 Hero interaction

Allowed:

- two-beat text reveal;
- image clip reveal;
- subtle label fade;
- very small pointer-based image movement on desktop only, when reduced motion is not requested.

Not allowed:

- continuous floating blobs;
- auto-rotating slides;
- video background;
- logo spin;
- cursor replacement;
- animation that delays reading the heading.

---

## 10. Mission section

## 10.1 Purpose

Explain what WIE Sahrdaya does locally without repeating the hero.

## 10.2 Recommended statement

```text
We create room for women to learn, build and lead in engineering.
```

This is a local editorial statement, not an official IEEE WIE tagline.

## 10.3 Supporting copy structure

Paragraph one:

- local technical programmes;
- practical exploration;
- confidence in emerging technology.

Paragraph two:

- leadership;
- professional identity;
- mentoring;
- collaboration across institutions and communities.

## 10.4 Visual composition

Desktop:

- large statement on the left;
- two short paragraphs on the right;
- thin WIE-purple rule;
- small `ABOUT / WIE SAHRDAYA` label.

Mobile:

- statement;
- rule;
- paragraphs;
- no side-by-side columns.

Avoid a small centred heading followed by one centred paragraph. That is the current page’s weakest content pattern.

---

## 11. Focus-area section

Use three numbered editorial rows.

```text
01  TECHNICAL CONFIDENCE
    Workshops, hackathons and hands-on exposure to emerging technology.

02  LEADERSHIP & IDENTITY
    Communication, entrepreneurship and professional growth.

03  COMMUNITY & COLLABORATION
    Mentorship, teamwork and partnerships across institutions.
```

### Desktop treatment

- one vertical list;
- large index number;
- title;
- concise description;
- optional small related image that changes with keyboard focus or hover;
- all text remains visible without interaction.

### Mobile treatment

- stacked rows;
- no image-swapping dependency;
- optional static thumbnail per row only when suitable media exists.

Do not use three identical icon cards. The numbered-list treatment is more editorial, easier to maintain and better aligned with the site’s technical labels.

---

## 12. Verified highlight strip

## 12.1 Purpose

Provide immediate evidence without inventing cumulative impact.

## 12.2 Initial safe values

```text
2024—2026
Activity record

3
Published 2026 activities

4
Current WIE leadership and faculty profiles
```

Values must be computed or derived from verified records where possible.

## 12.3 Later values

After the archive is fully imported and attendance is structured:

```text
Events conducted
Participants reached
Technical programmes
Collaborations
```

## 12.4 Visual treatment

- deep ink or IEEE-blue strip;
- large numbers;
- clean sans-serif labels;
- Press Start 2P or mono only for tiny metadata;
- no animated counters unless the final value is visible immediately and reduced motion is respected.

---

## 13. Featured activity

## 13.1 Selection rule

Select the latest completed or published WIE event with suitable media.

Current expected result:

```text
WiTech-Ideathon 2026 — Agentic AI Workshop & Ideathon
```

## 13.2 Content

- full title;
- date;
- venue;
- speaker;
- theme;
- concise summary;
- tags;
- stable event-detail link.

## 13.3 Desktop layout

Use a wide two-part case-study block:

- approximately 60% image;
- approximately 40% content;
- image may extend slightly beyond the text column;
- a clear `FEATURED ACTIVITY` label;
- one primary action.

## 13.4 Mobile layout

- image first;
- content below;
- metadata may wrap naturally;
- no clipped title;
- action remains visible without hover.

## 13.5 Interaction

Allowed:

- image scales by approximately 1.02 on hover;
- arrow shifts by a few pixels;
- border changes subtly;
- full card is clickable when semantics remain correct.

Not allowed:

- hidden description overlay;
- title revealed only on hover;
- autoplay media;
- large modal replacing the existing event route.

---

## 14. Activity archive

## 14.1 Archive role

The archive is the main proof that WIE Sahrdaya has an established activity history.

It should be visually engaging, but it must remain maintainable as events grow.

## 14.2 Initial layout

With fewer than eight verified public events:

- one featured event;
- remaining events in a two-column desktop grid;
- one-column mobile list;
- optional year filter only when at least two years contain imported events.

## 14.3 Expanded layout

When the archive contains enough verified records:

- year tabs: `2026`, `2025`, `2024`;
- two-column editorial grid;
- occasional wide card for major activities;
- no more than two card size variants;
- newest first within each year.

Do not implement a complicated sticky timeline before the archive has enough records to justify it.

## 14.4 Event card anatomy

```text
[Image or designed fallback]

YEAR / CATEGORY
Full event title
Date · Venue
Two-line summary
View activity →
```

Every card must show:

- full title or a clearly readable multi-line title;
- date;
- venue or platform;
- short summary;
- event-detail link;
- status when relevant.

## 14.5 Missing-image fallback

Do not use a large generic grey box with a calendar icon.

Use a designed fallback generated from existing data:

- WIE-purple or IEEE-blue surface;
- event year;
- event title;
- category label;
- subtle technical line pattern;
- official logo omitted unless brand rules allow the exact treatment.

The fallback should look intentional and remain lightweight.

## 14.6 Filters

First release:

- no filter when only a few events are present;
- optional year tabs after the historical import.

Later:

- Technical;
- Leadership;
- Professional Development;
- Community;
- Competition.

Filters must be buttons with visible selected state and keyboard support.

---

## 15. Leadership section

## 15.1 Purpose

Show the people responsible for the group and make the page feel human.

## 15.2 Student leadership

Display:

- Tisa Bino — Chair;
- Prardhana B Gopal — Vice Chair;
- Irene John P — Secretary.

Each profile includes:

- portrait;
- full name;
- role;
- department;
- semester/batch;
- approved social/contact links.

## 15.3 Desktop layout

Recommended:

- three equal portrait cards in one row;
- portraits use the same aspect ratio;
- names are never limited to one line;
- role is a strong label;
- social links appear below the metadata;
- one small visual offset may be used, but all cards remain easy to scan.

Alternative:

- one large Chair profile and two smaller supporting profiles only if the hierarchy is institutionally appropriate.

Default to equal prominence unless the WIE team requests otherwise.

## 15.4 Mobile layout

- one profile per row;
- image and text may form a horizontal media object when space allows;
- full names visible;
- 44px minimum preferred action target;
- no two-column profile grid;
- no hover-only social icons.

## 15.5 Portrait treatment

- consistent crop;
- natural colour;
- no heavy purple filters;
- no AI background replacement;
- light border or editorial frame;
- optional tiny index number.

## 15.6 Faculty Incharge

Show separately after the student leadership:

```text
FACULTY INCHARGE
Rehna Baby Joseph
Department of Computer Science and Engineering
```

Quotation rule:

- show only an approved quotation;
- otherwise remove the current hardcoded quotation;
- never present a generic generated message as a real statement.

---

## 16. Contact and collaboration section

## 16.1 Purpose

Provide a useful final action even when the WhatsApp field is empty.

## 16.2 Recommended copy

```text
Let’s create something meaningful.

For workshops, mentoring, technical sessions,
partnerships and inter-institution collaborations.
```

## 16.3 Action hierarchy

Primary:

```text
Contact WIE
```

Secondary options, only when data exists:

```text
Collaborate with us
Follow on Instagram
Call the Chair
Email the team
Join the community
```

## 16.4 Visual treatment

- deep ink background;
- large white heading;
- WIE-purple primary action;
- IEEE-blue detail or secondary action;
- subtle technical line pattern;
- strong contrast;
- no unnecessary form.

## 16.5 Fallback logic

```text
public WIE email exists  → show email action
phone exists             → show phone action
Instagram exists         → show Instagram action
WhatsApp exists          → show community action
nothing exists           → show official IEEE Sahrdaya email and state that enquiries will be routed to WIE
```

Do not render empty buttons or inactive placeholders.

---

## 17. Visual system

## 17.1 Relationship to the parent website

Keep:

- global navbar;
- global footer;
- IEEE blue;
- existing font files;
- the current public-site spacing discipline;
- technical labels;
- existing motion utilities where suitable.

Add:

- WIE accent tokens scoped to the WIE page;
- editorial section layouts;
- real WIE photography;
- controlled purple surfaces;
- one strong dark contact section.

## 17.2 Colour system

Final WIE purple values should come from the approved IEEE WIE brand assets or visual identity guidelines.

Provisional implementation tokens:

```css
.wie-page {
  --wie-ink: #17131c;
  --wie-paper: #faf8f5;
  --wie-surface: #ffffff;
  --wie-muted: #6f6874;
  --wie-line: #ded7e1;
  --wie-soft: #f1e8f3;
  --wie-accent: /* verified WIE purple */;
  --wie-accent-strong: /* accessible darker WIE purple */;
  --wie-ieee-blue: #00629b;
  --wie-ieee-light-blue: #0099d6;
}
```

Distribution target:

```text
65% warm neutral surfaces
20% deep ink
10% WIE purple
5% IEEE blue and supporting details
```

Avoid:

- pink covering the full page;
- purple-to-blue gradient behind every section;
- neon violet glow;
- transparent glass cards;
- low-contrast lavender body text.

## 17.3 Typography

Use only the website’s existing bundled fonts.

### Primary sans

Use the existing sans/Geist/Inter system for:

- body copy;
- event titles;
- team names;
- section headings;
- buttons.

### Pixel or mono accent

Use Press Start 2P or mono only for:

- section labels;
- year markers;
- index numbers;
- small metadata;
- technical annotations.

Do not use the pixel font for:

- body text;
- long headings;
- committee names;
- event descriptions;
- mobile buttons.

### Suggested scale

Desktop:

```text
Hero H1          clamp(3.75rem, 7vw, 7rem)
Mission statement clamp(2.25rem, 4.5vw, 4.5rem)
Section heading  clamp(2rem, 3.2vw, 3.5rem)
Event title      1.5–2.25rem
Body             1rem–1.125rem
Metadata         0.7–0.8rem
```

Mobile:

```text
Hero H1          clamp(2.6rem, 13vw, 4.2rem)
Mission statement 2rem–2.8rem
Section heading  1.8rem–2.4rem
Event title      1.3rem–1.8rem
Body             1rem
Metadata         0.7rem–0.8rem
```

## 17.4 Grid

Desktop:

- max width aligned with current public pages;
- 12-column conceptual grid;
- 24–32px gutters;
- hero 7/5 split;
- featured event approximately 7/5 or 8/4;
- event archive two columns initially;
- leadership three columns.

Mobile:

- one content column;
- 18–24px horizontal padding;
- no forced equal-height cards;
- no horizontal scroll for essential content.

## 17.5 Spacing

Desktop section padding:

```text
96–144px vertical
```

Mobile section padding:

```text
64–88px vertical
```

Use larger spacing between narrative sections and smaller spacing inside data groups.

## 17.6 Borders, radii and shadows

Recommended:

- thin 1px editorial borders;
- modest 12–20px radii only where the parent site supports them;
- square or slightly rounded image frames;
- soft shadows limited to interactive cards;
- no large blurry purple shadows.

The page should feel editorial, not like a dashboard of floating cards.

---

## 18. Image system

## 18.1 Required media types

- one strong hero photograph;
- one featured-event image;
- banners or posters for initial archive events;
- three consistent student leadership portraits;
- one Faculty Incharge portrait;
- optional supporting activity photographs.

## 18.2 Preferred photography

Use:

- people working together;
- speakers interacting with participants;
- hands-on technical activity;
- hackathon/workshop moments;
- candid collaboration;
- clear, natural portraits.

Avoid:

- generic stock imagery;
- AI-generated people;
- fictional laptop illustrations;
- extremely wide WhatsApp screenshots;
- blurred photographs enlarged beyond their resolution;
- a different photographic filter for every event.

## 18.3 Crop standards

```text
Hero image             4:3 or 5:4
Featured event         16:10 or 3:2
Event card             4:3
Leadership portrait    4:5
Faculty portrait       1:1 or 4:5
```

Use consistent aspect-ratio containers and deliberate `object-position` values.

## 18.4 Optimisation

- convert new images to WebP or AVIF where practical;
- retain originals outside the public card path;
- use PocketBase thumbnail parameters or appropriate responsive variants;
- set width/height or aspect ratio to prevent layout shift;
- lazy-load below-the-fold images;
- prioritise only the hero image;
- provide meaningful alternative text.

---

## 19. Motion system

## 19.1 Motion character

Motion should feel:

```text
precise
brief
editorial
purposeful
```

## 19.2 Allowed motion

- heading reveal in two beats;
- image clip reveal;
- short section fade/translate;
- 4–6px card lift on hover;
- subtle arrow movement;
- thin rule drawing into place;
- year-tab indicator slide;
- gentle portrait image scale.

## 19.3 Timing

```text
Microinteraction     120–220ms
Section entrance     350–600ms
Hero sequence        under 900ms total
```

Use the repository’s existing sharp-out easing where appropriate.

## 19.4 Reduced motion

When `prefers-reduced-motion: reduce`:

- content appears immediately;
- no image scaling;
- no animated counters;
- no scroll-triggered movement;
- focus and hover state changes remain visible without animation.

## 19.5 Prohibited motion

- scroll hijacking;
- required horizontal scroll;
- cursor-following effects;
- preloader longer than normal page loading;
- continuous floating objects;
- repeating logo animation;
- parallax that makes text difficult to read;
- autoplay background video;
- WebGL solely for decoration.

---

## 20. Accessibility specification

Target WCAG 2.2 AA.

Required:

- one H1;
- logical heading order;
- visible keyboard focus;
- contrast checked for WIE-purple text and buttons;
- no colour-only state;
- no hover-only information;
- complete names available visually and to assistive technology;
- useful image alt text;
- decorative patterns hidden from assistive technology;
- touch targets at least 44px where practical;
- external-link labels or accessible names;
- reduced-motion support;
- focus not obscured by the navbar;
- year tabs implemented as actual buttons;
- current filter indicated with text/state in addition to colour;
- event cards remain understandable without images.

### Important colour rule

Do not use the bright WIE accent for small body text on white unless contrast passes. Use a darker accessible purple for text and reserve the brighter accent for larger surfaces and decorative details.

---

## 21. Performance specification

- Keep the page SSR-rendered.
- Reuse the existing loader instead of fetching the same data again in the browser.
- Query only required PocketBase fields.
- Do not add a slider library.
- Do not add WebGL or a large animation dependency.
- Do not autoplay video.
- Keep the hero image appropriately compressed.
- Avoid loading all historical images at full resolution.
- Use stable image dimensions.
- Preserve canonical metadata and organisation schema.
- Keep the page useful before JavaScript hydration.

Suggested targets:

```text
No new blocking font requests
No horizontal overflow at 390px
No unexpected layout shift from images
No serious or critical Axe violations
No console errors
No interaction requiring hover
```

---

## 22. Data-driven behaviour

## 22.1 Upcoming events

Show an Upcoming section only when PocketBase contains a future public WIE event.

Do not show:

```text
Coming soon
```

as a large empty section when no event is confirmed.

## 22.2 Featured event

Choose the latest completed or published event with suitable media.

If the newest event lacks media:

1. use the next suitable event for the featured block;
2. keep the newest event in the archive;
3. never invent an image.

## 22.3 Event archive

- newest first;
- year grouping when history is imported;
- stable `/events/:slug` links;
- clear fallback when no image exists;
- draft events visible only to authorised editors according to existing behaviour.

## 22.4 Team

- order follows PocketBase `order`;
- Faculty Incharge separated from student office bearers;
- empty social/contact links hidden;
- profile cards remain valid if a member lacks a photograph.

## 22.5 Contact

- render only available actions;
- use official fallback contact when WIE-specific details are absent;
- no disabled-looking empty CTA.

---

## 23. Component recommendation

Suggested implementation structure:

```text
src/routes/societies_.wie.tsx
  - meta
  - loader
  - canonical/schema
  - page composition

src/features/societies/wie/
  WIEPage.tsx
  WIEHero.tsx
  WIEMission.tsx
  WIEFocusAreas.tsx
  WIEHighlights.tsx
  WIEFeaturedEvent.tsx
  WIEEventArchive.tsx
  WIEEventCard.tsx
  WIETeam.tsx
  WIEContact.tsx
  wie-design.ts
```

This is a recommendation, not a requirement to create one file per visual section. Avoid both extremes:

- one unmaintainable route file;
- dozens of tiny components with no reusable value.

### Shared components to retain

- `Navbar`
- `Footer`
- `CanonicalLink`
- existing icons
- date utilities
- existing event routes
- current auth/edit logic
- current motion utilities where suitable

---

## 24. Suggested copy deck

The final copy remains subject to WIE approval.

### Hero

```text
IEEE WOMEN IN ENGINEERING / SAHRDAYA

Women in Engineering
at Sahrdaya

A student community for technical confidence,
leadership and collaboration.
```

### Mission

```text
We create room for women to learn, build and lead in engineering.
```

### Focus areas

```text
Technical Confidence
Hands-on workshops, hackathons and practical exposure to emerging technology.

Leadership & Identity
Communication, entrepreneurship and professional growth beyond the classroom.

Community & Collaboration
Mentoring, teamwork and partnerships that connect students with wider opportunities.
```

### Archive introduction

```text
Our activity record

A growing archive of technical programmes, leadership initiatives,
creative challenges and collaborative learning experiences.
```

### Team introduction

```text
The people behind WIE

Students and faculty working together to create useful,
welcoming and ambitious opportunities in engineering.
```

### Contact

```text
Let’s create something meaningful.

For workshops, mentoring, technical sessions,
partnerships and inter-institution collaborations.
```

Avoid phrases that cannot be demonstrated, such as:

- India’s leading WIE group;
- transforming thousands of lives;
- the biggest women-in-tech community;
- revolutionary programmes;
- world-class innovation hub.

---

## 25. Implementation phases

## Phase 1 — Visual foundation

- Add scoped WIE design tokens.
- Refactor the current route into manageable sections.
- Replace the current duplicated hero layout.
- Ensure the existing banner is no longer cropped as a mobile hero.
- Add responsive hero composition.

## Phase 2 — Content hierarchy

- Add local mission.
- Add numbered focus areas.
- Add verified highlight strip.
- Add featured-event hierarchy.
- Link events to `/events/:slug`.

## Phase 3 — Archive and fallback states

- Build maintainable event cards.
- Add intentional no-image fallback.
- Add year grouping only when historical events are imported.
- Remove hover popup dependency.

## Phase 4 — Leadership and contact

- Replace narrow mobile team grid.
- Display full names.
- Separate Faculty Incharge.
- Remove or approve the hardcoded quotation.
- Add resilient contact actions.

## Phase 5 — Media and polish

- Upload approved hero media.
- Upload missing event posters/photos.
- Standardise image crops.
- Add restrained motion.
- Verify reduced-motion behaviour.

## Phase 6 — QA

- desktop and mobile visual review;
- keyboard review;
- accessibility scan;
- performance review;
- missing-data tests;
- long-title tests;
- staging acceptance;
- production release through CI/CD.

---

## 26. Visual QA matrix

Test at:

```text
390 × 844
430 × 932
768 × 1024
1024 × 768
1280 × 800
1440 × 1000
```

Test states:

- current three-event dataset;
- eight-event historical dataset;
- missing hero image;
- missing event image;
- no upcoming event;
- long event title;
- long venue;
- missing team social link;
- missing team photograph;
- empty WIE-specific contact;
- authorised chair view with draft events;
- unauthenticated public view.

---

## 27. UI acceptance checklist

### Brand

- [ ] Official IEEE WIE mark is not altered.
- [ ] IEEE blue remains visible as the parent-brand anchor.
- [ ] WIE purple is restrained and contrast-safe.
- [ ] The page clearly belongs to IEEE Sahrdaya.
- [ ] No Infinia content appears.

### Hero

- [ ] One H1 only.
- [ ] No repeated WIE heading inside a cropped banner.
- [ ] Real approved media is used.
- [ ] Hero remains useful without the image.
- [ ] Primary activity and contact actions are visible.

### Content

- [ ] Local mission is concise.
- [ ] Focus areas are visible without interaction.
- [ ] Only verified highlight values appear.
- [ ] Featured event is selected by a clear rule.
- [ ] Archive is based on PocketBase records.

### Events

- [ ] Every event links to `/events/:slug`.
- [ ] Full event titles are readable.
- [ ] Missing-image fallback is intentional.
- [ ] No hover-only event description.
- [ ] Year filters appear only when useful.

### Team

- [ ] Full names display on mobile.
- [ ] One profile per mobile row.
- [ ] Social/contact links have accessible names.
- [ ] Faculty Incharge is clearly separated.
- [ ] No unapproved quotation is published.

### Contact

- [ ] At least one functioning contact path exists.
- [ ] Empty actions are hidden.
- [ ] Fallback contact logic works.
- [ ] Action labels describe their destination.

### Accessibility

- [ ] WCAG AA contrast target.
- [ ] Keyboard focus visible.
- [ ] No essential hover behaviour.
- [ ] Reduced motion supported.
- [ ] Touch targets are usable.
- [ ] Images have correct alt treatment.
- [ ] No serious or critical Axe violations.

### Performance

- [ ] No new heavy animation dependency.
- [ ] No autoplay media.
- [ ] Responsive images are compressed.
- [ ] No horizontal overflow.
- [ ] No console or hydration errors.
- [ ] SSR metadata and canonical URL remain correct.

---

## 28. Asset checklist

Required before the UI can be considered final:

- [ ] One approved high-resolution hero photograph.
- [ ] Approved WIE logo from the official toolkit/current record.
- [ ] WiTech-Ideathon featured image.
- [ ] Gen AI workshop poster or photograph.
- [ ] Beyond Business poster or photograph.
- [ ] Initial historical-event media.
- [ ] Consistent Chair, Vice Chair and Secretary portraits.
- [ ] Faculty Incharge portrait.
- [ ] Approved public WIE email/phone/social link.
- [ ] Approved Faculty Incharge wording or decision to omit the quotation.

---

## 29. Anti-pattern checklist

Do not implement:

- [ ] Full-page purple gradient.
- [ ] Generic AI/SaaS hero.
- [ ] Fictional woman-with-laptop illustration.
- [ ] AI-generated people.
- [ ] Glassmorphism on every card.
- [ ] Hero carousel.
- [ ] Heavy parallax.
- [ ] Custom cursor.
- [ ] Scroll hijacking.
- [ ] WebGL decoration.
- [ ] Long preloader.
- [ ] Hover-only event content.
- [ ] Two-column team grid on mobile.
- [ ] Grey calendar placeholders dominating event cards.
- [ ] Every section inside a rounded card.
- [ ] Invented impact counters.
- [ ] A separate WIE navbar or footer.
- [ ] A design that cannot handle more events next year.

---

## 30. Final opinion

The most impressive version of this page is not the version with the most animation or the most unusual layout.

It is the version with:

1. one confident hero;
2. excellent typography;
3. real WIE photographs;
4. a clear mission;
5. one strongly presented featured activity;
6. an organised, expanding archive;
7. warm and credible leadership portraits;
8. a useful contact conclusion;
9. precise spacing and responsive behaviour;
10. restrained motion that never obstructs the content.

The final page should feel like:

> **A modern editorial record of a technical community that is active, welcoming and serious about helping women learn, build and lead.**

That direction is visually ambitious enough to be memorable, but practical enough to remain accessible, maintainable and fully integrated with the current IEEE Sahrdaya website.

---

## 31. Research references

### IEEE

- IEEE WIE Visual Identity Toolkit  
  `https://brand-experience.ieee.org/guidelines/sub-brand-resources/wie/`
- IEEE Women in Engineering  
  `https://wie.ieee.org/`
- WIE Affinity Groups  
  `https://wie.ieee.org/affinity-groups/wie-affinity-groups/`
- WIE Student Branch Affinity Groups  
  `https://wie.ieee.org/affinity-groups/wie-student-branch-affinity-groups/`
- Affinity Group Activities  
  `https://wie.ieee.org/affinity-groups/activities/`

### Awwwards

- Designed by Women  
  `https://www.awwwards.com/sites/designed-by-women`
- Klub Ada team  
  `https://www.awwwards.com/inspiration/klub-ada-team-klub-ada-community-website`
- Club Transit event section  
  `https://www.awwwards.com/inspiration/event-section-club-transit`
- ELEF meet-the-team section  
  `https://www.awwwards.com/inspiration/meet-the-team-elef`
- Wondermake navigation cards  
  `https://www.awwwards.com/inspiration/navigation-cards-wondermake`
- Wanted for Nothing about/team page  
  `https://www.awwwards.com/inspiration/about-and-team-page`

### Dribbble

- Women in Tech collection  
  `https://dribbble.com/tags/women-in-tech`
- Women in Technology landing page  
  `https://dribbble.com/shots/6815599-Women-in-Technology-Web-Landing-Page`
- Female Tech hero exploration  
  `https://dribbble.com/shots/25740921-Hero-Page-Exploration-for-Female-Tech`
- Tech community website search  
  `https://dribbble.com/search/tech-community-website`
- Community website search  
  `https://dribbble.com/search/community-website`

### Accessibility

- WCAG 2.2  
  `https://www.w3.org/TR/WCAG22/`
- What is new in WCAG 2.2  
  `https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/`
