'use client';

import React from 'react';

export const DotBackground: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-0">
            <div
                className="absolute inset-0
                    bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.12)_1.5px,transparent_1.5px)]
                    [background-size:32px_32px]
                    dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12)_1.5px,transparent_1.5px)]"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white
                [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black" />
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-repeat"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}
            />
        </div>
    );
};
