'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import pkg from '../../package.json';
const { version } = pkg;

function detectPlatform(): string {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'IOS';
    if (/Android/.test(ua)) return 'ANDROID';
    const p = navigator.platform;
    if (/Win/.test(p)) return 'WIN_OS';
    if (/Mac/.test(p)) return 'MAC_OS';
    if (/Linux/.test(p)) return 'LINUX';
    return 'UNKNOWN';
}

type ConnStatus = 'CHECKING' | 'READY' | 'NO_SIGNAL';

function statusClass(s: ConnStatus): string | undefined {
    if (s === 'CHECKING') return 'text-yellow-400';
    if (s === 'NO_SIGNAL') return 'text-red-400';
    return undefined;
}

export const TechnicalDetails: React.FC = () => {
    const [platform, setPlatform] = useState('WEB_OS');
    const [terminal, setTerminal] = useState<ConnStatus>('CHECKING');

    useEffect(() => {
        setPlatform(detectPlatform());
    }, []);

    useEffect(() => {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), 8000);

        fetch('https://backend.mulearnscet.in', {
            mode: 'no-cors',
            signal: ctrl.signal,
        })
            .then(() => setTerminal('READY'))
            .catch(() => setTerminal('NO_SIGNAL'));

        return () => { clearTimeout(id); ctrl.abort(); };
    }, []);

    return (
        <>
            {/* Top Left */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="absolute top-2 left-6 z-10 hidden md:block"
            >
                <div className="flex items-center gap-3 mb-2">
                    <Image
                        src="/Ieee.svg"
                        alt="IEEE SB Logo"
                        width={128}
                        height={128}
                        className="opacity-80"
                    />
                </div>
                <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ delay: 5, duration: 2 }}
                    className="font-mono text-[10px] text-gray-400 leading-tight"
                >
                    <p>BUILD_VER: {version}</p>
                    <p>PLATFORM: {platform}</p>
                </motion.div>
            </motion.div>

            {/* Top Right */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="absolute top-3 right-6 z-10 hidden md:block text-right"
            >
                <div className="flex flex-col items-end gap-2 mb-2">
                    <Image
                        src="/emblem.png"
                        alt="Sahrdaya Logo"
                        width={64}
                        height={64}
                        className="opacity-80"
                    />
                </div>
            </motion.div>

            {/* Bottom Left */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="absolute bottom-6 left-6 z-10 hidden md:block"
            >
                <p className="font-mono text-[10px] text-gray-400">© 2026 IEEE SAHRDAYA SB</p>
            </motion.div>

            {/* Bottom Right */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="absolute bottom-6 right-6 z-10 hidden md:block text-right"
            >
                <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ delay: 5, duration: 2 }}
                    className="font-mono text-[10px] text-gray-400 leading-tight"
                >
                    <p>
                        TERMINAL: <span className={statusClass(terminal)}>{terminal}</span>
                    </p>
                </motion.div>
            </motion.div>
        </>
    );
};
