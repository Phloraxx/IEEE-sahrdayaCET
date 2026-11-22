import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PixelWordmark } from './PixelWordmark';

/* Identity hero: pixel wordmark straight on the starfield (no card).
   The wordmark itself is built by PixelWordmark from the typeface's own cells,
   so it assembles on load, answers the cursor and comes apart as the programme
   arrives. Under reduced motion no cells are built and the plain headings stay
   in their final state, exactly as before. The section grows instead of
   clipping when the viewport is shorter than the card. */
export const Hero: React.FC = () => {
    const reduceMotion = Boolean(useReducedMotion());
    const wrapRef = useRef<HTMLDivElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const ieeeRef = useRef<HTMLHeadingElement>(null);
    const branchRef = useRef<HTMLHeadingElement>(null);

    return (
        <section className="relative min-h-dvh flex flex-col items-center justify-center z-20 px-4 py-20 sm:py-24 overflow-hidden">
            <div className="w-full h-full flex flex-col items-center justify-center relative">
                <div className="text-center transform translate-y-[-10%]" data-testid="hero-identity">
                    {/* Main Title Group */}
                    <div
                        ref={wrapRef}
                        className="relative inline-flex flex-col items-center justify-center gap-2 md:gap-4 mb-8"
                    >
                        <h1
                            ref={ieeeRef}
                            className="font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            IEEE
                        </h1>
                        <h2
                            ref={branchRef}
                            className="font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            SAHRDAYA
                        </h2>
                        {/* Decorative cell layer, drawn over the headings. */}
                        <div
                            ref={layerRef}
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 z-10"
                        />
                    </div>

                    {/* Subtitle / Divider */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: reduceMotion ? 0 : 2, duration: reduceMotion ? 0 : 1 }}
                        className="flex items-center justify-center gap-4 md:gap-6 mt-8 md:mt-12"
                    >
                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />

                        <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-gray-600">
                            {["INNOVATE", "CONNECT", "INSPIRE"].map((word, i) => (
                                <motion.span
                                    key={word}
                                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: reduceMotion ? 0 : 2.2 + i * 0.3 }}
                                >
                                    {word}.
                                </motion.span>
                            ))}
                        </div>

                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />
                    </motion.div>
                </div>
            </div>

            <PixelWordmark
                reduceMotion={reduceMotion}
                wrapRef={wrapRef}
                layerRef={layerRef}
                ieeeRef={ieeeRef}
                branchRef={branchRef}
            />
        </section>
    );
};
