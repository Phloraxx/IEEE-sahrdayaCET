/**
 * Content-Security-Policy for document responses.
 *
 * React Router 7 emits several inline scripts during SSR: the framework
 * context, the route-module imports, and the single-fetch stream controller.
 * The stream controller carries per-request loader data, so its hash changes on
 * every response and a static hash can never authorise it. Those scripts are
 * authorised by a per-request nonce instead, minted in `entry.server.tsx` and
 * threaded through `<ServerRouter nonce>`.
 *
 * The pre-paint theme toggle in `root.tsx` is static, so it keeps a pinned
 * sha256 hash. `tests/e2e/seo.e2e.ts` recomputes that hash from the served
 * markup, so editing the script without updating the hash fails CI rather than
 * silently breaking the theme.
 *
 * JSON-LD blocks are `application/ld+json` and are never executed, so CSP does
 * not apply to them.
 */
export const THEME_SCRIPT_HASH =
  "sha256-Pt/n2axd+5lXpyJMbvmmHpXr44zXheeYYRRdMIAHr+A=";

export function buildContentSecurityPolicy(nonce?: string): string {
  // Development keeps `unsafe-inline` because Vite's HMR client injects inline
  // scripts that carry no nonce. Production is the environment that matters.
  const scriptSrc = nonce
    ? [
        "'self'",
        `'nonce-${nonce}'`,
        `'${THEME_SCRIPT_HASH}'`,
        "https://static.cloudflareinsights.com",
      ].join(" ")
    : "'self' 'unsafe-inline' https://static.cloudflareinsights.com";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self'",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
}
