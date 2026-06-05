'use client';

import React from 'react';

export default function EventsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
                <p className="text-gray-600 mb-6">Failed to load events. Please try again.</p>
                <button
                    onClick={reset}
                    className="bg-ieee-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
