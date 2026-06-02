import React from 'react'

const DashboardWidget: React.FC = () => {
  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        padding: '1rem',
        background: 'var(--theme-input-bg)',
      }}
    >
      <h4 style={{ margin: 0, color: 'var(--theme-color)' }}>Overview</h4>
      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--theme-elevation-650)' }}>
        <p>Dashboard overview widget — totals will be rendered here.</p>
      </div>
    </div>
  )
}

export default DashboardWidget
