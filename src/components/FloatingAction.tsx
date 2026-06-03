'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

const PIXEL = 3; // smaller pixel size — background character

// --- IEEE Sahrdaya Engineer Skin (IEEE blue professional look with Sahrdaya touches) ---

// Head: blue engineer cap/hair (IEEE blue), light skin tone, blue eyes
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

// Body: IEEE blue shirt/jersey with white accents
const BODY: string[][] = [
    ['transparent','#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c','transparent'],
    ['transparent','#004a7c','#00629B','#ffffff','#ffffff','#00629B','#004a7c','transparent'],
    ['#f5d5b8','#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c','#f5d5b8'],
    ['#f5d5b8','#004a7c','#004a7c','#0099D6','#0099D6','#004a7c','#004a7c','#f5d5b8'],
    ['transparent','#004a7c','#004a7c','#00629B','#00629B','#004a7c','#004a7c','transparent'],
    ['transparent','#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2c3e50','transparent'],
    ['transparent','#2c3e50','#2c3e50','transparent','transparent','#2c3e50','#2c3e50','transparent'],
    ['transparent','#1a252f','#1a252f','transparent','transparent','#1a252f','#1a252f','transparent'],
];

type IdleAction = 'idle' | 'walking' | 'jumping' | 'looking' | 'crouching' | 'headBob';

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

export const FloatingAction: React.FC = () => {
    const [posX, setPosX] = useState(80); // percentage from left of viewport
    const posXRef = useRef(80);
    const [action, setAction] = useState<IdleAction>('idle');
    const [facingLeft, setFacingLeft] = useState(false);
    const [isBlinking, setIsBlinking] = useState(false);
    const [walkCycle, setWalkCycle] = useState(0); // 0 or 1 for leg swap
    const [lookDir, setLookDir] = useState<'left' | 'center' | 'right'>('center');
    const walkTargetRef = useRef(80);
    const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const walkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- Random blinking ---
    useEffect(() => {
        const blink = () => {
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 120);
        };
        const id = setInterval(blink, 2500 + Math.random() * 3000);
        return () => clearInterval(id);
    }, []);

    // --- Pick a random action every few seconds ---
    const pickAction = useCallback(() => {
        const actions: IdleAction[] = ['idle', 'walking', 'jumping', 'looking', 'crouching', 'headBob'];
        const weights = [25, 35, 10, 15, 8, 7]; // walking most common
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let chosen: IdleAction = 'idle';
        for (let i = 0; i < actions.length; i++) {
            r -= weights[i];
            if (r <= 0) { chosen = actions[i]; break; }
        }
        return chosen;
    }, []);

    // --- Stop walking ---
    const stopWalking = useCallback(() => {
        if (walkIntervalRef.current) {
            clearInterval(walkIntervalRef.current);
            walkIntervalRef.current = null;
        }
    }, []);

    // --- Start walking to a target ---
    const startWalking = useCallback((targetX: number) => {
        stopWalking();
        walkTargetRef.current = Math.max(5, Math.min(95, targetX));
        setFacingLeft(targetX < posXRef.current);

        walkIntervalRef.current = setInterval(() => {
            const prev = posXRef.current;
            const target = walkTargetRef.current;
            const step = 0.4; // slow stroll
            const diff = target - prev;

            if (Math.abs(diff) < step) {
                posXRef.current = target;
                setPosX(target);
                stopWalking();
                setAction('idle');
            } else {
                const nextX = prev + (diff > 0 ? step : -step);
                posXRef.current = nextX;
                setPosX(nextX);
                setWalkCycle(c => (c === 0 ? 1 : 0));
            }
        }, 60);
    }, [stopWalking]);

    // --- Action loop ---
    useEffect(() => {
        const scheduleNext = () => {
            const delay = 2000 + Math.random() * 4000;
            actionTimeoutRef.current = setTimeout(() => {
                const next = pickAction();
                setAction(next);

                switch (next) {
                    case 'walking': {
                        // walk a short distance (5-20% of viewport)
                        const dist = (10 + Math.random() * 15) * (Math.random() > 0.5 ? 1 : -1);
                        startWalking(posXRef.current + dist);
                        break;
                    }
                    case 'jumping':
                        setTimeout(() => setAction('idle'), 500);
                        break;
                    case 'looking': {
                        const dirs: ('left' | 'right')[] = ['left', 'right'];
                        setLookDir(dirs[Math.floor(Math.random() * dirs.length)]);
                        setTimeout(() => { setLookDir('center'); setAction('idle'); }, 1200 + Math.random() * 800);
                        break;
                    }
                    case 'crouching':
                        setTimeout(() => setAction('idle'), 800 + Math.random() * 600);
                        break;
                    case 'headBob':
                        setTimeout(() => setAction('idle'), 1000);
                        break;
                    default:
                        break;
                }

                scheduleNext();
            }, delay);
        };

        scheduleNext();
        return () => {
            if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
            stopWalking();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Dynamic head with blinking + look direction ---
    const getHead = useCallback((): string[][] => {
        const head = HEAD.map(row => [...row]);
        if (isBlinking) {
            head[3][2] = '#f5d5b8'; head[3][3] = '#f5d5b8';
            head[3][4] = '#f5d5b8'; head[3][5] = '#f5d5b8';
        } else if (lookDir === 'left') {
            head[3][2] = '#0099D6'; head[3][3] = '#ffffff';
            head[3][4] = '#0099D6'; head[3][5] = '#ffffff';
        } else if (lookDir === 'right') {
            head[3][2] = '#ffffff'; head[3][3] = '#0099D6';
            head[3][4] = '#ffffff'; head[3][5] = '#0099D6';
        }
        return head;
    }, [isBlinking, lookDir]);

    // --- Dynamic body with walking legs ---
    const getBody = useCallback((): string[][] => {
        const body = BODY.map(row => [...row]);
        if (action === 'walking') {
            // Alternate leg positions for walk cycle
            if (walkCycle === 0) {
                body[6] = ['transparent','#2c2c54','#2c2c54','#2c2c54','transparent','transparent','#2c2c54','transparent'];
                body[7] = ['transparent','#1a1a2e','transparent','transparent','transparent','transparent','#1a1a2e','transparent'];
            } else {
                body[6] = ['transparent','#2c2c54','transparent','transparent','#2c2c54','#2c2c54','transparent','transparent'];
                body[7] = ['transparent','transparent','transparent','#1a1a2e','transparent','transparent','transparent','transparent'];
            }
        }
        return body;
    }, [action, walkCycle]);

    const isWalking = action === 'walking';
    const isJumping = action === 'jumping';
    const isCrouching = action === 'crouching';
    const isHeadBob = action === 'headBob';

    // Arm swing during walk
    const leftArmAngle = isWalking ? (walkCycle === 0 ? 20 : -20) : 0;
    const rightArmAngle = isWalking ? (walkCycle === 0 ? -20 : 20) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 3, duration: 0.8 }}
            className="fixed bottom-2 z-30 pointer-events-none select-none"
            style={{
                left: `${posX}%`,
                transform: 'translateX(-50%)',
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))',
                imageRendering: 'pixelated',
                opacity: 0.75,
            }}
        >
            {/* Whole character */}
            <motion.div
                animate={{
                    y: isJumping ? -14 : isCrouching ? 4 : 0,
                    scaleY: isCrouching ? 0.85 : 1,
                    scaleX: facingLeft ? -1 : 1,
                }}
                transition={
                    isJumping
                        ? { type: 'spring', stiffness: 500, damping: 14 }
                        : { type: 'spring', stiffness: 300, damping: 20 }
                }
                style={{ originY: 1 }}
            >
                {/* Head */}
                <motion.div
                    animate={
                        isHeadBob
                            ? { rotate: [0, -6, 6, -4, 0] }
                            : isWalking
                                ? { y: [0, -0.5, 0, 0.5, 0] }
                                : {}
                    }
                    transition={
                        isHeadBob
                            ? { duration: 1, ease: 'easeInOut' }
                            : isWalking
                                ? { repeat: Infinity, duration: 0.3 }
                                : {}
                    }
                >
                    <PixelGrid grid={getHead()} size={PIXEL} />
                </motion.div>

                {/* Body with arms */}
                <div className="relative">
                    {/* Left arm */}
                    <motion.div
                        className="absolute"
                        style={{ left: -PIXEL * 1.5, top: 0, transformOrigin: 'top center' }}
                        animate={{ rotate: leftArmAngle }}
                        transition={{ duration: 0.15 }}
                    >
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                style={{
                                    width: PIXEL * 1.5,
                                    height: PIXEL,
                                    backgroundColor: i < 2 ? '#00629B' : '#f5d5b8',
                                }}
                            />
                        ))}
                    </motion.div>

                    {/* Right arm */}
                    <motion.div
                        className="absolute"
                        style={{ right: -PIXEL * 1.5, top: 0, transformOrigin: 'top center' }}
                        animate={{ rotate: rightArmAngle }}
                        transition={{ duration: 0.15 }}
                    >
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                style={{
                                    width: PIXEL * 1.5,
                                    height: PIXEL,
                                    backgroundColor: i < 2 ? '#00629B' : '#f5d5b8',
                                }}
                            />
                        ))}
                    </motion.div>

                    <PixelGrid grid={getBody()} size={PIXEL} />
                </div>
            </motion.div>

            {/* Shadow on the ground */}
            <motion.div
                animate={{
                    scaleX: isJumping ? 0.5 : isCrouching ? 1.3 : isWalking ? [0.9, 1.1, 0.9] : 1,
                    opacity: isJumping ? 0.1 : 0.2,
                }}
                transition={isWalking ? { repeat: Infinity, duration: 0.3 } : {}}
                style={{
                    width: PIXEL * 6,
                    height: PIXEL * 0.8,
                    backgroundColor: 'rgba(0,0,0,0.12)',
                    borderRadius: '50%',
                    margin: '2px auto 0',
                }}
            />
        </motion.div>
    );
};