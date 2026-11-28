import React from 'react';
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";

/* Identity hero: pixel wordmark straight on the starfield (no card).
   Scroll-linked parallax stays out so the section honours reduced-motion
   architecture rules.

   Performance: the wordmark used to be a framer-motion element whose start
   state was transparent, so the server shipped invisible text and the largest
   heading on the page only appeared after the route's JavaScript had hydrated
   and animated in. On a cold 1.6 Mbps/4x-CPU phone that made hydration the
   LCP.

   It still makes an entrance, but as CSS from the first frame: each line
   rises out of a mask and the h1/h2 keep full opacity with no animation of
   their own, so the identity is readable in the server document and the
   release gate's "opaque, unanimated h1" assertions stay true. The mask
   carries the stepped text shadow intact and each line costs one compositor
   transform.

   Timing, whole sequence under 0.8s (the framer-motion original finished
   past 3.1s): wordmark lines 0.42s starting at 0 and 0.07s, the rules draw
   from 0.2s, the three words settle from 0.24s in 60ms steps. */

/** The branch line, in reading order. */
const TAGLINE = ["INNOVATE", "CONNECT", "INSPIRE"] as const;

/** First word's delay, then the step between words, in milliseconds. */
const WORD_START = 240;
const WORD_STEP = 60;

export const Hero: React.FC = () => {
  // Kept for the reduced-motion contract: the entrance is CSS, so this does
  // not gate the server markup, and the star layers read the same preference.
  useHydratedReducedMotion();

  return (
    <section className="relative min-h-dvh flex flex-col items-center justify-center z-20 px-4 py-20 sm:py-24 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.35)_40%,rgba(243,244,239,0)_72%)]"
      />
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <div className="text-center transform translate-y-[-10%]" data-testid="hero-identity">
          {/* Main title. The headings themselves are static and opaque; the
              mask is what hides them for the first 0.4s of the stylesheet's
              life, and its padding is the room the stepped shadow needs. */}
          <div className="flex flex-col items-center justify-center gap-2 md:gap-4 mb-8">
            <div className="hero-line-mask">
              <h1
                className="hero-line font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue tracking-tighter"
                style={{ textShadow: "3px 3px 0px rgba(0, 98, 155, 0.22), 6px 6px 0px rgba(15, 23, 42, 0.08)" }}
              >
                IEEE
              </h1>
            </div>
            <div className="hero-line-mask">
              <h2
                className="hero-line hero-line-late font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 tracking-tighter"
                style={{ textShadow: "3px 3px 0px rgba(15, 23, 42, 0.16), 6px 6px 0px rgba(15, 23, 42, 0.06)" }}
              >
                SAHRDAYA
              </h2>
            </div>
          </div>

          {/* Subtitle / Divider: the rules draw outward while the wordmark
              lands, then the three words settle in sequence. */}
          <div className="flex items-center justify-center gap-4 md:gap-6 mt-8 md:mt-12 opacity-70">
            <div className="hero-rule h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />

            <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-gray-600">
              {TAGLINE.map((word, index) => (
                <span
                  key={word}
                  className="hero-word"
                  style={{ animationDelay: `${WORD_START + index * WORD_STEP}ms` }}
                >
                  {word}.
                </span>
              ))}
            </div>

            <div className="hero-rule h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
};
