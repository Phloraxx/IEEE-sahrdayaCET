import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import PocketBase from "pocketbase";
import { signCookie, verifySignedCookie } from "@/lib/cookie-signing";
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from "@/lib/constants";
import { logError } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Returns a wildcard cookie domain for shared parent-domain auth.
 * e.g. https://test.ieeesahrdaya.com -> .ieeesahrdaya.com
 *      http://localhost:3000         -> undefined (host-only cookie)
 */
function getCookieDomain(appUrl: string): string | undefined {
  try {
    const hostname = new URL(appUrl).hostname;
    // For localhost / IP / single-segment hostnames, don't set Domain
    // (browser would reject it anyway).
    const parts = hostname.split(".");
    if (parts.length <= 1 || hostname === "localhost") return undefined;
    // Leave the leading dot off in the Set-Cookie options; the `cookie`
    // package normalizes it, and browsers treat it as a subdomain-wide
    // cookie regardless.
    return `.${parts.slice(-2).join(".")}`;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/api/auth/init")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
          const rl = checkRateLimit({ key: `auth:${ip}`, max: 10, windowMs: 60_000 })
          if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)
          const url = process.env.POCKETBASE_URL;
          if (!url) {
            return Response.json(
              { error: "Server configuration error" },
              { status: 500 },
            );
          }
          const nextUrl = new URL(request.url);
          // OAuth redirect_uri must be a single stable, pre-registered URL in
          // Google Cloud Console (Google does NOT allow wildcards). We therefore
          // use PUBLIC_APP_URL for the OAuth callback and redirect the user back
          // to their actual origin/preview domain after the exchange.
          const appUrl = process.env.PUBLIC_APP_URL;
          if (!appUrl) {
            return Response.json(
              { error: "Server configuration error — PUBLIC_APP_URL not set" },
              { status: 500 },
            );
          }

          // Capture the page the user actually started login from (preview
          // domain, localhost, etc.) so the callback can redirect back there.
          const origin = request.headers.get("origin") || request.headers.get("referer") || `${nextUrl.protocol}//${nextUrl.host}`;

          // ── Single-flight guard (prevents PKCE desync) ───────────────────
          // PocketBase's `listAuthMethods()` mints a fresh PKCE codeVerifier
          // + state on every call. If a second init fires before the user
          // navigates to Google (React StrictMode double-invoke, a prefetch,
          // a double-click, or a retry), the second call overwrites the
          // signed provider cookie with a NEW verifier — while the user
          // opens the FIRST authURL. Google then issues a code bound to
          // challenge #1, the callback sends verifier #2 → `invalid_grant`
          // → "Failed to fetch OAuth2 token" 400.
          //
          // Fix: if a valid, unexpired provider cookie already exists for
          // this same origin, reuse it verbatim and return its authURL
          // WITHOUT calling listAuthMethods() again. The cookie carries the
          // authURL alongside the PKCE pair, so the cached authURL is
          // guaranteed to match the cached verifier.
          const existingCookies = parse(request.headers.get("cookie") || "");
          const existingSigned = existingCookies[PB_OAUTH_PROVIDER_COOKIE];
          if (existingSigned) {
            const existing = verifySignedCookie(decodeURIComponent(existingSigned));
            if (
              existing &&
              typeof existing.authURL === "string" &&
              typeof existing.origin === "string" &&
              existing.origin === origin
            ) {
              // Cookie is intact and matches this origin — return the cached
              // authURL and don't touch the cookie, so the verifier in the
              // cookie stays the one Google expects.
              return Response.json({ authURL: existing.authURL });
            }
          }

          const pb = new PocketBase(url);
          const authMethods = await pb.collection("users").listAuthMethods();
          const provider = authMethods.oauth2.providers.find(
            (p) => p.name === "google",
          );

          if (!provider) {
            return Response.json(
              { error: "Server configuration error" },
              { status: 500 },
            );
          }

          const redirectUrl = `${appUrl}${OAUTH_CALLBACK_PATH}`;
          const fullAuthURL = `${provider.authURL}${redirectUrl}`;

          const payload = JSON.stringify({
            name: provider.name,
            codeVerifier: provider.codeVerifier,
            state: provider.state,
            origin,
            authURL: fullAuthURL,
          });
          const signedCookie = `${payload}.${signCookie(payload)}`;

          console.log('[oauth-init] state=' + provider.state + ' origin=' + origin + ' hasExisting=' + !!existingSigned + ' secretLen=' + (process.env.OAUTH_COOKIE_SECRET || '').length + ' payloadLen=' + payload.length + ' sig=' + signCookie(payload));

          const isProduction = process.env.NODE_ENV === "production";
          const response = Response.json({ authURL: fullAuthURL });
          const cookieDomain = getCookieDomain(appUrl);
          response.headers.set(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, signedCookie, {
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
              maxAge: 300,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );

          return response;
        } catch (error) {
          logError("auth-init", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
