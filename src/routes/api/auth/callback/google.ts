import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import PocketBase from "pocketbase";
import { verifySignedCookie } from "@/lib/cookie-signing";
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from "@/lib/constants";

export const Route = createFileRoute("/api/auth/callback/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const providerCookie = request.headers
          .get("cookie")
          ?.split("; ")
          .find((row) => row.startsWith(`${PB_OAUTH_PROVIDER_COOKIE}=`))
          ?.slice(PB_OAUTH_PROVIDER_COOKIE.length + 1);

        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;

        if (!code || !state || !providerCookie) {
          return Response.redirect(new URL("/", appUrl));
        }

        const provider = verifySignedCookie(decodeURIComponent(providerCookie));
        if (!provider || provider.state !== state) {
          return Response.redirect(new URL("/", appUrl));
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
          const response = Response.redirect(new URL("/", appUrl));

          // Set the auth cookie
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
          console.error("[oauth-callback]", err);
          const isProduction = process.env.NODE_ENV === "production";
          const response = Response.redirect(new URL("/", appUrl));
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
