'use client';

import React from 'react';
import Link from 'next/link';
import { Ticket, ArrowUp } from 'lucide-react';

export const FloatingAction: React.FC = () => {
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
            <button
                onClick={scrollToTop}
                className="bg-white text-gray-700 p-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-200"
                aria-label="Scroll to top"
            >
                <ArrowUp className="w-5 h-5" />
            </button>
        </div>
    );
};
