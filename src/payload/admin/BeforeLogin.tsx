import React from 'react'

/**
 * Branding rendered above the default Payload login form.
 * Stripe-style: clean, no pixel font, soft gradient mark.
 */
const BeforeLogin: React.FC = () => {
  return (
    <div
      style={{
        textAlign: 'center',
        marginBottom: 28,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          background: 'linear-gradient(135deg, #635bff 0%, #a259ff 100%)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 700,
          boxShadow: '0 6px 20px rgba(99, 91, 255, 0.30)',
          letterSpacing: '-0.02em',
        }}
      >
        IEEE
      </div>
      <div>
        <h1
          style={{
            fontSize: 17,
            fontWeight: 600,
            margin: 0,
            color: '#0a2540',
            letterSpacing: '-0.01em',
          }}
        >
          Sahrdaya Student Branch
        </h1>
        <p
          style={{
            color: '#5a6b80',
            fontSize: 12,
            letterSpacing: '0.02em',
            fontWeight: 500,
            margin: '2px 0 0',
          }}
        >
          Sign in to the admin console
        </p>
      </div>
    </div>
  )
}

export default BeforeLogin
