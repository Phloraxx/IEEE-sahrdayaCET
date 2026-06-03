/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'ieee-blue': '#00629B',
        'ieee-light-blue': '#0099D6',
      },
      fontFamily: {
        pixel: ['var(--font-pixel-loaded)', '"Courier New"', 'monospace'],
        sans: ['var(--font-inter-loaded)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
