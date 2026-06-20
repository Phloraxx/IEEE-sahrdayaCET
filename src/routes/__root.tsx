import type { ReactNode } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { AuthProvider } from '@/lib/auth-context'
import '@/app/globals.css'

// Fonts — replace next/font/google with @fontsource equivalents
import '@fontsource-variable/geist'
import '@fontsource-variable/inter'
import '@fontsource/press-start-2p'
import '@fontsource/caveat'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'IEEE Sahrdaya Student Branch' },
      {
        name: 'description',
        content:
          'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.',
      },
      { name: 'theme-color', content: '#00629B' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'IEEE Sahrdaya Student Branch' },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'robots',
        content: 'index, follow',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://res.cloudinary.com' },
      { rel: 'preconnect', href: 'https://lh3.googleusercontent.com' },
      { rel: 'icon', href: '/emblem.png' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>404 — Page Not Found</h1>
      <p style={{ marginTop: '0.5rem', color: '#666' }}>The page you're looking for doesn't exist.</p>
      <Link to="/" style={{ color: '#00629B', textDecoration: 'underline', marginTop: '1rem', display: 'inline-block' }}>
        Go home
      </Link>
    </div>
  ),
})
function RootComponent() {
  return (
    <RootDocument>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
