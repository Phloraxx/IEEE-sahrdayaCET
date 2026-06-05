import type { Metadata } from 'next'

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/Ieee.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/Ieee.svg', type: 'image/svg+xml' }],
  },
}

export default function AdminSegmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
