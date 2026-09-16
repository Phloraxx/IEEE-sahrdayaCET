import React from "react";

export const MASCOT_HEAD: string[][] = [
  ["#00629B", "#00629B", "#00629B", "#00629B", "#00629B", "#00629B", "#00629B", "#00629B"],
  ["#00629B", "#0099D6", "#0099D6", "#0099D6", "#0099D6", "#0099D6", "#0099D6", "#00629B"],
  ["#00629B", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#00629B"],
  ["#f5d5b8", "#f5d5b8", "#ffffff", "#0099D6", "#0099D6", "#ffffff", "#f5d5b8", "#f5d5b8"],
  ["#f5d5b8", "#f5d5b8", "#f5d5b8", "#e8c4a0", "#e8c4a0", "#f5d5b8", "#f5d5b8", "#f5d5b8"],
  ["#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8"],
  ["#f5d5b8", "#e8c4a0", "#e8c4a0", "#e8c4a0", "#e8c4a0", "#e8c4a0", "#e8c4a0", "#f5d5b8"],
  ["transparent", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "#f5d5b8", "transparent"],
];

export const MASCOT_BODY: string[][] = [
  ["transparent", "#004a7c", "#00629B", "#00629B", "#00629B", "#00629B", "#004a7c", "transparent"],
  ["transparent", "#004a7c", "#00629B", "#ffffff", "#ffffff", "#00629B", "#004a7c", "transparent"],
  ["#f5d5b8", "#004a7c", "#00629B", "#00629B", "#00629B", "#00629B", "#004a7c", "#f5d5b8"],
  ["#f5d5b8", "#004a7c", "#004a7c", "#0099D6", "#0099D6", "#004a7c", "#004a7c", "#f5d5b8"],
  ["transparent", "#004a7c", "#004a7c", "#00629B", "#00629B", "#004a7c", "#004a7c", "transparent"],
  ["transparent", "#2c3e50", "#2c3e50", "#2c3e50", "#2c3e50", "#2c3e50", "#2c3e50", "transparent"],
  ["transparent", "#2c3e50", "#2c3e50", "transparent", "transparent", "#2c3e50", "#2c3e50", "transparent"],
  ["transparent", "#1a252f", "#1a252f", "transparent", "transparent", "#1a252f", "#1a252f", "transparent"],
];

export const MASCOT_BODY_PEEK = MASCOT_BODY.slice(0, 3);

export const PixelGrid: React.FC<{ grid: string[][]; size: number }> = ({ grid, size }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${grid[0]!.length}, ${size}px)`, lineHeight: 0 }}>
    {grid.flat().map((color, index) => (
      <div
        key={index}
        style={{ width: size, height: size, backgroundColor: color, imageRendering: "pixelated" }}
      />
    ))}
  </div>
);
