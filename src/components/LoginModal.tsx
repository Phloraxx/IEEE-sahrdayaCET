"use client";

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import GoogleLoginButton from './GoogleLoginButton';

function PixelGrid({ grid, size }: { grid: string[][]; size: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grid[0]?.length ?? 0}, ${size}px)`, gap: 0 }}>
      {grid.flatMap((row, y) =>
        row.map((color, x) => (
          <div key={`${x}-${y}`} style={{ width: size, height: size, backgroundColor: color }} />
        ))
      )}
    </div>
  );
}


interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

const PIXEL = 5;

const HEAD: string[][] = [
    ['#00629B','#00629B','#00629B','#00629B','#00629B','#00629B','#00629B','#00629B'],
    ['#00629B','#0099D6','#0099D6','#0099D6','#0099D6','#0099D6','#0099D6','#00629B'],
    ['#00629B','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#00629B'],
    ['#f5d5b8','#f5d5b8','#ffffff','#0099D6','#0099D6','#ffffff','#f5d5b8','#f5d5b8'],
    ['#f5d5b8','#f5d5b8','#f5d5b8','#e8c4a0','#e8c4a0','#f5d5b8','#f5d5b8','#f5d5b8'],
    ['#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8'],
    ['#f5d5b8','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#f5d5b8'],
    ['transparent','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','transparent'],
];

const BODY_PEEK: string[][] = [
    ['transparent','#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c','transparent'],
    ['transparent','#004a7c','#00629B','#ffffff','#ffffff','#00629B','#004a7c','transparent'],
    ['#f5d5b8','#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c','#f5d5b8'],
];


export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    // Focus trap
    useEffect(() => {
      if (!isOpen) return;
      const dialog = dialogRef.current;
      if (dialog) {
        const focusable = dialog.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus();
        } else {
          dialog.focus();
        }
      }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
            onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Tab') {
                    const dialog = dialogRef.current;
                    if (!dialog) return;
                    const focusable = dialog.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const first = focusable[0] ?? null;
                    const last = focusable[focusable.length - 1] ?? null;
                    if (!first || !last) return;
                    if (e.shiftKey) {
                        if (document.activeElement === first) {
                            e.preventDefault();
                            last.focus();
                        }
                    } else {
                        if (document.activeElement === last) {
                            e.preventDefault();
                            first.focus();
                        }
                    }
                }
            }}
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-sm mx-4 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top accent */}
                <div className="h-1 bg-linear-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"
                >
                    <X size={18} />
                </button>

                {/* Content */}
                <div className="px-8 pt-8 pb-6 text-center relative">
                    {/* Mascot peeking from the top-left */}
                    <div
                        className="absolute -top-1 left-6"
                        style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))' }}
                    >
                        <PixelGrid grid={HEAD} size={PIXEL} />
                        <PixelGrid grid={BODY_PEEK} size={PIXEL} />
                    </div>

                    {/* Header */}
                    <div className="mt-12 mb-2">
                        <h2 className="font-pixel text-lg text-gray-900 tracking-tight">
                            SIGN IN
                        </h2>
                    </div>

                    <div className="w-10 h-0.5 bg-ieee-blue mx-auto rounded-full mb-4" />

                    {/* Message */}
                    <p className="text-xs text-gray-500 mb-8 font-sans leading-relaxed">
                        {message || 'Sign in to access society management and event tools.'}
                    </p>

                    {/* Google Sign-in Button */}
                    <GoogleLoginButton variant="full-width" />

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="h-px grow bg-gray-200" />
                        <span className="font-mono text-[9px] tracking-[0.3em] text-gray-400 uppercase">IEEE Sahrdaya</span>
                        <div className="h-px grow bg-gray-200" />
                    </div>

                    {/* Privacy note */}
                    <p className="text-[10px] text-gray-400 font-mono tracking-wider">
                        Secured with OAuth 2.0
                    </p>
                </div>
            </div>
        </div>
    );
}
