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
import { AuthProvider } from "@/lib/auth-context";
import { allow, clientKey, ruleFor } from "@/server/http/rate-limit";
import {
	isCacheablePublicDocument,
	PUBLIC_DOCUMENT_CACHE_CONTROL,
} from "@/server/http/cache";
import { Toaster } from "@/components/ui/sonner";
import { APP_URL } from "@/lib/constants";
import { ORGANIZATION_SAME_AS } from "@/lib/social-links";
import "@/features/globals.css";
// Latin subsets only. The default entry points ship cyrillic, greek,
// vietnamese and latin-ext faces plus a `.woff` fallback for every one of them —
// 434 KB of font files for a site whose copy is English. The browser only ever
// downloaded the latin `.woff2`, so this is a build-size fix rather than a
// transfer fix, but it also stops four dead `@font-face` rules being parsed.
//
// Geist has no per-subset entry point; its `index.css` is already woff2-only and
// `unicode-range` keeps the browser on the latin file.
import "@fontsource-variable/geist";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/caveat/latin-400.css";

/**
 * Mirrors the default in `@/lib/env.server`.
 *
 * `root.tsx` is a shared module, so it must not import `env.server` — that would
 * pull server-only code into the client bundle. The middleware below never runs
 * in the browser, so reading `process.env` here is safe; the same pattern is
 * already used by `headers()` at the bottom of this file.
 */
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__Host-ieee_session";

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
  sameAs: ORGANIZATION_SAME_AS,
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
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
          onClick={(event) => {
            const target = document.querySelector<HTMLElement>('[data-page-content]') || document.querySelector<HTMLElement>('main h1') || document.querySelector<HTMLElement>('main');
            if (target) { event.preventDefault(); target.tabIndex = -1; target.focus(); target.scrollIntoView({ block: 'start' }); }
          }}
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[150] focus:bg-white focus:text-ieee-blue focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
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

/**
 * Rate limiting at the single place every request passes through.
 *
 * `react-router.config.ts` enables `v8_middleware`, so this runs before any
 * loader or action. The rule is chosen by path and method: `/auth/*` is tight,
 * the payment webhook is generous, and any non-GET `/api/*` request is bounded.
 */
async function rateLimitMiddleware(
	{ request }: { request: Request },
	next: () => Promise<Response>,
): Promise<Response> {
	const rule = ruleFor(request);
	if (rule && !allow(`${rule.limit}:${clientKey(request)}`, rule)) {
		return new Response(JSON.stringify({ error: "Too many requests" }), {
			status: 429,
			headers: { "Content-Type": "application/json", "Retry-After": "60", "Cache-Control": "no-store" },
		});
	}
	return next();
}

/**
 * Shared-cache directives for anonymous public documents.
 *
 * Runs on the way back out, so it only ever annotates a response React Router
 * already produced. The decision itself lives in `@/server/http/cache` — this
 * function is the wiring, not the policy.
 */
async function publicCacheMiddleware(
	{ request }: { request: Request },
	next: () => Promise<Response>,
): Promise<Response> {
	const response = await next();

	// Only a successful, complete document is worth caching. A 3xx, a 4xx from
	// an error boundary, or a 5xx must never be pinned in a shared cache.
	if (response.status !== 200) return response;

	if (!isCacheablePublicDocument(request, SESSION_COOKIE_NAME)) {
		return response;
	}

	response.headers.set("Cache-Control", PUBLIC_DOCUMENT_CACHE_CONTROL);
	return response;
}

export const middleware = [rateLimitMiddleware, publicCacheMiddleware];

export function headers() {
  const headers: Record<string, string> = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      // The only inline script is the pre-paint theme toggle below; it is pinned
      // by hash so `unsafe-inline` is not needed. JSON-LD blocks are
      // `application/ld+json` and are not executed, so CSP does not apply to them.
      //
      // Development keeps `unsafe-inline` because Vite's HMR client injects
      // inline scripts; production is the environment that matters.
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'sha256-Pt/n2axd+5lXpyJMbvmmHpXr44zXheeYYRRdMIAHr+A=' https://static.cloudflareinsights.com"
        : "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "connect-src 'self' https://cloudflareinsights.com",
      "frame-src 'none'",
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

  // No `MotionConfig` here on purpose. It pulled framer-motion into the root
  // chunk, so every route — including `/about` and the legal pages, which
  // animate nothing — downloaded ~40 KB gzipped of animation runtime.
  //
  // Reduced motion is still honoured everywhere: `globals.css` zeroes CSS
  // animations and transitions under `prefers-reduced-motion`, and the
  // components that actually animate call `useReducedMotion()` themselves.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const is404 = status === 404;
  const forbidden = status === 403;
  return (
    <main data-page-content tabIndex={-1} className="flex min-h-screen items-center justify-center bg-white px-5 text-center">
      <div className="max-w-md">
        <p className="mb-4 font-pixel text-5xl text-ieee-blue">{is404 ? '404' : forbidden ? '403' : '!'}</p>
        <h1 className="mb-3 text-2xl font-bold text-gray-900">{is404 ? 'Page not found' : forbidden ? 'Access unavailable' : 'Content temporarily unavailable'}</h1>
        <p className="mb-6 text-sm leading-6 text-gray-600">{is404 ? 'This page may have moved or is no longer published.' : forbidden ? 'Sign in with an account that has access, or contact the branch for help.' : 'We could not load this page. Please try again in a moment.'}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {!is404 && !forbidden && <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full bg-ieee-blue px-6 text-sm font-semibold text-white">Try again</button>}
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-gray-300 px-6 text-sm font-semibold text-gray-700">Go home</Link>
          <Link to="/contact" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-ieee-blue">Contact the branch</Link>
        </div>
      </div>
    </main>
  );
}
