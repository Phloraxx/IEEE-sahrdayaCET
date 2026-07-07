import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import { OAUTH_CALLBACK_PATH, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { logError } from "@/lib/logger";
import PocketBase from "pocketbase";
import { verifySignedCookie } from "@/lib/cookie-signing";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Returns a wildcard cookie domain for shared parent-domain auth.
 * e.g. https://test.ieeesahrdaya.com -> .ieeesahrdaya.com
 *      http://localhost:3000         -> undefined (host-only cookie)
 */
function getCookieDomain(appUrl: string): string | undefined {
  try {
    const hostname = new URL(appUrl).hostname;
    const parts = hostname.split(".");
    if (parts.length <= 1 || hostname === "localhost") return undefined;
    return `.${parts.slice(-2).join(".")}`;
  } catch {
    return undefined;
  }
}

/**
 * Adds a Domain attribute to a Set-Cookie value (used for the PB auth
 * cookie because pb.authStore.exportToCookie doesn't expose domain).
 */
function addCookieDomain(cookieValue: string, domain: string | undefined): string {
  if (!domain || cookieValue.includes("Domain=")) return cookieValue;
  // Insert Domain= right after the cookie name/value pair.
  const firstSemicolon = cookieValue.indexOf(";");
  if (firstSemicolon === -1) return `${cookieValue}; Domain=${domain}`;
  return `${cookieValue.slice(0, firstSemicolon)}; Domain=${domain}${cookieValue.slice(firstSemicolon)}`;
}

export const Route = createFileRoute("/api/auth/callback/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        const rl = checkRateLimit({ key: `auth:${ip}`, max: 10, windowMs: 60_000 })
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs)

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookies = parse(request.headers.get("cookie") || "");
        const providerCookie = cookies[PB_OAUTH_PROVIDER_COOKIE];

        const appUrl = process.env.PUBLIC_APP_URL;
        const fallbackUrl = `${url.protocol}//${url.host}`;
        const isProduction = process.env.NODE_ENV === "production";
        if (!appUrl && isProduction) {
          logError("oauth-callback", "PUBLIC_APP_URL not set in production");
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=config_error", fallbackUrl).toString() } });
        }
        const resolvedAppUrl = appUrl || fallbackUrl;

        if (!code || !state || !providerCookie) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_no_params", resolvedAppUrl).toString() } });
        }

        // providerCookie from parse() is already URL-decoded. DO NOT call
        // decodeURIComponent on it — PocketBase's authURL contains pre-encoded
        // chars (%3A, %2F in the scope param) that survive single decode but
        // get corrupted by a second decode, changing the payload string and
        // causing an HMAC mismatch (verifySignedCookie returns null).
        const provider = verifySignedCookie(providerCookie);
        if (!provider || provider.state !== state) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_bad_state", resolvedAppUrl).toString() } });
        }

        const redirectUrl = `${resolvedAppUrl}${OAUTH_CALLBACK_PATH}`;
        // Where to send the user after login. Defaults to the stable app URL,
        // but respects the origin they started from (preview domains, etc.).
        const finalRedirect =
          typeof provider.origin === "string" && provider.origin
            ? provider.origin
            : resolvedAppUrl;

        const cookieDomain = getCookieDomain(resolvedAppUrl);

        try {
          const pbUrl = process.env.POCKETBASE_URL;
          if (!pbUrl) throw new Error("Missing POCKETBASE_URL");
          const pb = new PocketBase(pbUrl);
          console.log('[oauth-cb] exchanging: redirectUrl=' + redirectUrl + ' verifierLen=' + ((provider.codeVerifier as string) || '').length + ' codeLen=' + (code || '').length);
          await pb
            .collection("users")
            .authWithOAuth2Code(
              provider.name as string,
              code,
              provider.codeVerifier as string,
              redirectUrl,
            );
          console.log('[oauth-cb] exchange SUCCESS');

          const isProduction = process.env.NODE_ENV === "production";
          const response = new Response(null, { status: 302, headers: { Location: finalRedirect } });

          const authCookie = addCookieDomain(
            pb.authStore.exportToCookie({
                httpOnly: true,
                secure: isProduction,
                sameSite: "lax",
                path: "/",
            }),
            cookieDomain,
          );
          response.headers.set("Set-Cookie", authCookie);

          // Clear the one-time OAuth provider cookie (PKCE verifier must not be reusable)
          response.headers.append(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, "", {
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
              maxAge: 0,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );

          return response;
        } catch (err) {
          logError("oauth-callback", err);
          const errData = err && typeof err === 'object' ? JSON.stringify({ message: (err as any)?.message, data: (err as any)?.data, status: (err as any)?.status, response: (err as any)?.response }) : String(err);
          console.log('[oauth-cb] exchange FAILED: ' + errData);
          const isProduction = process.env.NODE_ENV === "production";
          const response = new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_exchange", resolvedAppUrl).toString() } });
          response.headers.set(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, "", {
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
              maxAge: 0,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );
          return response;
        }
      },
    },
  },
});
