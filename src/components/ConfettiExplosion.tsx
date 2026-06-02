'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
    id: number;
    x: number;
    y: number;
    color: string;
    size: number;
    rotation: number;
    velocityX: number;
    velocityY: number;
}

const COLORS = [
    '#00629B', // IEEE Blue
    '#0099D6', // IEEE Light Blue
    '#FFD700', // Gold
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Sky Blue
    '#96CEB4', // Sage
    '#FFEAA7', // Yellow
];

export default function ConfettiExplosion() {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        // Generate particles
        const newParticles: Particle[] = [];
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            newParticles.push({
                id: i,
                x: 50 + (Math.random() - 0.5) * 20,
                y: 50,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                velocityX: (Math.random() - 0.5) * 30,
                velocityY: Math.random() * -20 - 10,
            });
        }

        setParticles(newParticles);

        // Clear particles after animation
        const timer = setTimeout(() => {
            setParticles([]);
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            <AnimatePresence>
                {particles.map((particle) => (
                    <motion.div
                        key={particle.id}
                        initial={{
                            x: `${particle.x}%`,
                            y: `${particle.y}%`,
                            rotate: 0,
                            opacity: 1,
                            scale: 1,
                        }}
                        animate={{
                            x: `${particle.x + particle.velocityX}%`,
                            y: `${particle.y + particle.velocityY + 100}%`,
                            rotate: particle.rotation * 3,
                            opacity: 0,
                            scale: 0.5,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                            duration: 2 + Math.random(),
                            ease: 'easeOut',
                        }}
                        style={{
                            position: 'absolute',
                            width: particle.size,
                            height: particle.size,
                            backgroundColor: particle.color,
                            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                        }}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}
