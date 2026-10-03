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
