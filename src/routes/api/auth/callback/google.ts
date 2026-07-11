import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
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

        const appUrl = process.env.PUBLIC_APP_URL;
        const fallbackUrl = `${url.protocol}//${url.host}`;
        const isProduction = process.env.NODE_ENV === "production";
        if (!appUrl && isProduction) {
          logError("oauth-callback", "PUBLIC_APP_URL not set in production");
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=config_error", fallbackUrl).toString() } });
        }
        const resolvedAppUrl = appUrl || fallbackUrl;

        // Parse ALL pb_oauth_provider values from the raw Cookie header.
        // The browser may send multiple cookies with the same name when a
        // stale host-only cookie (from a prior login before the Domain=
        // attribute was added) coexists with a fresh domain-wide cookie set
        // with Domain=.ieeesahrdaya.com. The `cookie` package's parse()
        // returns only the first value (host-only wins by specificity), so we
        // manually iterate all values to find the one matching this flow's
        // state.
        const rawCookie = request.headers.get("cookie") || "";
        const allProviderCookies = rawCookie
          .split(";")
          .map(s => s.trim())
          .filter(s => s.startsWith(`${PB_OAUTH_PROVIDER_COOKIE  }=`))
          .map(s => decodeURIComponent(s.slice(s.indexOf("=") + 1)));

        if (!code || !state || allProviderCookies.length === 0) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_no_params", resolvedAppUrl).toString() } });
        }

        // Try each cookie value. Prefer one where BOTH the signature verifies
        // AND the state matches the Google redirect param (this is the cookie
        // for the current flow). Fall back to any valid-signature value only
        // if none match (stale state — exchange will fail and surface the
        // real Google error via the diagnostic logging below).
        let provider: Record<string, unknown> | null = null;
        for (const val of allProviderCookies) {
          const p = verifySignedCookie(val);
          if (p && p.state === state) { provider = p; break; }
        }

        if (!provider) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_bad_sig", resolvedAppUrl).toString() } });
        }

        const redirectUrl = `${resolvedAppUrl}${OAUTH_CALLBACK_PATH}`;
        // Where to send the user after login. Only allow origins on our domain.
        let finalRedirect = resolvedAppUrl;
        if (typeof provider.origin === "string" && provider.origin) {
          try {
            const originUrl = new URL(provider.origin);
            const appHost = new URL(resolvedAppUrl).hostname;
            const apex = appHost.split('.').slice(-2).join('.');
            const originHost = originUrl.hostname;
            if (
              originUrl.origin === new URL(resolvedAppUrl).origin ||
              (apex.length > 0 && (originHost === appHost || originHost.endsWith(`.${  apex}`)))
            ) {
              finalRedirect = provider.origin;
            }
          } catch { /* keep default */ }
        }

        const cookieDomain = getCookieDomain(resolvedAppUrl);

        // Clear function for pb_oauth_provider — hoisted here so both the
        // success path and the error path can clear both host-only and
        // cross-domain cookie variants (preventing stale host-only cookies
        // from overshadowing domain-wide ones on subsequent requests).
        const clearCookie = (d?: string) =>
          serialize(PB_OAUTH_PROVIDER_COOKIE, "", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
            ...(d ? { domain: d } : {}),
          });

        try {
          const pbUrl = process.env.POCKETBASE_URL;
          if (!pbUrl) throw new Error("Missing POCKETBASE_URL");
          const pb = new PocketBase(pbUrl);
          await pb
            .collection("users")
            .authWithOAuth2Code(
              provider.name as string,
              code,
              provider.codeVerifier as string,
              redirectUrl,
            );

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

          // Clear pb_oauth_provider (PKCE verifier must not be reusable).
          // Clear both host-only and domain-wide variants to prevent stale
          // host-only cookies from shadowing future domain-wide cookies.
          response.headers.append("Set-Cookie", clearCookie());
          if (cookieDomain) response.headers.append("Set-Cookie", clearCookie(cookieDomain));

          return response;
        } catch (err) {
          logError("oauth-callback", err);

          // PocketBase wraps Google's token-exchange error into a generic
          // "Failed to fetch OAuth2 token" 400 and discards Google's actual
          // error body (the real invalid_grant reason is in PB's Go server
          // logs). We can't call Google directly (client_secret isn't
          // available at runtime — it's only in PB's settings), so log the
          // exact params we sent to PB so they can be compared against what
          // init.ts baked into the authURL. The most common cause is a
          // redirect_uri mismatch (stale cached authURL vs current
          // PUBLIC_APP_URL) or a PKCE verifier desync from a stale cookie.
          console.log("[oauth-cb] exchange FAILED. Params sent to PB:", {
            provider: provider.name,
            codeLen: (code || "").length,
            verifierLen: ((provider.codeVerifier as string) || "").length,
            redirectUrl,
            stateMatch: provider.state === state,
            cookieOrigin: provider.origin,
            resolvedAppUrl,
          });

          const response = new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed_exchange", resolvedAppUrl).toString() } });
          response.headers.append("Set-Cookie", clearCookie());
          if (cookieDomain) response.headers.append("Set-Cookie", clearCookie(cookieDomain));
          return response;
        }
      },
    },
  },
});