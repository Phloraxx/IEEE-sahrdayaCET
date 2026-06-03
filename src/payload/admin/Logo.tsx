import React from 'react'

const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/emblem.png"
        alt="IEEE"
        style={{ height: 28, width: 'auto', objectFit: 'contain' }}
      />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--theme-elevation-700)',
        whiteSpace: 'nowrap',
      }}>
        Sahrdaya SB
      </span>
    </div>
  )
}

export default Logo
