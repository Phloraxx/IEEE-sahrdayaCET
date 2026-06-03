import React from 'react'

const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/favicon.svg"
        alt="IEEE"
        style={{ height: 26, width: 'auto', objectFit: 'contain' }}
      />
      <span style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--theme-elevation-800)',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        Sahrdaya SB
      </span>
    </div>
  )
}

export default Logo
