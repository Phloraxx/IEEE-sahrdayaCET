'use client';

import React, { useEffect, useRef } from 'react';

export const GridBackground: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let rafId: number | null = null;
        let pendingX = 0;
        let pendingY = 0;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const { left, top } = containerRef.current.getBoundingClientRect();
            pendingX = e.clientX - left;
            pendingY = e.clientY - top;

            // Only schedule a new RAF if one isn't already queued
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    if (containerRef.current) {
                        containerRef.current.style.setProperty('--mouse-x', `${pendingX}px`);
                        containerRef.current.style.setProperty('--mouse-y', `${pendingY}px`);
                    }
                    rafId = null;
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 pointer-events-none z-0"
        >
            {/* Base clean grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:40px_40px]" />
            
            {/* Spotlight revealed darker grid */}
            <div className="absolute inset-0 grid-bg opacity-50" />
            
            {/* Noise overlay for texture */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-repeat" 
                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />
        </div>
    );
};