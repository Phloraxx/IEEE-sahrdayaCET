import React from 'react';
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";

/* Identity hero: pixel wordmark straight on the starfield (no card).
   Scroll-linked parallax stays out so the section honours reduced-motion
   architecture rules, and the hero text is never hidden behind an animation.

   Performance: the wordmark used to be a framer-motion element whose start
   state was transparent, so the server shipped invisible text and the largest
   heading on the page only appeared after the route's JavaScript had hydrated
   and animated in. On a cold 1.6 Mbps/4x-CPU phone that made hydration the
   LCP.

   The identity now paints immediately: the wordmark has no starting opacity
   of 0, in JS or in CSS. Only the subordinate rows move — the tagline and the
   three words rise into place — and they do it with a transform that starts
   opaque, so even the first frame shows real text rather than a blank card.
   The motion is a CSS animation (`hero-reveal` in globals.css) that runs from
   first paint with no JavaScript; `prefers-reduced-motion` shows the final
   state. The reduced-motion hook stays part of this component's contract even
   though the reveal no longer waits for hydration. */

/** Ease [0.2, 0.65, 0.3, 0.9] — the original framer-motion curve. */
const EASE = "cubic-bezier(0.2, 0.65, 0.3, 0.9)";

/** The stagger, in seconds, for the subordinate rows. */
const REVEAL = {
  tagline: { delay: 0.4, distance: 12 },
  firstWord: { delay: 0.55, distance: 8 },
  wordStagger: 0.12,
} as const;

function riseStyle(delay: number, distance: number): React.CSSProperties {
  return {
    animation: `hero-reveal 0.6s ${EASE} ${delay}s both`,
    "--hero-reveal-shift": `${distance}px`,
  } as React.CSSProperties;
}

export const Hero: React.FC = () => {
  // Kept for the reduced-motion contract: the reveal is CSS, so this does not
  // gate the server markup, and the star layers read the same preference.
  useHydratedReducedMotion();

  return (
    <section className="relative min-h-dvh flex flex-col items-center justify-center z-20 px-4 py-20 sm:py-24 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.35)_40%,rgba(243,244,239,0)_72%)]"
      />
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <div className="text-center transform translate-y-[-10%]" data-testid="hero-identity">
          {/* Main Title. No `data-hero-reveal` and no opacity animation: this is
              the LCP element and it is painted at full opacity with the first
              frame of the document. Static CSS textShadow restores stepped depth
              without delaying first paint. */}
          <div className="flex flex-col items-center justify-center gap-2 md:gap-4 mb-8">
            <h1
              className="font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue tracking-tighter"
              style={{ textShadow: "3px 3px 0px rgba(0, 98, 155, 0.22), 6px 6px 0px rgba(15, 23, 42, 0.08)" }}
            >
              IEEE
            </h1>
            <h2
              className="font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 tracking-tighter"
              style={{ textShadow: "3px 3px 0px rgba(15, 23, 42, 0.16), 6px 6px 0px rgba(15, 23, 42, 0.06)" }}
            >
              SAHRDAYA
            </h2>
          </div>

          {/* Subtitle / Divider: subordinate, so it may move into place. It
              rises from 12px and is opaque throughout; the row itself keeps
              the 0.7 opacity the composition has always had. */}
          <div
            data-hero-reveal
            style={riseStyle(REVEAL.tagline.delay, REVEAL.tagline.distance)}
            className="flex items-center justify-center gap-4 md:gap-6 mt-8 md:mt-12 opacity-70"
          >
            <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />

            <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-gray-600">
              {["INNOVATE", "CONNECT", "INSPIRE"].map((word, index) => (
                <span
                  key={word}
                  data-hero-reveal
                  style={riseStyle(REVEAL.firstWord.delay + index * REVEAL.wordStagger, REVEAL.firstWord.distance)}
                >
                  {word}.
                </span>
              ))}
            </div>

            <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
};
