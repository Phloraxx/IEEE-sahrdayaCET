import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import { OAUTH_CALLBACK_PATH, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { logError } from "@/lib/logger";
import PocketBase from "pocketbase";
import { verifySignedCookie } from "@/lib/cookie-signing";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
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
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", resolvedAppUrl).toString() } });
        }

        const provider = verifySignedCookie(decodeURIComponent(providerCookie));
        if (!provider || provider.state !== state) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", resolvedAppUrl).toString() } });
        }

        const redirectUrl = `${resolvedAppUrl}${OAUTH_CALLBACK_PATH}`;
        // Where to send the user after login. Defaults to the stable app URL,
        // but respects the origin they started from (preview domains, etc.).
        const finalRedirect =
          typeof provider.origin === "string" && provider.origin
            ? provider.origin
            : resolvedAppUrl;

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

          const isProduction = process.env.NODE_ENV === "production";
          const response = new Response(null, { status: 302, headers: { Location: finalRedirect } });

          const authCookie = pb.authStore.exportToCookie({
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
          });
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
            }),
          );

          return response;
        } catch (err) {
          logError("oauth-callback", err);
          const isProduction = process.env.NODE_ENV === "production";
          const response = new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", resolvedAppUrl).toString() } });
          response.headers.set(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, "", {
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
              maxAge: 0,
            }),
          );
          return response;
        }
      },
    },
  },
});
