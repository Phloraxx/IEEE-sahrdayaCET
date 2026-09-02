# SustainX Event Story

Status: implementation contract for `/events/sustainx`

## Purpose

SustainX is presented as a completed event dossier rather than a conventional registration page or blog article. The route remains the canonical event URL and continues to use the existing PocketBase event record for title, artwork, society linkage, SEO image, structured data and archive discovery.

The page is intended to serve two jobs at once:

1. document that SustainX happened at Sahrdaya;
2. communicate the challenge, participation and winning ideas in a polished public format.

## Verified public facts

- Event: `SustainX: From Street to Smart City`.
- Date: 20 August 2026.
- Host context: IEEE Sahrdaya Student Branch, Sahrdaya College of Engineering & Technology (Autonomous).
- Alignment: UN SDG 11 — Sustainable Cities and Communities.
- Format: three phases — Identify, Innovate, Present.
- Participation: 14 teams.
- Winners: 1st HYDRO, 2nd ZERO POINT2, 3rd UNEMPLOYED.
- Event photographs/video containing participants were approved by the event owner for public use.
- No judge, mentor or coordinator credit block is required.

## Source-derived programme facts

The original programme/grant material describes SustainX as a three-phase innovation challenge centred on real local sustainability problems and practical, low-cost responses aligned with SDG 11. The public page therefore preserves the original phase language rather than replacing it with a generic hackathon narrative.

The documented judging framework totals 100 points:

- sustainability and community impact — 30;
- innovation — 20;
- technical feasibility — 20;
- cost effectiveness — 15;
- presentation clarity — 15.

The proposal contained planning targets that are not treated as post-event facts. In particular, projected participant counts, shortlist counts and grant-budget details are not surfaced as realised outcomes.

## Winners

The winning-project summaries are deliberately short and factual:

- HYDRO — integrated oil/solid-waste management for urban canals and coastal water, combining floating-debris segregation with hair-based oil sorption;
- ZERO POINT2 — accessible, sustainable menstrual-care access;
- UNEMPLOYED — vernacular intelligence for climate-resilient housing and communities.

The page does not claim that an advertised cash prize was actually disbursed because that was not independently established from the supplied post-event evidence.

## Public team index

The public team names are: HYDRO, ZERO POINT2, UNEMPLOYED, URBANOVA, WATTWISE, COMMUTEMATE, BEYOND THE BIN, TEAM FOSS, TITAN, VOIE SÛRE, X-FACTOR, TEAM WASTED, TEAM Z and NIK.

Only team-level information belongs on this public dossier. Email addresses, phone numbers, student identifiers, membership numbers and other registration/submission-sheet personal data are out of scope.

## Visual direction

The post-event page is now event-first rather than poster-first. The visual system still inherits SustainX violet, teal and the split-colour X, but the hero is an immersive photographic/video composition built from approved event media. Campaign artwork is no longer the dominant hero object.

The interaction system follows four rules:

- the hero uses staged media-mask reveals, oversized typography and gentle scroll-linked parallax;
- one functional process marquee bridges the hero and story (`Observe / Build / Test / Pitch / Rethink / Sustain`) rather than using repeated decorative tickers;
- the event gallery is an asymmetric editorial image wall on desktop and a native scroll-snap sequence on mobile, with an accessible fullscreen viewer;
- headings use masked line reveals while body content uses quieter in-view transitions.

All motion degrades under `prefers-reduced-motion`, there is no scroll hijacking, and no information depends on hover.

## Curated media pass

The approved event video has been converted into durable local web assets under `public/media/sustainx/`. The page does not use Google Drive as a runtime media backend. Seven WebP stills document the room, pitches and participant interactions; a short muted WebM/VP9 loop with MP4/H.264 fallback is used only in the hero. The original source video is not committed.

The gallery intentionally uses authentic event imagery rather than stock or generated people. Captions describe moments, not participant identities.

## Awwwards reference pass

The redesign was checked component-by-component against contemporary editorial/event patterns rather than copying a single reference:

- **Hero:** Flashlights (full-screen photo + typography), Baguette Studio (hero scroll animation) and Charles Leclerc (hero video + image transitions) informed the decision to make real event media the canvas and let typography sit over it.
- **Gallery:** Lexus Roundabouts (horizontal photography), Natascha Vavrina (immersive case-study layout + horizontal gallery), Vincent & Dussault (scroll gallery) and LM/AL Portfolio (image reveals) informed the asymmetric desktop wall and mobile scroll-snap treatment.
- **Marquee:** Oaksun Studio's smooth marquee and Stellare Agency's horizontal marquee CTA informed the single semantic process strip. SustainX deliberately uses one marquee only, as connective tissue rather than decoration.
- **Process:** Stellare Agency's process-scroll interaction and Repeat's mixed horizontal/vertical composition informed the oversized phase numbers and long-form vertical sequence without scroll hijacking.
- **Motion:** image masks, restrained scale, masked headline reveals and small parallax shifts are used instead of applying the same fade-up to every element.

The implementation borrows interaction principles, not visual assets or layouts verbatim.
