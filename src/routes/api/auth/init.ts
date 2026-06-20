import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import PocketBase from "pocketbase";
import { signCookie } from "@/lib/cookie-signing";
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from "@/lib/constants";

export const Route = createFileRoute("/api/auth/init")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = process.env.POCKETBASE_URL;
          if (!url) {
            return Response.json(
              { error: "Server configuration error" },
              { status: 500 },
            );
          }
          const nextUrl = new URL(request.url);
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            `${nextUrl.protocol}//${nextUrl.host}`;
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
          console.error("[auth-init]", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
