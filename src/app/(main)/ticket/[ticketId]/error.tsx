'use client';

import React from 'react';
import Link from 'next/link';

export default function TicketError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Ticket not found</h2>
                <p className="text-gray-600 mb-6">Unable to load ticket details. Please try again.</p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="bg-ieee-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
                    >
                        Try again
                    </button>
                    <Link
                        href="/events"
                        className="bg-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                    >
                        Back to Events
                    </Link>
                </div>
            </div>
        </div>
    );
}
