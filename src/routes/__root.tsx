import type { ReactNode } from 'react'
import { useState } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth-context'
import { APP_URL } from '@/lib/constants'
import '@/features/globals.css'

// Fonts — replace next/font/google with @fontsource equivalents
import '@fontsource-variable/geist'
import '@fontsource/press-start-2p'
import '@fontsource/caveat'

// CSP, HSTS, and other security headers are set by the Caddy reverse proxy in production.
// In dev mode, the Vite dev server serves directly — CSP is not enforced locally.

export const Route = createRootRoute({
  head: () => {
    const organizationSchema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "IEEE Sahrdaya Student Branch",
      url: APP_URL,
      logo: `${APP_URL}/emblem.png`,
      description:
        "Official IEEE Student Branch at Sahrdaya College of Engineering & Technology, Thrissur, Kerala, India.",
      sameAs: [
        "https://www.ieee.org",
        "https://ieeekerala.org",
        "https://www.instagram.com/ieee_sahrdaya_sb/",
        "https://www.linkedin.com/company/ieee-sahrdaya-sb/",
        "https://www.youtube.com/@ieeesahrdaya",
      ],
      parentOrganization: {
        "@type": "Organization",
        name: "IEEE Kerala Section",
        url: "https://ieeekerala.org",
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Thrissur",
        addressRegion: "Kerala",
        addressCountry: "IN",
      },
    }

    const websiteSchema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "IEEE Sahrdaya Student Branch",
      url: APP_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${APP_URL}/events?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    }

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
      ],
    }


    return {
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
        { property: 'og:locale', content: 'en_IN' },
        { property: 'og:site_name', content: 'IEEE Sahrdaya Student Branch' },
        { property: 'og:title', content: 'IEEE Sahrdaya Student Branch' },
        {
          property: 'og:description',
          content:
            'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.',
        },
        { property: 'og:image', content: `${APP_URL}/emblem.png` },
        { property: 'og:image:width', content: '512' },
        { property: 'og:image:height', content: '512' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'IEEE Sahrdaya Student Branch' },
        { name: 'twitter:description', content: 'Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory.' },
        { name: 'twitter:image', content: `${APP_URL}/emblem.png` },
        {
          name: 'robots',
          content: 'index, follow',
        },
      ],
      links: [
        { rel: 'preconnect', href: 'https://res.cloudinary.com' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        { rel: 'preconnect', href: process.env.POCKETBASE_URL || 'https://db.phloraxx.us.to' },
        { rel: 'icon', href: '/emblem.png' },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(organizationSchema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        },
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(websiteSchema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        },
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(breadcrumbSchema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        },
      ],
    }
  },
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
  errorComponent: ({ error }: { error: Error }) => (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Something went wrong</h1>
      <p style={{ marginTop: '0.5rem', color: '#666' }}>{import.meta.env.DEV ? error.message : 'An unexpected error occurred'}</p>
      <button onClick={() => window.location.reload()} style={{ color: '#00629B', textDecoration: 'underline', marginTop: '1rem', display: 'inline-block', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
        Reload page
      </button>
    </div>
  ),
})
function RootComponent() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  )
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </QueryClientProvider>
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:text-ieee-blue focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
        >
          Skip to content
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
