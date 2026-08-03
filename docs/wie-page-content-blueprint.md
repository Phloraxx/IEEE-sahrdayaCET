# IEEE Sahrdaya WIE Page — Content Blueprint and Implementation Plan

**Status:** Planning source of truth  
**Prepared:** 2 August 2026  
**Repository:** `Phloraxx/IEEE-sahrdayaCET`  
**Base branch:** `dev`  
**Target public route:** `https://ieeesahrdaya.com/societies/wie`  
**Scope:** One WIE page inside the existing IEEE Sahrdaya website

---

## 1. Final decision

The required deliverable is a permanent public page for the **IEEE Women in Engineering Student Branch Affinity Group at Sahrdaya**.

It must be implemented at the existing route:

```text
/societies/wie
```

The page is part of the current IEEE Sahrdaya application. It is not a separate website, subdomain, repository, backend, or microsite.

The existing Societies page already links the Women in Engineering card to this route. The current WIE route already reads its society, event, and office-bearer data from PocketBase. The work is therefore a content completion and page redesign task, not a new-product task.

### The page must contain

- A clear WIE Sahrdaya identity
- A concise explanation of the local Affinity Group
- Verified activities conducted during 2024, 2025, and 2026
- The current WIE committee and Faculty Incharge
- A public contact or collaboration path
- A stable URL suitable for official forms and proposals

### The page must not contain

- Infinia
- A funding-request explanation
- Invented upcoming events
- Unverified statistics
- A separate WIE navigation system
- A second source of event data
- Hardcoded copies of event records that already belong in PocketBase
- Generic claims that are not supported by the group’s actual work

---

## 2. Original request, correctly interpreted

The original WhatsApp messages establish the purpose and boundaries of the work.

### What was explicitly requested

1. The supplied event reports were taken from vTools or available records because some other event details could not be found.
2. The WIE programmes from **2024–2025 and 2026** were considered sufficient content for the website.
3. There was no requirement to wait for newly conducted programmes.
4. WIE needed a public website link or address that could be entered in a proposal form.
5. The exact presentation and implementation could be decided by Sourav.
6. The WIE presence was to be separate in identity, but it did not need to be a separate website.
7. The requirement later became urgent because a proposal form required a WIE web presence.

### Correct product interpretation

The website is evidence that WIE Sahrdaya is a real, active Student Branch Affinity Group with:

- an identity;
- a leadership team;
- a history of activities;
- a way to contact it;
- a maintained location on the official Student Branch website.

The website does **not** need to pretend that WIE is a large independent organisation or manufacture new programmes to look active. Its credibility should come from the verified work already completed.

### Public messaging principle

The funding or proposal requirement explains why the page is needed internally. It should not become the public story of the page.

A visitor should see:

> WIE Sahrdaya, what it does, who leads it, and what it has conducted.

A visitor should not see:

> This page was created because a funding form asked for a URL.

---

## 3. Official WIE context that should guide the content

IEEE Women in Engineering describes WIE as a global network that promotes women engineers and scientists and inspires girls to pursue engineering and science. Its current mission focuses on inspiring women and girls in STEM, fostering technological innovation and excellence for the benefit of humanity.

IEEE WIE Affinity Groups provide local opportunities for members to:

- coordinate events;
- organise workshops, seminars, and guest sessions;
- mentor others;
- volunteer;
- take leadership roles;
- build local professional networks.

The official WIE functions also include leadership development, career advancement, outreach, mentoring, membership support, and programmes that encourage entry into and retention in engineering.

### What this means for the Sahrdaya page

The page should not reduce WIE to only “women empowerment” in broad language. It should show the local group through its actual programme mix:

- technical learning;
- confidence-building;
- professional identity;
- leadership;
- entrepreneurship;
- cybersecurity awareness;
- hackathons and practical creation;
- collaboration with other WIE groups and IEEE organisational units.

### Content categories supported by Sahrdaya’s records

The existing activity reports naturally form four useful categories:

1. **Technical learning**  
   Gen AI, Agentic AI, AR/VR, cybersecurity, IoT, hackathons

2. **Professional growth and leadership**  
   Beyond Resume, Elevate Her, entrepreneurship and branding sessions

3. **Community and collaboration**  
   Inter-institution sessions, WIE Week activities, joint programmes

4. **Creative technical awareness**  
   Debates, quizzes, sketches, posters, memes, and art around technology themes

These categories should be used to organise the archive. They should not be presented as unsupported marketing claims.

---

## 4. Current production state

The current production application already contains a working WIE route and live WIE records.

### Current application architecture

```text
React 19
React Router 7 Framework Mode
TypeScript
Vite 7
Tailwind CSS 4
PocketBase 0.39.9
Docker Compose
Dokploy / Traefik
Cloudflare
```

### Relevant source files

```text
src/routes.ts
src/routes/societies.tsx
src/routes/societies_.wie.tsx
src/routes/societies_.$slug.tsx
src/features/societies/SocietiesClient.tsx
src/server/public/society-detail.server.ts
src/features/admin/societies/society-form.tsx
src/features/admin/events/event-form.tsx
```

### Existing WIE data flow

```text
/societies/wie
    ↓
loader in src/routes/societies_.wie.tsx
    ↓
fetchSocietyData("wie")
    ↓
PocketBase societies + events + execom
```

### Live WIE society record

| Field | Current value |
|---|---|
| ID | `xzuz8gi78qe3b0s` |
| Name | Women in Engineering |
| Slug | `wie` |
| Visibility | Public |
| Logo | Present |
| Banner | Present |
| WhatsApp link | Empty |
| Bio | Present, but only one sentence |

### Live office bearers

| Name | Role | Department | Batch |
|---|---|---|---|
| Rehna Baby Joseph | Faculty Incharge | CSE | Faculty |
| Tisa Bino | Chair | EEE | S5 |
| Prardhana B Gopal | Vice Chair | BME | S3 |
| Irene John P | Secretary | CSC | S3 |

### Live completed events

| Date | Event | Current media |
|---|---|---|
| 11 July 2026 | WiTech-Ideathon 2026 — Agentic AI Workshop & Ideathon | Banner present |
| 4 July 2026 | Beyond Business — Building a Brand with a Unique Identity | Banner missing |
| 9 March 2026 | Gen AI & Prompt Engineering Workshop | Banner missing |

### Current live-page content problems

- The banner is a 4:1 graphic with embedded text and crops badly on mobile.
- The WIE name is repeated too many times before meaningful content begins.
- The local About content is only one sentence.
- Event titles and descriptions are truncated.
- Full event information depends on hover behaviour.
- Event cards do not lead to the existing `/events/:slug` detail pages.
- Missing event banners produce oversized generic placeholders.
- Committee names are cramped or truncated on small screens.
- The Faculty Incharge quotation is hardcoded in the component and has no source field.
- There is no dependable public contact CTA because the WhatsApp field is empty.
- The page contains only three activities although the supplied reports contain many more.

---

## 5. Content strategy

### Primary objective

Make WIE Sahrdaya look **real, active, organised, and contactable** using verified content.

### Secondary objectives

- Make the activity history easy to scan.
- Give strong programmes more prominence than small competitions.
- Preserve all approved activities in a structured archive.
- Make future updates possible through the existing admin and PocketBase system.
- Keep the page credible even when there is no upcoming event.

### Content hierarchy

The page should prioritise information in this order:

1. Identity
2. Local purpose
3. Recent and notable activities
4. Full activity archive
5. Current team
6. Contact and collaboration
7. Optional related stories

### What should not be prioritised

- Large unverified impact counters
- Global WIE history copied onto the page
- Planned events from internal documents
- Long descriptions of IEEE itself
- A gallery with no context
- Sponsor sections when there are no confirmed sponsors
- A “Join WhatsApp” button when there is no approved group link

---

## 6. Recommended public page structure

```text
Navbar

1. WIE identity hero
2. About WIE Sahrdaya
3. What we create opportunities for
4. Featured activity
5. Activity archive: 2024–2026
6. Current WIE team
7. Faculty Incharge
8. Contact and collaboration
9. Related WIE stories, only when available

Existing IEEE Sahrdaya footer
```

### Why this structure fits the original request

The original request is primarily about establishing a web presence from existing reports. Activities therefore need to be one of the first major sections, not buried below decorative statistics or long organisational copy.

The page should still show its current team because leadership confirms that the group is active and gives visitors a real contact path.

---

## 7. Exact first-release copy draft

The final copy should be reviewed by the WIE Chair or Faculty Incharge before publication, but the following is a safe and accurate working draft.

## 7.1 Hero

### Eyebrow

```text
IEEE WOMEN IN ENGINEERING
SAHRDAYA STUDENT BRANCH AFFINITY GROUP
```

### H1

```text
Women in Engineering at Sahrdaya
```

### Introductory line

```text
A student community creating opportunities for technical learning,
leadership, professional growth and collaboration in engineering.
```

### Primary actions

```text
Explore our activities
Meet the team
```

### Conditional contact action

Display a third action only when an approved contact destination exists:

```text
Contact WIE
```

Do not show an empty WhatsApp action.

## 7.2 About WIE Sahrdaya

### Heading

```text
Learning, leading and building together
```

### Draft body

```text
IEEE Women in Engineering is a global network that supports women in
engineering and science and encourages wider participation in STEM.

At Sahrdaya, the WIE Student Branch Affinity Group turns that purpose into
local opportunities. Through technical workshops, talks, hackathons,
professional-development sessions and collaborative activities, the group
helps students explore technology, develop confidence and take part in
meaningful engineering communities.
```

This copy is specific enough to describe the group, while remaining aligned with the official WIE mission.

## 7.3 Focus areas

Use three concise areas rather than a large grid of generic cards.

### Learn through practice

```text
Hands-on workshops and technical activities that help students understand
emerging tools, systems and engineering applications.
```

### Grow as a leader

```text
Sessions on professional identity, entrepreneurship, communication and
leadership beyond the classroom.
```

### Build a community

```text
Collaborative programmes that connect students, mentors, speakers and other
IEEE organisational units.
```

## 7.4 Activities introduction

### Heading

```text
Our activities
```

### Body

```text
From beginner-friendly hackathons and AI workshops to leadership talks and
cyber-awareness programmes, WIE Sahrdaya creates different ways for students
to learn, contribute and collaborate.
```

## 7.5 Team introduction

### Heading

```text
The team behind WIE Sahrdaya
```

### Body

```text
The current office bearers coordinate the group’s programmes, partnerships,
communications and student engagement.
```

## 7.6 Contact section

### Heading

```text
Work with WIE Sahrdaya
```

### Body

```text
For technical sessions, mentorship, student programmes, partnerships and
inter-institution collaborations, reach out to the WIE team.
```

### Actions

Show only populated and approved actions:

```text
Email WIE
Call the Chair
Instagram
LinkedIn
WhatsApp Community
```

---

## 8. Event presentation strategy

The supplied records contain both major programmes and small competitions. Treating them all as identical cards would weaken the page.

### Tier A — Featured programmes

These activities best communicate WIE’s purpose and should receive larger visual treatment:

- WiTech-Ideathon 2026
- Tink Her Hack 3.0
- Gen AI & Prompt Engineering Workshop
- Elevate Her
- Beyond Resume
- RiseHER

### Tier B — Strong supporting activities

These should appear in the archive and may be highlighted when relevant:

- Beyond Business
- Pioneering Safe Cyberspace
- CyberClash
- WIE Climate Innovation Pitch, after full verification
- 5-Day AR/VR Bootcamp, after full verification

### Tier C — Community and creative activities

These remain valuable evidence of engagement but should use smaller archive cards:

- CyberSmart QuizzyStart
- Doodle the Dream
- Sketch Shield
- Gen Z vs Millennials
- Paper Pixels
- Poster Making: Turn Ideas into Art
- Triathlon, after full verification
- Basics of Game Development, after full verification

### Event card content

Every public event card should show:

```text
Title
Date
Category
Short factual summary
Venue/platform, where useful
Status
Image or designed fallback
Link to /events/:slug
```

### Event detail content

The individual event route should hold:

```text
Full title
Start and end date/time
Venue/platform
Organising units
Speaker/guest
Full report summary
Participant information, only after verification
Poster/banner
Photographs, when approved
Tags/categories
Contact or registration state
```

### No hover-only information

Hover may enhance a card visually, but no description, date, speaker, or link may be available only through hover.

---

## 9. Verified and candidate activity inventory

The website request referred to activities from 2024, 2025, and 2026. This section separates records by confidence instead of treating every mention as equally verified.

## 9.1 2026 — already present in PocketBase

### WiTech-Ideathon 2026 — Agentic AI Workshop & Ideathon

**Date:** 11 July 2026  
**Venue:** Computer AI Lab, Sahrdaya College of Engineering and Technology  
**Status:** Completed  
**Media:** Banner available  
**Theme:** Innovation that Cares

The programme included an AI talk and hands-on session by Ajoe Joseph, Google Developer Expert, on building event-driven AI agents using Google Agent Development Kit, together with an innovation-focused ideathon.

**Recommendation:** Use as the first featured event because it is recent, technical, collaborative, and has suitable media.

### Beyond Business — Building a Brand with a Unique Identity

**Date:** 4 July 2026  
**Venue:** Google Meet  
**Status:** Completed  
**Media:** Banner currently missing

A joint WIE Week session with IEEE FISAT SB and the WIE groups of FISAT and Sahrdaya. Bhavana Prakash Menon, Founder of LOUD, spoke about authenticity, storytelling, brand identity and entrepreneurship.

**Recommendation:** Archive as professional growth/entrepreneurship. Add an approved poster before giving it prominent visual placement.

### Gen AI & Prompt Engineering Workshop

**Date:** 9 March 2026  
**Venue:** Decennial Block 3205  
**Status:** Completed  
**Media:** Banner currently missing

A hands-on introduction to Generative AI, machine learning, deep learning, LLMs, tokenisation, Google AI Studio, prompting, hallucinations and bias, led by Sebin Thomas.

**Recommendation:** Feature or strongly highlight after a verified poster or workshop photograph is added.

## 9.2 2026 — internal yearly-plan records, not automatically public

The WIE yearly plan also lists:

- IoT Workshop — Smart Systems for Engineers
- Entrepreneurial Mindset among Women Engineers
- A collaboration activity between WIE student branches

These are planning records. They must not be shown as completed or upcoming unless the WIE team confirms that they are approved and enters them in PocketBase with an appropriate public status.

The Gen AI workshop in the same plan is already completed and present in PocketBase.

## 9.3 2025 — detailed WIE report available

### Tink Her Hack 3.0

**Date:** 1–2 February 2025, pending final date confirmation  
**Format:** Overnight beginner-friendly hackathon  
**Reported local participation:** 64

The report describes a safe, collaborative environment where women with or without prior coding experience worked with mentors to create their first technology projects.

**Recommendation:** Major featured programme. Verify the exact year/date and upload the approved poster and photographs before publication.

### Elevate Her

**Date:** 31 January 2025  
**Time:** 9:00 AM–12:00 PM  
**Venue:** Jasmine Hall  
**Speaker:** Ms. Jyothika Nithin  
**Reported attendance:** 37 IEEE and 15 non-IEEE participants

An inspiring session on breaking barriers, building bridges, leadership and overcoming challenges.

**Recommendation:** Featured professional-development programme.

### Beyond Resume: Crafting Unique Identity as Women in STEM

**Date:** 21 March 2025  
**Time:** 7:00 PM–8:00 PM  
**Platform:** Google Meet  
**Speaker:** Vishnupriya G  
**Reported attendance:** 19 IEEE and 9 non-IEEE participants

The session focused on professional identity, community, connection, collaboration, purposeful contribution and leadership beyond qualifications.

**Recommendation:** Featured professional-growth activity.

### CyberClash: Debate the Digital Dilemma

**Date:** 4 July 2025  
**Time:** 2:30 PM–4:00 PM  
**Format:** Offline debate  
**Reported attendance:** 13 IEEE and 7 non-IEEE participants

Participants debated whether social media is more harmful than helpful, covering misinformation, mental health, privacy, connectivity and digital empowerment.

**Recommendation:** Supporting activity under communication and cyber awareness.

### CyberSmart QuizzyStart

**Date:** 2–3 July 2025  
**Platform:** Google Forms

A quiz on cybersecurity fundamentals, threats, safe internet practices and digital hygiene.

**Data warning:** The report says 51 registered and 26 actively participated, while its IEEE and non-IEEE attendance fields total 37. Do not publish an attendance number until this is resolved.

### Doodle the Dream: AI vs Imagination

**Date:** 15–18 March 2025  
**Platform:** Google Forms  
**Reported attendance:** 21 IEEE and 24 non-IEEE participants

A creative event exploring AI-generated and human-created art, including AI tools and traditional methods.

**Recommendation:** Archive under creative technical awareness.

### Sketch Shield

**Date:** 3–7 July 2025  
**Platform:** Google Forms  
**Theme:** Cyber Guardian — The Protector of Our Online World  
**Reported attendance:** 8 IEEE and 3 non-IEEE participants

A sketching competition combining cyber-awareness themes and visual expression.

**Data warning:** The combined report includes two descriptions of the same event. Import only one canonical record.

### Gen Z vs Millennials: The Great Generation Gap

**Date:** 17–19 March 2025  
**Platform:** Google Forms  
**Reported attendance:** 3 IEEE and 5 non-IEEE participants

An online meme-making activity about generational differences in technology, lifestyle and perspectives.

**Recommendation:** Smaller archive item.

### Paper Pixels

**Date:** Conflicting records: 7 July or 8 July 2025  
**Format:** Offline handmade poster competition  
**Theme:** Cyber Superheroes — Guardians of the Internet

**Data warning:** Resolve the date conflict before publication.

### Pioneering Safe Cyberspace: Bridging Technology and Light for Security

**Date:** 6 July 2025  
**Platform:** Google Meet  
**Speaker:** Ruben Abraham, Security Consultant at Black Duck; Chair, IEEE FNTC Kerala; Treasurer, IEEE ComSoc Kerala Chapter  
**Reported total participation:** 32

A foundational cybersecurity session covering how students can enter the field and how technology secures digital spaces.

**Recommendation:** Strong supporting technical talk.

### Poster Making: Turn Ideas into Art

**Format:** Online poster competition  
**Theme:** Education for All — Knowledge is Power  
**Reported participation:** 8 students

**Recommendation:** Archive only after exact date and canonical event metadata are found.

## 9.4 2024 — annual report records

The 2024 annual report identifies the following WIE activities:

- RiseHER: Inspiring Spotlight — 6 March 2024
- Triathlon — 1 April 2024
- Basics of Game Development — 4 April 2024
- WIE Climate Innovation Pitch — 19 June 2024
- 5-Day AR/VR Bootcamp — beginning 5 August 2024

### RiseHER: Inspiring Spotlight

**Date:** 6 March 2024  
**Time:** 9:00 AM–4:00 PM  
**Goal:** Honour women’s achievements and advance gender equality

The annual report contains a dedicated event report and identifies RiseHER as a WIE activity.

**Recommendation:** Import as a featured historical programme after its poster and photographs are matched to the report.

### Other 2024 records

Triathlon, Basics of Game Development, WIE Climate Innovation Pitch, and the 5-Day AR/VR Bootcamp are confirmed in the annual event list as WIE activities, but their full canonical report sections and media must be matched before import.

### She Leads records

Earlier supplied material referred to She Leads/She Leads 2 and a multi-day programme involving leadership, resume building, AR/VR and cybersecurity. These should remain in the verification queue until the exact source report, dates and official naming are matched. They must not be merged with another 2024 event based only on similarity.

---

## 10. Recommended initial archive

The first release should not wait until every historical record is perfect. It should publish a smaller, high-confidence archive and then expand it.

### Launch set

1. WiTech-Ideathon 2026
2. Gen AI & Prompt Engineering Workshop
3. Beyond Business
4. Tink Her Hack 3.0, after exact date confirmation
5. Elevate Her
6. Beyond Resume
7. Pioneering Safe Cyberspace
8. CyberClash
9. RiseHER, after media matching

### Second import set

1. CyberSmart QuizzyStart, after attendance reconciliation
2. Doodle the Dream
3. Sketch Shield, deduplicated
4. Gen Z vs Millennials
5. Paper Pixels, after date reconciliation
6. Poster Making, after date verification
7. Verified 2024 programmes with full reports

### Why this sequence is appropriate

The launch set demonstrates a balanced history of:

- technical workshops;
- hackathons;
- leadership and professional growth;
- entrepreneurship;
- cybersecurity;
- community engagement.

It avoids allowing several small online competitions to dominate the public impression of WIE.

---

## 11. Data-quality register

No historical event should be imported without checking the following issues.

| Issue | Affected record | Required action |
|---|---|---|
| Participant totals conflict | CyberSmart QuizzyStart | Confirm registrations, active participants, IEEE count and non-IEEE count |
| Date conflict | Paper Pixels | Confirm whether the event was on 7 or 8 July 2025 |
| Duplicate report | Sketch Shield | Create one canonical event record |
| Exact year/date needs confirmation | Tink Her Hack 3.0 | Confirm whether the report belongs to 1–2 February 2025 |
| Incomplete metadata | Poster Making | Confirm event date and organiser details |
| Full report not yet matched | Several 2024 events | Match event-list entries to report pages and media |
| Naming uncertainty | She Leads/She Leads 2 | Identify canonical source and avoid merging unrelated events |
| Attendance embedded in description | Existing 2026 events | Keep text temporarily or add structured fields later |
| Missing media | Beyond Business and Gen AI workshop | Upload approved poster/photo |
| Hardcoded quotation | Faculty Incharge section | Obtain approval or remove the quotation |
| Empty public contact | WIE society record | Add approved email/phone/social destination |
| Banner unsuitable for mobile | WIE society banner | Replace or display as contained artwork instead of cover crop |

### General verification checklist per event

```text
Official title
Correct year
Start date and time
End date and time
Venue or platform
Status
Organising units
Speaker/guest
Short summary
Full report source
Attendance, if published
Poster/banner
Photographs
Category/tags
Canonical slug
```

---

## 12. PocketBase content model

PocketBase remains the only operational source of truth for public WIE data.

### Existing collections

```text
societies
  name
  slug
  bio
  logo
  banner
  chairs
  defaultWhatsappLink
  isHidden

events
  title
  slug
  description
  date
  endDate
  venue
  banner
  society
  status
  contactEmail
  contactPhone
  externalLink
  externalFormUrl
  whatsappLink
  tags
  registeredCount
  checkedInCount

execom
  name
  position
  department
  batch
  order
  photo
  linkedin
  instagram
  email
  phone
  society
```

### Required loader additions

`fetchSocietyData` should include at least:

#### Event fields

```text
slug
tags
contactEmail
contactPhone
externalLink
```

The WIE page needs `slug` to link every event to its existing detail page.

#### Member fields

```text
email
phone
```

These fields should be returned only if they are intentionally used in the public WIE contact design.

### No first-release schema migration is required

A strong first release can be built using fields that already exist.

Historical events should be entered through the current event admin workflow or a reviewed import process. They should not be stored in a second JSON or TypeScript file.

### Optional later schema improvements

Only after the first release, consider additive fields such as:

```text
societies.tagline
societies.publicEmail
societies.publicPhone
societies.advisorMessage

events.speaker
events.eventType
events.ieeeAttendance
events.nonIeeeAttendance
events.gallery
```

These fields would improve editability and reporting, but they are not required to establish the initial web presence.

---

## 13. Content behaviour rules

### Upcoming events

Show an Upcoming section only when PocketBase contains a future WIE event with a public status.

Do not derive upcoming events directly from the yearly-plan document.

### No upcoming event

When no future event exists, the page should naturally lead with recent work. Do not display a large empty “Coming soon” section.

### Featured event

Select the latest completed or published WIE event that has suitable media. This currently resolves to WiTech-Ideathon 2026.

### Event archive

- Sort newest first.
- Allow year filtering when the archive becomes large enough.
- Category filtering is optional for the first release.
- Use stable event-detail links.
- Avoid opening large report text in a hover popup.

### Team

- Sort by meaningful role order, not only raw global `order` values.
- Keep the Faculty Incharge visually distinct from student office bearers.
- Show complete names on mobile.
- Hide empty social/contact actions.

### Contact

The contact section must still work when WhatsApp is empty.

Recommended fallback order:

1. Official WIE email
2. Chair email
3. Chair phone
4. Official WIE Instagram
5. Approved WhatsApp community link

### Quotations

Do not publish a quotation attributed to a person unless:

- the person supplied or approved it; or
- it exists in an approved source.

The current hardcoded Faculty Incharge quotation should be approved, replaced, or removed.

---

## 14. Visual content requirements

This document is content-first, but the content depends on the correct media treatment.

### Hero media

The current banner is a wide graphic with text embedded inside it. Because it crops badly on mobile, choose one of the following:

1. Replace the PocketBase banner with an approved real WIE activity photograph.
2. Use the current artwork as a contained strip that is never cropped.
3. Use a controlled collage of approved WIE photographs with the official WIE logo as a separate HTML/image element.

### Event media

- Use actual posters or photographs supplied by the group.
- Do not generate fake event photographs.
- Do not use generic stock images to represent completed Sahrdaya events.
- Keep poster text readable when the poster itself is shown.
- Use photography rather than posters for wide featured-event surfaces when possible.
- Use a compact designed fallback for missing event images.

### Team photographs

- Use the current approved portraits.
- Preserve natural aspect ratio and avoid aggressive face crops.
- Use consistent framing without changing the person’s appearance.

### Official identity

- Do not distort or redraw the IEEE or WIE logos.
- Maintain clear space and readable contrast.
- Keep WIE as a sub-brand within the existing IEEE Sahrdaya visual system.

---

## 15. Page design direction

### Direction

```text
Editorial WIE inside the IEEE Sahrdaya website
```

### Desired qualities

```text
credible
human
active
clear
```

### Use from the existing site

- Current Navbar and Footer
- IEEE blue as the parent-brand anchor
- Existing Geist typography
- Press Start 2P only for small technical labels
- Existing spacing and responsive conventions
- Existing Framer Motion dependency, used sparingly

### WIE-specific treatment

- Approved WIE purple as an accent
- Real community and event photographs
- A featured-event layout rather than equal cards everywhere
- Editorial section labels and year markers
- Clean white/paper surfaces instead of saturated full-page gradients

### Avoid

- Generic purple AI/SaaS landing-page styling
- Glassmorphism on every section
- Neon/cyberpunk styling
- A separate WIE header or footer
- A hero carousel
- Giant decorative statistics
- Custom cursor interactions
- Essential hover-only information
- AI-generated people
- Every section boxed inside a rounded card

---

## 16. SEO and public credibility

### Suggested metadata

```text
Title:
IEEE Women in Engineering Sahrdaya | Activities and Team

Description:
Explore IEEE Women in Engineering at Sahrdaya, including technical
programmes, leadership initiatives, recent activities and the current WIE team.
```

### Public page title

Use the full identity in the document title and metadata:

```text
IEEE Women in Engineering — Sahrdaya Student Branch Affinity Group
```

### Structured data

Retain Organisation structured data for the WIE group. Event structured data belongs on each `/events/:slug` page.

### Trust signals

The page should visibly provide:

- the official WIE identity;
- connection to IEEE Sahrdaya;
- recent dated activities;
- named office bearers;
- a contact method;
- stable event detail pages.

These are more valuable than unverified marketing counters.

---

## 17. Accessibility and content usability

- One descriptive H1
- Logical heading order
- Full event titles available without hover
- Full committee names available visually and to assistive technology
- Useful image alternative text
- Empty alt text for purely decorative artwork
- Keyboard-accessible event and contact links
- Visible focus state
- No colour-only status labels
- No important content hidden by animation
- Reduced-motion support
- At least approximately 44px touch height for major actions
- No cropped embedded text that becomes unreadable on mobile
- No paragraph text below accessible contrast levels

---

## 18. Recommended code organisation

The current WIE route is too large and duplicates sections from the generic society page. Refactor only as far as useful.

```text
src/routes/societies_.wie.tsx
  meta
  loader
  canonical/schema
  page composition

src/features/societies/wie/WIEPage.tsx
src/features/societies/wie/WIEHero.tsx
src/features/societies/wie/WIEAbout.tsx
src/features/societies/wie/WIEEvents.tsx
src/features/societies/wie/WIETeam.tsx
src/features/societies/wie/WIEContact.tsx
```

A smaller component split is also acceptable. The important rule is to keep route data loading separate from repeated presentation logic.

### Expected first-release source changes

```text
src/routes/societies_.wie.tsx
src/server/public/society-detail.server.ts
src/features/societies/wie/*
src/types/index.ts, only if shared types change
src/features/globals.css, only for reusable WIE tokens/utilities
```

### Content/data work outside source code

```text
PocketBase societies record
PocketBase events records
PocketBase execom records
PocketBase event and team media
```

---

## 19. Implementation sequence

## Phase 1 — Resolve launch content

1. Confirm public WIE email and phone.
2. Confirm whether the Chair’s contact should be primary.
3. Approve or remove the Faculty Incharge quotation.
4. Choose a mobile-safe hero image treatment.
5. Add posters/photos for Beyond Business and Gen AI.
6. Confirm Tink Her Hack 3.0 date.
7. Match RiseHER media.

## Phase 2 — Fix route behaviour

1. Add event slug and required fields to the public society loader.
2. Link every event card to `/events/:slug`.
3. Remove hover-only report behaviour.
4. Implement reliable media fallbacks.
5. Hide empty contact actions.
6. Preserve chair/admin edit controls.

## Phase 3 — Redesign content hierarchy

1. Build concise hero.
2. Add the local About copy.
3. Add three focus areas.
4. Build featured event.
5. Build year-based archive.
6. Rework team and Faculty Incharge sections.
7. Add contact/collaboration CTA.

## Phase 4 — Import verified history

1. Add the launch event set to PocketBase.
2. Upload approved media.
3. Verify generated event detail pages.
4. Resolve conflicting records before second-set import.

## Phase 5 — Test and release

1. Lint
2. Typecheck
3. Unit tests
4. Production build
5. Clean PocketBase smoke tests
6. Playwright E2E
7. Responsive visual review
8. Accessibility review
9. Staging acceptance
10. Production PR and CI-gated deployment

---

## 20. Acceptance criteria

### Content

- [ ] The public page clearly identifies WIE Sahrdaya.
- [ ] No Infinia content appears.
- [ ] No funding-form explanation appears publicly.
- [ ] About copy explains the local group, not only global WIE.
- [ ] Current team details are accurate.
- [ ] A working contact path exists.
- [ ] Every published historical event has a verified source.
- [ ] Conflicting attendance or dates are not published as facts.
- [ ] Planned events are not shown as confirmed.

### Event archive

- [ ] At least the three current 2026 events remain available.
- [ ] The approved launch history is imported.
- [ ] Event cards link to `/events/:slug`.
- [ ] No event details depend on hover.
- [ ] Missing media has a controlled fallback.
- [ ] Duplicate records are removed.

### Team

- [ ] Faculty Incharge is displayed separately.
- [ ] Chair, Vice Chair and Secretary have complete visible names.
- [ ] Empty social links are hidden.
- [ ] Public email/phone is displayed only after approval.
- [ ] No unapproved quotation is attributed to anyone.

### Technical

- [ ] `/societies/wie` returns 200 through SSR.
- [ ] Canonical metadata is correct.
- [ ] WIE remains linked from `/societies`.
- [ ] Public data remains PocketBase-backed.
- [ ] No second event data source is introduced.
- [ ] Chair/admin edit permissions still work.
- [ ] No horizontal overflow at 390px.
- [ ] No console or hydration errors.
- [ ] No serious or critical accessibility violations.
- [ ] CI is green on the exact release candidate.

---

## 21. Inputs still required

These are the only essential inputs that cannot be safely inferred.

### Public contact

```text
Official WIE email:
Primary public phone:
Whose phone is it:
Official WIE Instagram:
WhatsApp community link, if any:
```

### Faculty Incharge

```text
Keep the current quotation: Yes / No
Approved replacement message:
Display email: Yes / No
Display phone: Yes / No
```

### Media

```text
Approved hero image or folder:
Beyond Business poster/photo:
Gen AI workshop poster/photo:
Tink Her Hack poster/photos:
RiseHER poster/photos:
```

### Historical events

```text
Confirm Tink Her Hack year/date:
Confirm Paper Pixels date:
Confirm CyberSmart attendance:
Confirm first 2024 events to import:
Confirm She Leads source/document:
```

---

## 22. Research and source register

### Original requirement

- WhatsApp voice-note transcript supplied in the project conversation, dated 27 June–15 July 2026
- The messages explicitly request a WIE web presence using supplied 2024–2026 activity reports

### Sahrdaya Drive records

- `WIE.docx` — combined 2025 WIE event reports  
  Drive ID: `1PRYJ1K9DL00cJKzP1GJ5oaJNUNHJgK1T`
- `WIE.docx.pdf` — WIE yearly plan 2026  
  Drive ID: `1Rc70iPMG0aqcRu3gkGdBT7YsQepRyENz`
- `ANNUAL REPORT (DESC)` — 2024 Student Branch annual report  
  Drive ID: `1GJdX6Lk-ANckpdZYfv8STmrrsmgDf0Y8qyYFmS8D_RQ`

### Live production data

- `https://ieeesahrdaya.com/api/collections/societies/records`
- `https://ieeesahrdaya.com/api/collections/events/records`
- `https://ieeesahrdaya.com/api/collections/execom/records`
- Audited specifically for WIE society ID `xzuz8gi78qe3b0s`

### Official IEEE WIE references

- IEEE WIE About and Mission  
  `https://wie.ieee.org/about/`
- IEEE WIE Affinity Groups  
  `https://wie.ieee.org/affinity-groups/`
- WIE Student Branch Affinity Groups  
  `https://wie.ieee.org/affinity-groups/wie-student-branch-affinity-groups/`
- Form and Manage a WIE Affinity Group  
  `https://wie.ieee.org/affinity-groups/form-manage/`
- WIE Funding  
  `https://wie.ieee.org/affinity-groups/funding/`
- WIE Special Funding  
  `https://wie.ieee.org/affinity-groups/funding/special-funding-request-form/`
- IEEE WIE Visual Identity Toolkit  
  `https://brand-experience.ieee.org/guidelines/sub-brand-resources/wie/`
- Student Branch Affinity Group of the Year criteria  
  `https://wie.ieee.org/awards/student-branch-affinity/`

### Useful content benchmarks

The official WIE award criteria consider activity quality and quantity, participation, outreach, communication, membership growth, leadership and the group website. This supports a page centred on documented activities, leadership and communication rather than decorative claims.

Other Student Branch WIE websites commonly include About, activities/events, team and contact. These are useful structural references, but the Sahrdaya page must use its own verified records and the existing site design system.

---

## 23. Non-negotiable final summary

```text
Correct repository: Phloraxx/IEEE-sahrdayaCET
Correct route: /societies/wie
Correct backend: existing PocketBase
Correct content period: verified WIE activities from 2024, 2025 and 2026
Correct public purpose: permanent WIE identity, activity record, team and contact
Infinia: excluded
Planned but unconfirmed events: excluded
Invented figures: excluded
Separate website: excluded
```

The most faithful implementation is a polished, activity-led WIE page inside the existing IEEE Sahrdaya website, populated from the current PocketBase collections and expanded with verified historical reports.