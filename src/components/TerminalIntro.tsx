'use client';

import React, { useState, useEffect } from 'react';

const lines = [
    { text: 'BUILD_VER: 4.0.0', delay: 200 },
    { text: 'PLATFORM: WEB_OS', delay: 600 },
    { text: 'STATUS: ONLINE', delay: 1000 },
    { text: 'TERMINAL: CHECKING', delay: 1400 },
    { text: 'IEEE SAHRDAYA SB // READY', delay: 1800 },
];

export default function TerminalIntro() {
    const [visible, setVisible] = useState(true);
    const [visibleLines, setVisibleLines] = useState<number[]>([]);
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
        lines.forEach((line, i) => {
            setTimeout(() => {
                setVisibleLines(prev => [...prev, i]);
            }, line.delay);
        });

        setTimeout(() => {
            setShowCursor(false);
        }, 2200);

        setTimeout(() => {
            setVisible(false);
        }, 3000);
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
            <div className="font-mono text-green-400 text-sm md:text-base leading-relaxed">
                {lines.map((line, i) => (
                    <div key={i} className="h-5">
                        {visibleLines.includes(i) && (
                            <span>{'> '}{line.text}</span>
                        )}
                    </div>
                ))}
                {showCursor && <span className="animate-pulse">_</span>}
            </div>
        </div>
    );
}
