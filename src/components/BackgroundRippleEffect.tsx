'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface RippleProps {
    className?: string;
}

export function BackgroundRippleEffect({ className }: RippleProps) {
    const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const nextId = useRef(0);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update CSS custom properties for the hover gradient
        container.style.setProperty('--mouse-x', `${x}px`);
        container.style.setProperty('--mouse-y', `${y}px`);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const id = nextId.current++;
        setRipples((prev) => [...prev, { x, y, id }]);

        // Remove ripple after animation
        setTimeout(() => {
            setRipples((prev) => prev.filter((r) => r.id !== id));
        }, 1000);
    }, []);

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            className={`absolute inset-0 overflow-hidden ${className ?? ''}`}
            style={{
                '--mouse-x': '50%',
                '--mouse-y': '50%',
            } as React.CSSProperties}
        >
            {/* Grid of boxes */}
            <div className="absolute inset-0 grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] grid-rows-[repeat(auto-fill,minmax(40px,1fr))]">
                {Array.from({ length: 200 }).map((_, i) => (
                    <div
                        key={i}
                        className="border border-neutral-200/50 dark:border-neutral-800/50 transition-colors duration-300"
                        style={{
                            background: `radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(0,98,155,0.15) 0%, transparent 60%)`,
                        }}
                    />
                ))}
            </div>

            {/* Click ripples */}
            {ripples.map((ripple) => (
                <motion.div
                    key={ripple.id}
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 4, opacity: 0 }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="absolute pointer-events-none"
                    style={{
                        left: ripple.x - 50,
                        top: ripple.y - 50,
                        width: 100,
                        height: 100,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(0,98,155,0.3) 0%, transparent 70%)',
                    }}
                />
            ))}
        </div>
    );
}
