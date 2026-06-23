'use client';

import React from 'react';

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

const CHAR_W = 8 * PIXEL;
const CHAR_H = 17 * PIXEL;
const HEAD_H = 8 * PIXEL;

const ArmRects: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <>
    {[0, 1, 2, 3].map(i => (
      <rect
        key={i}
        x={x + 0.5 * PIXEL}
        y={y + i * PIXEL + 1}
        width={PIXEL}
        height={PIXEL}
        fill="#f5d5b8"
      />
    ))}
  </>
);

const PixelSVG: React.FC<{ grid: string[][]; offsetY?: number }> = ({ grid, offsetY = 0 }) => (
  <g>
    {grid.map((row, y) =>
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
        ) : null,
      ),
    )}
  </g>
);

export const FloatingAction: React.FC = () => (
  <div
    className="ieee-floating-character"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '16px',
        zIndex: 30,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))',
        opacity: 0.6,
      }}
  >
    <svg
      width={CHAR_W}
      height={CHAR_H}
      viewBox={`0 0 ${CHAR_W} ${CHAR_H}`}
      style={{ imageRendering: 'pixelated', display: 'block' }}
      className="ieee-floating-character-svg"
    >
      <g>
        <g>
          <ArmRects x={0} y={HEAD_H} />
        </g>
        <g>
          <ArmRects x={8 * PIXEL - 1.5 * PIXEL} y={HEAD_H} />
        </g>
        <PixelSVG grid={HEAD} />
        <PixelSVG grid={BODY} offsetY={HEAD_H} />
      </g>
      <ellipse
        cx={4 * PIXEL}
        cy={16 * PIXEL + 2}
        rx={3 * PIXEL}
        ry={PIXEL * 0.4}
        fill="rgba(0,0,0,0.12)"
      />
    </svg>
  </div>
);
