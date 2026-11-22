# Flagship stories — staging
## Scope and structure
- User identifies Infinia and Altair as IEEE Sahrdaya SB flagships.
- /flagships is a permanent public hub; /flagships/infinia and /flagships/altair tell each programme's story, latest edition first.
- Desktop primary navigation and mobile More expose Flagships; nested routes retain the active state. Keep the four-item mobile dock.
- SSR editorial content has no backend dependency. Existing event registrations, payments, notification delivery and certificates remain in their current lifecycle.
- This change is staging-only. Never send, queue, retry or resend emails. MAIL_DELIVERY_MODE remains disabled. Do not publish private response sheets, member IDs, budgets, committee contacts or restricted videos.

## Evidence boundaries
- Infinia 2024: completed INFINIA-SUMMARY.docx, Drive ID 1tPdbzJp3D-w1GTaGD1seqXkRMZoLpSNp. Completed dates 27–29 September 2024, nine workshop topics, hackathon, expos, outreach and cultural programme.
- Infinia 2025: completed Annual Report 2025, native Doc 1OCLVCE56xV_QSX8oMqkqSw_hX6I0ERnYvmBhnkiqWNY. Completed dates 26–28 September 2025. Six workshops AEGIS, UIXOR, HOVERX, QBIT, IONIX and AXIOM plus panel, expos, drone pilot experience, AI healthcare and culture.
- Altair 2022: ALTAIR REPORT.docx, Drive ID 1dbjTPyKw5rdY1rxJmQsXo6Sw9_b32IaZ. Completed sessions 11–13 November 2022 and four workshop tracks.
- Altair 2.0: 2023 brochure PDF, Drive ID 1uvS2g4RH2Ere1asI_KsfNMR3_KLU9Jfp. Only programme-level claims. Do not infer full event dates from its October 1 workshop date; do not call advertised sessions completed outcomes.
- No attendance headline: 2024 Infinia and 2022 Altair documents disagree internally on totals. Session participation is not unique event attendance.
- No award claims until original award certificates or authoritative records confirm exact titles.
- Keep the programmes distinct; sources do not establish a rebranding or successor relationship.
- Existing public 2024 recap verified on staging: /blog/event-recap-techx-infinia-2024-where-imagination-meets-technology. No speculative recap slugs.

## Media provenance
Only selected publicity/report media, copied for the authorised staging preview. Drive permissions and originals are unchanged. Do not treat broad folder access as blanket public permission. Review selected media before any production promotion.
- infinia-2025-community.webp: 2025 Infinia inauguration folder, P2285912.JPG, Drive file 1oj5FCV_guUVk9N56O4GYMWQ0Xd1ItIvg.
- infinia-2025-uixor.webp: 2025 UI/UX workshop folder, P2286490.JPG, Drive file 1xsw-brDMOwM-m_66RcaWHo8uxacmLDCz.
- altair-2022-inauguration.webp: embedded word/media/image2.jpeg in the completed Altair 2022 report.
- altair-2022-leadership.webp and altair-2022-managerial.webp: embedded image4.jpeg and image5.jpeg publicity posters, visibly labelled programme archive rather than event photographs.
- WebP derivatives preserve content/aspect, remove EXIF and reduce file size; captions identify edition and context. No artificial event imagery. Five files total approximately 438 KB.
- Preserve homepage's handpicked photo set and hero.

## Acceptance
Lint, typecheck, unit suite and production build; full PR backend/browser/container CI; exact-head merge to dev and CI/CD verification. Safe public checks only on real staging.
Browser coverage: SSR/no-JS hub-to-story and cross-story navigation; canonical metadata and missing-slug 404; loaded genuine media, 44px links and no overflow at 320/390/768/1440; mobile More route/focus/active state; native edition anchors clear fixed navbar; verified recap reachable.
Read-only protected-state audit: staging mail mode disabled, notification/payment/registration table hashes and accurate counters unchanged; production revision unchanged.

Local validation: 420 unit tests pass, three environment font tests skipped; lint/typecheck/build pass. Visual inspection of hub desktop/mobile, Infinia desktop and Altair mobile confirms real media, readable story hierarchy and no content clipping. Navigation test additionally covers Escape focus after client navigation; More explicitly restores the current trigger after a page-shell replacement. Initial local navigation checks required a disposable PocketBase instance because no backend was listening on localhost:8090; real staging data was never seeded or mutated.

Full CI regression: 133 browser checks passed, but the existing no-JavaScript policy anchor reload assertion failed. Reproduction measured a 325px change when native details reset from expanded to collapsed while Chromium retained the former pixel scroll position. The mobile policy contents now use a stable, compact visible link grid. This keeps full section labels and 44px targets, avoids disclosure reflow on reload, and retains the original anchor-reload assertion. Desktop contents are unchanged.

## Separate flagship editions (3 October 2026)

The public flagship hub now presents Altair (2022), Altair 2.0 (2023), TechX Infinia (2024), and Infinia 2.0 (2025) as distinct chapters in a latest-first timeline (2025 → 2024 → 2023 → 2022). Stable edition URLs use `/flagships/:slug/:year`; parent programme histories remain at `/flagships/infinia` and `/flagships/altair`. Edition content is shared from the existing typed, source-backed editorial archive. Unknown programme/year combinations return 404. Production sitemap includes all edition leaves; staging stays noindex.

Altair 2.0 is a brochure-derived programme archive. No inferred completion date, attendance or award was added. Photography is confined to the year it documents. Existing event, registration, payment and notification data and delivery flows are untouched.

## Latest-first archive and richer stories (4 October 2026)

The hub and its year navigation now run 2025 → 2024 → 2023 → 2022. Start with Infinia 2.0, followed by TechX Infinia, Altair 2.0 and Altair. All four leaf stories retain independent URLs, source-backed copy and genuine cover photos. The typed edition record explicitly owns its gallery; leaf routes never inherit the parent programme's mixed-year gallery. Parent archives can show multiple years with explicit captions.

Completed reports supply the 2022/2024 day-by-day narratives and the 2025 workshop examples (Figma flows/wireframes, Verilog/Basys 3 examples, drone dynamics, a Hyundai EV demonstration and diagnostics). The 2023 brochure supplies announced workshop trainers and sessions; 2023 media supplies only observable photographic context. October 1/2 photo timestamps are not used to infer the event's full dates or validate all advertised outcomes. No attendance, award or successor claims were added.

### Newly selected image provenance

| Derivative | Drive original | Evidence and framing |
| --- | --- | --- |
| altair-2022-community.webp | IMG_0388.JPG, 1hjPSKumyAnJ0x51n1Je6G2-hf6BBL_ZR | Altair 2022 Day 3 media folder 1lmUi3kR9ewOLC1VS1YTL2P4pWzC8yUG0; source EXIF DateTime 13 November 2022. Campus group with ALTAIR letters; no identity assumptions. |
| altair-2023-audience.webp | IMG_5173.HEIC, 1MKiILlajQtYhxVw0N97h8O4CyrDHhjlJ | Altair 2023 Media/Rahul archive; visible Altair 2.0 stage display; no exact capture date asserted. |
| altair-2023-teamwork.webp | IMG_5232.JPG, 1q2tKWTkfWfPj6Z9e55GNduY88wRO-_U8 | Same 2023 photo archive; EXIF capture 1 October 2023; group activity only, no unverified trainer or workshop identification. |
| altair-2023-conversations.webp | IMG_5274.JPG, 1BR-tTi3GGhukjehTtAbcRY7m2PQklMyI | Same 2023 photo archive; EXIF capture 2 October 2023; speakers not identified from appearance. |
| infinia-2024-community.webp | P2239317.JPG, 1vcFlqheHVoNzbcqF9by9DxJrR-hYJaIJ | 2024 Infinia group-photo folder; EXIF capture 29 September 2024. |
| infinia-2024-robotics.webp | IMG-20241006-WA0059.jpg, 1vXQXifjYWfa98dLXkM-yX3ViS14nRWRH | 2024 ROBOTICS EXPO folder; filename reflects a later share date, so no exact capture date asserted. |
| infinia-2025-expo.webp | P2297438.JPG, 1CdMrDIkkHUlqLP4OJrkqTT6ao9EYSEMb | Infinia 2025 EXPO folder; EXIF capture 28 September 2025; caption describes the visible demonstration without assigning an unverified exhibit. |

Seven new WebP derivatives total approximately 1.14 MB. Orientation is corrected from EXIF before export; private EXIF is removed. Covers retain full framing, and portrait gallery images use contain rather than face-cropping. All transfer hashes were verified. Original Drive items and permissions are untouched. No named participant certificates, private response sheets, AppleDouble resource files or restricted videos are included. All media remains within the authorised staging preview pending any production media review.

Acceptance additionally checks newest-first DOM order, correct-year social covers and at least two genuine/labelled images per edition leaf, with no cross-year gallery leakage.

Current change validation: lint/typecheck/build passed; 420 unit tests passed with three local font-environment skips. Nine focused browser checks passed across 320/390/768/1440px, including no-JavaScript descending timeline navigation, canonical/social metadata and correct-year galleries. Desktop/mobile hub captures and Altair 2.0 portrait gallery were visually inspected. Exact-head full PR CI and live staging validation remain required before completion.
