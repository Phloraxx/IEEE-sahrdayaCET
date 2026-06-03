import React from 'react'

const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/emblem.png"
        alt="IEEE"
        style={{ height: 28, width: 'auto', objectFit: 'contain' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--theme-color)' }}>
          IEEE
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--theme-elevation-650)' }}>
          Sahrdaya SB
        </span>
      </div>
    </div>
  )
}

export default Logo
