import { createFileRoute } from "@tanstack/react-router";
import { parse, serialize } from "cookie";
import { OAUTH_CALLBACK_PATH, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { logError } from "@/lib/logger";
import PocketBase from "pocketbase";
import { verifySignedCookie } from "@/lib/cookie-signing";
export const Route = createFileRoute("/api/auth/callback/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookies = parse(request.headers.get("cookie") || "");
        const providerCookie = cookies[PB_OAUTH_PROVIDER_COOKIE];

        const appUrl =
          process.env.PUBLIC_APP_URL || `${url.protocol}//${url.host}`;

        if (!code || !state || !providerCookie) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", appUrl).toString() } });
        }

        const provider = verifySignedCookie(decodeURIComponent(providerCookie));
        if (!provider || provider.state !== state) {
          return new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", appUrl).toString() } });
        }

        const redirectUrl = `${appUrl}${OAUTH_CALLBACK_PATH}`;

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
          const response = new Response(null, { status: 302, headers: { Location: appUrl } });

          const authCookie = pb.authStore.exportToCookie({
              httpOnly: true,
              secure: isProduction,
              sameSite: "strict",
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
          const response = new Response(null, { status: 302, headers: { Location: new URL("/?error=auth_failed", appUrl).toString() } });
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
