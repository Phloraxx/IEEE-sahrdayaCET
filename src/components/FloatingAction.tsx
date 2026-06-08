'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

const PIXEL = 3;

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

const CHAR_W = 8 * PIXEL;
const CHAR_H = 17 * PIXEL;
const HEAD_H = 8 * PIXEL;

const ArmRects: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <>
    {[0, 1, 2, 3].map(i => (
      <rect
        key={i}
        x={x}
        y={y + i * PIXEL}
        width={PIXEL * 1.5}
        height={PIXEL}
        fill={i < 2 ? '#00629B' : '#f5d5b8'}
      />
    ))}
  </>
);

const PixelSVG: React.FC<{ grid: string[][]; offsetY?: number }> = ({ grid, offsetY = 0 }) => (
  <g>
    {grid.flatMap((row, y) =>
      row.map((color, x) =>
        color !== 'transparent' ? (
          <rect
            key={`${x}-${y}`}
            x={x * PIXEL}
            y={y * PIXEL + offsetY}
            width={PIXEL}
            height={PIXEL}
            fill={color}
          />
        ) : null
      )
    )}
  </g>
);

export const FloatingAction: React.FC = () => {
  const [posX, setPosX] = useState(80);
  const posXRef = useRef(80);
  const [action, setAction] = useState<IdleAction>('idle');
  const [facingLeft, setFacingLeft] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [walkCycle, setWalkCycle] = useState(0);
  const [lookDir, setLookDir] = useState<'left' | 'center' | 'right'>('center');
  const walkTargetRef = useRef(80);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 120);
    };
    const id = setInterval(blink, 2500 + Math.random() * 3000);
    return () => clearInterval(id);
  }, []);

  const pickAction = useCallback(() => {
    const actions: IdleAction[] = ['idle', 'walking', 'jumping', 'looking', 'crouching', 'headBob'];
    const weights = [25, 35, 10, 15, 8, 7];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen: IdleAction = 'idle';
    for (let i = 0; i < actions.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = actions[i]; break; }
    }
    return chosen;
  }, []);

  const stopWalking = useCallback(() => {
    if (walkIntervalRef.current) {
      clearInterval(walkIntervalRef.current);
      walkIntervalRef.current = null;
    }
  }, []);

  const startWalking = useCallback((targetX: number) => {
    stopWalking();
    walkTargetRef.current = Math.max(5, Math.min(95, targetX));
    setFacingLeft(targetX < posXRef.current);
    walkIntervalRef.current = setInterval(() => {
      const prev = posXRef.current;
      const target = walkTargetRef.current;
      const step = 0.4;
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

  useEffect(() => {
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 4000;
      actionTimeoutRef.current = setTimeout(() => {
        const next = pickAction();
        setAction(next);
        switch (next) {
          case 'walking': {
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

  const getBody = useCallback((): string[][] => {
    const body = BODY.map(row => [...row]);
    if (action === 'walking') {
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
        opacity: 0.75,
      }}
    >
      <motion.svg
        width={CHAR_W}
        height={CHAR_H}
        viewBox={`0 0 ${CHAR_W} ${CHAR_H}`}
        style={{ imageRendering: 'pixelated', display: 'block' }}
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
      >
        <motion.g
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
          style={{ originX: 4 * PIXEL, originY: 4 * PIXEL }}
        >
          <PixelSVG grid={getHead()} />
        </motion.g>

        <g>
          <motion.g
            animate={{ rotate: leftArmAngle }}
            transition={{ duration: 0.15 }}
            style={{ originX: 1.5 * PIXEL, originY: HEAD_H }}
          >
            <ArmRects x={0} y={HEAD_H} />
          </motion.g>

          <motion.g
            animate={{ rotate: rightArmAngle }}
            transition={{ duration: 0.15 }}
            style={{ originX: 8 * PIXEL - 1.5 * PIXEL, originY: HEAD_H }}
          >
            <ArmRects x={8 * PIXEL - 1.5 * PIXEL} y={HEAD_H} />
          </motion.g>

          <PixelSVG grid={getBody()} offsetY={HEAD_H} />
        </g>

        <motion.ellipse
          cx={4 * PIXEL}
          cy={16 * PIXEL + 2}
          rx={3 * PIXEL}
          ry={PIXEL * 0.4}
          fill="rgba(0,0,0,0.12)"
          animate={{
            scaleX: isJumping ? 0.5 : isCrouching ? 1.3 : isWalking ? [0.9, 1.1, 0.9] : 1,
            opacity: isJumping ? 0.1 : 0.2,
          }}
          transition={isWalking ? { repeat: Infinity, duration: 0.3 } : {}}
        />
      </motion.svg>
    </motion.div>
  );
};
