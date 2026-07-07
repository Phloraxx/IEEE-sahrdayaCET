import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import PocketBase from "pocketbase";
import { signCookie } from "@/lib/cookie-signing";
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from "@/lib/constants";
import { logError } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
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

          // Capture the page the user actually started login from (preview
          // domain, localhost, etc.) so the callback can redirect back there.
          const origin = request.headers.get("origin") || request.headers.get("referer") || `${nextUrl.protocol}//${nextUrl.host}`;

          const payload = JSON.stringify({
            name: provider.name,
            codeVerifier: provider.codeVerifier,
            state: provider.state,
            origin,
          });
          const signedCookie = `${payload}.${signCookie(payload)}`;

          const isProduction = process.env.NODE_ENV === "production";
          const response = Response.json({ authURL: fullAuthURL });
          response.headers.set(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, signedCookie, {
              httpOnly: true,
              secure: isProduction,
              sameSite: "lax",
              path: "/",
              maxAge: 300,
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
