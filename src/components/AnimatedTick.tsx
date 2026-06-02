"use client";

import React from 'react';
import { motion } from 'framer-motion';

export default function AnimatedTick({ size = 96 }: { size?: number }) {
    const viewBox = 48;
    const stroke = 3;
    return (
        <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="flex items-center justify-center"
        >
            <svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`} fill="none" xmlns="http://www.w3.org/2000/svg">
                <motion.circle
                    cx={viewBox / 2}
                    cy={viewBox / 2}
                    r={(viewBox - stroke) / 2}
                    stroke="#34D399"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6 }}
                />
                <motion.path
                    d="M14 25 L21 31 L35 17"
                    stroke="#059669"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.35, duration: 0.45 }}
                />
            </svg>
        </motion.div>
    );
}
