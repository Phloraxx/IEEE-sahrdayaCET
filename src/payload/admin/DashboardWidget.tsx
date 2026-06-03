import React from 'react'

const DashboardWidget: React.FC = () => {
  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 4,
        padding: 24,
        background: 'var(--theme-elevation-0)',
      }}
    >
      <h4
        style={{
          margin: 0,
          color: 'var(--theme-color)',
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        Overview
      </h4>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          color: 'var(--theme-elevation-650)',
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: 0 }}>Welcome to the IEEE Sahrdaya SB admin panel.</p>
        <p style={{ margin: '8px 0 0' }}>
          Manage societies, events, registrations, orders, and members from here.
        </p>
      </div>
    </div>
  )
}

export default DashboardWidget
