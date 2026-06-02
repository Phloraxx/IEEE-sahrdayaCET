'use client';

import React from 'react';

export const TechnicalDetails: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Circuit board pattern overlay */}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `
                        radial-gradient(circle at 25% 25%, #00629B 1px, transparent 1px),
                        radial-gradient(circle at 75% 75%, #00629B 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px',
                }}
            />
        </div>
    );
};
