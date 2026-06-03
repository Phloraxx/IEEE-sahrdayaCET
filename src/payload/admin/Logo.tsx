import React from 'react'

const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/Ieee.svg"
        alt="IEEE"
        style={{ height: 24, width: 'auto', objectFit: 'contain' }}
      />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--theme-elevation-700)',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        Sahrdaya SB
      </span>
    </div>
  )
}

export default Logo
