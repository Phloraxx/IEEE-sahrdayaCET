import { useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { APP_URL } from "@/lib/constants";
import "@/features/globals.css";
import "@fontsource-variable/geist";
import "@fontsource/press-start-2p";
import "@fontsource/caveat";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${APP_URL}/#organization`,
  name: "IEEE Sahrdaya Student Branch",
  alternateName: "IEEE Sahrdaya SB",
  url: APP_URL,
  logo: {
    "@type": "ImageObject",
    url: `${APP_URL}/ieee-logo-square.png`,
    contentUrl: `${APP_URL}/ieee-logo-square.png`,
    width: 512,
    height: 512,
  },
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
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${APP_URL}/#website`,
  name: "IEEE Sahrdaya Student Branch",
  alternateName: "IEEE Sahrdaya SB",
  url: APP_URL,
  inLanguage: "en-IN",
  publisher: { "@id": `${APP_URL}/#organization` },
};

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#00629B" />
        <Meta />
        <Links />
        <link rel="icon" href="/ieee-logo-square.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/ieee-logo-square.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema).replace(/</g, "\\u003c") }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('ieee-theme');var a=location.pathname.indexOf('/admin')===0;if(s==='dark'||(s!=='light'&&a))document.documentElement.classList.add('dark');}catch(e){}})()",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:text-ieee-blue focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
        >
          Skip to content
        </a>
        <div id="main-content" tabIndex={-1}>{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function headers() {
  const headers: Record<string, string> = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://api.razorpay.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      "font-src 'self' data: https://*.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://checkout.razorpay.com https://api.razorpay.com",
      "connect-src 'self' https://cloudflareinsights.com https://api.razorpay.com https://*.razorpay.com",
      "frame-src https://api.razorpay.com https://*.razorpay.com",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  };

  if (process.env.DEPLOY_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  } else {
    headers["X-Robots-Tag"] = "noindex, nofollow";
  }

  return headers;
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <Outlet />
          <Toaster />
        </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const message =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? error.statusText
        : "An unexpected error occurred";

  return (
    <main className="min-h-screen bg-white px-4 flex items-center justify-center text-center">
      <div className="max-w-md">
        <p className="font-pixel text-6xl text-[#00629B] mb-4">{is404 ? "404" : "!"}</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {is404 ? "Page Not Found" : "Something went wrong"}
        </h1>
        <p className="text-gray-500 mb-6">{message}</p>
        <Link to="/" className="inline-flex rounded-full bg-[#00629B] px-6 py-3 text-sm font-bold text-white">
          Go Home
        </Link>
      </div>
    </main>
  );
}
