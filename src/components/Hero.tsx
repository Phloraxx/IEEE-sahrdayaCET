'use client';

import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

export const Hero: React.FC = () => {
    const { scrollY } = useScroll();

    // Scroll Transformations
    // Animation starts after scrolling 300px, closer to when content overlaps
    const scale = useTransform(scrollY, [300, 800], [1, 1.3]);
    const opacity = useTransform(scrollY, [500, 800], [1, 0]);
    const y = useTransform(scrollY, [300, 800], [0, -100]);

    const textVariants = {
        hidden: { y: 50, opacity: 0 },
        visible: (i: number) => ({
            y: 0,
            opacity: 1,
            transition: {
                delay: i * 0.1,
                duration: 0.8,
                ease: [0.2, 0.65, 0.3, 0.9] as const,
            },
        }),
    };

    return (
        <section className="relative h-[100dvh] flex flex-col items-center justify-center z-10 px-4 overflow-hidden">
            {/* Corner Images - Fixed position relative to Hero container, but animating with it if we wrap everything */}
            {/* Actually, they should probably stay fixed on screen until the hero fades out? 
                 The request says "while scrolling from the hero section, show the 'Whats happening' part ... while the hero section moves upward and zooms in ... and then it should vanish."
                 This implies the WHOLE hero section including images might zoom/fade.
             */}

            <motion.div
                style={{ scale, opacity, y }}
                className="w-full h-full flex flex-col items-center justify-center relative"
            >

                <div className="text-center transform translate-y-[-10%]">
                    {/* Main Title Group */}
                    <div className="flex flex-col items-center justify-center gap-2 md:gap-4 mb-8">
                        <motion.h1
                            custom={0}
                            variants={textVariants}
                            initial="hidden"
                            animate="visible"
                            className="font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            IEEE
                        </motion.h1>
                        <motion.h2
                            custom={1}
                            variants={textVariants}
                            initial="hidden"
                            animate="visible"
                            className="font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            SAHRDAYA
                        </motion.h2>
                    </div>

                    {/* Subtitle / Divider */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: 2, duration: 1 }}
                        className="flex items-center justify-center gap-4 md:gap-6 mt-8 md:mt-12"
                    >
                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />

                        <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-gray-600">
                            {["INNOVATE", "CONNECT", "INSPIRE"].map((word, i) => (
                                <motion.span
                                    key={word}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 2.2 + i * 0.3 }}
                                >
                                    {word}.
                                </motion.span>
                            ))}
                        </div>

                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />
                    </motion.div>
                </div>
            </motion.div>
        </section>
    );
};
