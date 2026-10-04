# Infinia immersive rebuild — 4 October 2026

## Intent
Replace the warm-paper editorial page with a technical-festival experience. The RC-car recording becomes the opening focus; footage no longer competes in a triptych. The entire Infinia surface gets a coherent dark graphite, lime, electric-blue and warm amber visual system. Geist stays bundled. Shared global navigation and Footer remain unchanged.

## Reference research and adaptation
Reviewed Awwwards listings and their rendered previews:
- Zentry homepage: https://www.awwwards.com/inspiration/homepage-zentry — prominent graphic typography layered around a dominant moving frame. Adapt the hierarchy and angular frame; do not copy its game imagery, slogans or loading gate.
- ELEMENTIS Innovation Scroll: https://www.awwwards.com/inspiration/innovation-scroll-elementis — sticky visual chapters with readable content and progress. Adapt short pinned scenes and a progress rail. Keep native scrolling, native anchor skips, and all information server-rendered.
- STR8FIRE Cards Grid: https://www.awwwards.com/inspiration/cards-grid-str8fire — shaped media panels and differentiated cards. Adapt workshop lineup cards with real photographs and persistent descriptions, rather than hover-only information.
- Charles Leclerc Homepage Scroll: https://www.awwwards.com/inspiration/homepage-scroll-charles-leclerc — listing confirms hero-video/scroll/transition tags, but the preview was unavailable; no visual implementation claim is based on it.

Technical references: Motion useScroll https://motion.dev/docs/react-use-scroll and HTMLMediaElement.play https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play. Use the existing framer-motion dependency, no added animation package.

## Page sequence and media treatment
1. RC-car introduction (hub and 2024): one native portrait 1080p recording in a prominent frame on graphite, lime typography, event identity and direct programme link. Preserve portrait framing rather than stretching it across an ultrawide background. Short desktop pin; scroll moves the media/frame subtly and fills progress.
2. Expo floor: independent robot-football landscape scene, sourced from IMG_5482.MOV.mp4. SDR-tone-map the real 4K HLG footage to 1920×1080. Description explicitly explains the tabletop robot-football demonstration, 29 September 2024. Blue frame accent.
3. Flight demonstration: native portrait frame, loop only the opening three seconds containing the clear yellow aircraft; not an extended shot of empty sky. Reuse the existing SDR source with a three-second loop boundary because the new Mac export connection timed out. Text and solid colour panel carry the composition independently of sky brightness. 29 September 2024, no unsupported aircraft-type claim.
4. Lantern Fest: native portrait frame showing people releasing the lantern; amber section and restrained light, not a mostly black hero column. 28 September 2024.
5. Edition selector and latest 2025 programme. Clear 2024→2025 boundary. 2025 leaf uses only 2025 photos and does not mount the 2024 video scenes.
6. 2025 overview and report-backed numbers; photo-led workshop lineup; three-day programme; evening photo; speakers; separate Vitals 24 pre-event figures; original posters; year-owned photo gallery; next-edition card.
7. Hub chronology last: Infinia 2.0 2025, TechX Infinia 2024, Altair 2.0 2023, Altair 2022. Actual shared Footer outside the scoped design wrapper.

## Interaction and fallback rules
- Native scrolling, no wheel interception, no forced seek/scrubbing, no loading screen. Frame transforms/progress follow scroll; video plays naturally so decoding/seeking does not gate navigation.
- Desktop sticky scenes are modest (approximately 125–140svh), not multi-screen empty scroll tunnels. Mobile/short-screen/reduced-motion/no-JS layouts remain naturally stacked with no pin distance.
- Only the scene containing the viewport centre may autoplay. Mount sources only after that scene is entered. Pause on departure, tab hiding, user pause or preference change. Handle rejected play promises and resource failures.
- Visible labelled play/pause control for every eligible loop. Pause is remembered for the scene; progress/frame motion also freezes after pause.
- Reduced motion, Save-Data and slow 2G: source-free image fallback. No-JS: complete headings, descriptions, photos, poster links and navigation remain usable.
- Images/videos carry accurate year captions; static fallbacks use the corresponding scene poster. No artificial upscaling. Exports remove audio and source location metadata.
- Workshop details remain native disclosures; media viewers retain accessible full-size display, Escape and focus return. All primary controls >=44px. Poster text remains uncropped.

## Acceptance and release
Lint, typecheck, build, meaningful media lifecycle and preference tests, year/media ownership, native no-JS links, all four timeline editions and shared-footer tests. Check overflow at 320/390/768/1440. Full clean-room PR CI and both Docker images on exact feature head; squash to dev only; verify exact staging checkout/new healthy container; run public read-only browser tests and inspect actual live visuals. Production, notification and payment hashes must remain unchanged, mail mode disabled. No emails, notification retries, registration/payment mutations or production promotion.
