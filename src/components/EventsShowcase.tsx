'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import TransitionLink from '@/components/PageTransition/TransitionLink';

const eventImages = [
    '/Events/503658167_18144990655399954_4943514208253057479_n.webp',
    '/Events/504467036_18054402566594069_4106059723662040073_n.jpg',
    '/Events/506004997_18132492568425776_600388619468309088_n.webp',
    '/Events/522111348_18147650755399954_534418411965373382_n.webp',
    '/Events/525582074_18148493980399954_1932903707501849959_n.webp',
    '/Events/525622064_18148959217399954_6494357511617440071_n.webp',
    '/Events/542326117_17847004371557574_12824648908429865_n.jpg',
];

const scrollingText = [
    'CONFERENCES',
    'LECTURES',
    'WORKSHOPS',
    'HACKATHONS',
    'SEMINARS',
    'WEBINARS',
    'TECH TALKS',
    'BOOTCAMPS',
];

const ImageStrip = () => {
    const stripRef = useRef<HTMLDivElement>(null);
    const offsetRef = useRef(0);
    const rafRef = useRef<number>(0);

    // Triple the images for seamless looping
    const tripled = [...eventImages, ...eventImages, ...eventImages];
    const imageWidth = 280; // width + gap
    const setWidth = eventImages.length * imageWidth;

    useEffect(() => {
        const animate = () => {
            if (!document.hidden) {
                offsetRef.current -= 0.6;
                if (offsetRef.current <= -setWidth) {
                    offsetRef.current += setWidth;
                }
                if (stripRef.current) {
                    stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
                }
            }
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [setWidth]);

    return (
        <div className="overflow-hidden w-full">
            <div
                ref={stripRef}
                className="flex gap-4 will-change-transform"
                style={{ width: `${tripled.length * imageWidth}px` }}
            >
                {tripled.map((src, i) => (
                    <div
                        key={i}
                        className="relative flex-shrink-0 w-[260px] h-[360px] rounded-2xl overflow-hidden shadow-lg"
                    >
                        <Image
                            src={src}
                            alt={`IEEE Event ${(i % eventImages.length) + 1}`}
                            fill
                            sizes="260px"
                            className="object-cover hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

const TextMarquee = () => {
    const stripRef = useRef<HTMLDivElement>(null);
    const offsetRef = useRef(0);
    const rafRef = useRef<number>(0);

    const tripled = [...scrollingText, ...scrollingText, ...scrollingText];
    const charWidth = 350;
    const setWidth = scrollingText.length * charWidth;

    useEffect(() => {
        const animate = () => {
            if (!document.hidden) {
                offsetRef.current -= 1.2;
                if (offsetRef.current <= -setWidth) {
                    offsetRef.current += setWidth;
                }
                if (stripRef.current) {
                    stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
                }
            }
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [setWidth]);

    return (
        <div className="overflow-hidden w-full">
            <div
                ref={stripRef}
                className="flex items-center will-change-transform whitespace-nowrap"
                style={{ width: `${tripled.length * charWidth}px` }}
            >
                {tripled.map((text, i) => (
                    <span key={i} className="flex items-center flex-shrink-0">
                        <span className="text-5xl md:text-7xl lg:text-8xl font-black text-black tracking-tight italic uppercase">
                            {text}
                        </span>
                        <span className="text-ieee-light-blue text-4xl md:text-6xl lg:text-7xl mx-6 md:mx-8 font-bold">
                            •
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
};

export const EventsShowcase: React.FC = () => {
    return (
        <section className="relative py-16 md:py-24 overflow-hidden">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90 z-10 pointer-events-none" />

            {/* Tilted Image Strip */}
            <div
                className="relative z-0 -rotate-3 scale-110 mb-12 md:mb-16"
            >
                <ImageStrip />
            </div>

            {/* CTA Button */}
            <div className="relative z-20 flex justify-center mb-12 md:mb-16">
                <TransitionLink href="/events" className="bg-ieee-blue hover:bg-ieee-light-blue text-white text-sm md:text-base font-bold py-3 px-10 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 uppercase tracking-wider">
                    Explore Events
                </TransitionLink>
            </div>

            {/* Scrolling Text Marquee */}
            <div className="relative z-20">
                <TextMarquee />
            </div>
        </section>
    );
};
