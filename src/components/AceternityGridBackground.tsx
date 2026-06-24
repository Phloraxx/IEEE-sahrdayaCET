'use client';

import React from 'react';

export const AceternityGridBackground: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-0">
            {/* Grid lines: vertical + horizontal via linear-gradient */}
            <div
                className="absolute inset-0
                    bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)]
                    [background-size:40px_40px]
                    dark:bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]"
            />
            {/* Radial mask to fade grid toward edges */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white
                [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black" />
        </div>
    );
};
