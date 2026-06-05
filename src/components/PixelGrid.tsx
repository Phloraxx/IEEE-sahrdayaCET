import React from 'react'

const PixelGrid: React.FC<{ grid: string[][]; size: number }> = ({ grid, size }) => {
    if (!grid || grid.length === 0 || grid[0].length === 0) return null
    return (
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
    )
}

export default PixelGrid
