import React from 'react'

const Logo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        color: '#635bff',
        height: 24,
        width: 30,
      }}>
        <svg width="100%" height="100%" viewBox="80 280 160 110" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M208.638 331.358L208.982 331.721L209.707 331.032L209.362 330.669L209 331.014L208.638 331.358ZM190 311.014L189.638 311.358L208.638 331.358L209 331.014L209.362 330.669L190.362 310.669L190 311.014Z" fill="currentColor"/>
          <circle cx="188.5" cy="308.514" r="3" stroke="currentColor" fill="none"/>
          <path d="M208.639 330.669L208.984 330.307L209.708 330.997L209.363 331.359L209.001 331.014L208.639 330.669ZM189.949 351.014L189.587 350.669L208.639 330.669L209.001 331.014L209.363 331.359L190.311 351.359L189.949 351.014Z" fill="currentColor"/>
          <circle cx="188.464" cy="353.514" r="3" stroke="currentColor" fill="none"/>
          <rect x="114.012" y="330.46" width="58.614" height="8" transform="rotate(-45 114.012 330.46)" fill="currentColor"/>
          <rect x="119.985" y="324.524" width="58.7164" height="8.46392" transform="rotate(45 119.985 324.524)" fill="currentColor"/>
          <rect x="149.551" y="366.006" width="58.6166" height="8.4476" transform="rotate(-45 149.551 366.006)" fill="currentColor"/>
          <rect x="148.534" y="347.029" width="22.3083" height="9.91175" transform="rotate(-45 148.534 347.029)" fill="currentColor"/>
          <rect x="131.547" y="330.055" width="13.4293" height="19.755" transform="rotate(-45 131.547 330.055)" fill="currentColor"/>
          <rect width="8.46344" height="4.26124" transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 148.534 347.02)" fill="currentColor"/>
          <rect x="164.006" y="297.542" width="46.6486" height="11.26" transform="rotate(45 164.006 297.542)" fill="currentColor"/>
          <rect x="148.536" y="304.03" width="26.191" height="12.7302" transform="rotate(45 148.536 304.03)" fill="currentColor"/>
          <rect x="166.895" y="322.401" width="14.2813" height="8.4858" transform="rotate(45 166.895 322.401)" fill="currentColor"/>
        </svg>
      </div>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#0a2540',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        Sahrdaya SB
      </span>
    </div>
  )
}

export default Logo
