"use client";

import React, { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { X } from 'lucide-react';
import AnimatedTick from '@/components/AnimatedTick';

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

const PixelGrid: React.FC<{ grid: string[][]; size: number }> = ({ grid, size }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grid[0].length}, ${size}px)`, lineHeight: 0 }}>
        {grid.flat().map((color, i) => (
            <div
                key={i}
                style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    imageRendering: 'pixelated',
                }}
            />
        ))}
    </div>
);

export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    if (!isOpen) return null;

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await signIn('google', { callbackUrl: window.location.href });
        } catch (error) {
            console.error('Login error:', error);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative w-full max-w-sm mx-4 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top accent */}
                <div className="h-1 bg-gradient-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"
                    disabled={isLoading}
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
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full bg-gray-950 hover:bg-ieee-blue text-white font-mono text-xs tracking-wider uppercase py-3.5 px-6 rounded-lg transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                    <path
                                        fill="#fff"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="#fff"
                                        fillOpacity={0.7}
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="#fff"
                                        fillOpacity={0.5}
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="#fff"
                                        fillOpacity={0.8}
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>

                    {/* Success tick */}
                    {showSuccess && (
                        <div className="mt-6 flex flex-col items-center justify-center gap-3">
                            <AnimatedTick size={96} />
                            <div className="text-sm font-semibold text-green-600">Authenticated</div>
                        </div>
                    )}

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="h-px flex-grow bg-gray-200" />
                        <span className="font-mono text-[9px] tracking-[0.3em] text-gray-400 uppercase">IEEE Sahrdaya</span>
                        <div className="h-px flex-grow bg-gray-200" />
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
