'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import pkg from '../../package.json';
const { version } = pkg;

export const TechnicalDetails: React.FC = () => {
    return (
        <>
            {/* Top Left - IEEE Logo */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="absolute top-2 left-6 z-10 hidden md:block"
            >
                <Image
                    src="/Ieee.svg"
                    alt="IEEE SB Logo"
                    width={128}
                    height={128}
                    className="opacity-80"
                />
            </motion.div>

            {/* Top Right - Sahrdaya Emblem */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="absolute top-3 right-6 z-10 hidden md:block text-right"
            >
                <Image
                    src="/emblem.png"
                    alt="Sahrdaya Logo"
                    width={64}
                    height={64}
                    className="opacity-80"
                />
            </motion.div>

            {/* Bottom Right - BUILD_VER */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="absolute bottom-6 right-6 z-10 hidden md:block text-right"
            >
                <p className="font-mono text-[10px] text-gray-400">BUILD_VER: {version}</p>
            </motion.div>

            {/* Bottom Left - Copyright */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="absolute bottom-6 left-6 z-10 hidden md:block"
            >
                <p className="font-mono text-[10px] text-gray-400">© 2026 IEEE SAHRDAYA SB</p>
            </motion.div>
        </>
    );
};
