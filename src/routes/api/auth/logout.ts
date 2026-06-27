import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import { PB_AUTH_COOKIE, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { logError } from "@/lib/logger";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
          return Response.json({ error: 'Unsupported media type' }, { status: 415 });
        }
        const isProduction = process.env.NODE_ENV === "production";

        // CSRF defense: require exact same-origin using URL constructor.
        const origin = request.headers.get("origin");
        const appUrl = process.env.PUBLIC_APP_URL;
        if (!appUrl) {
          if (process.env.NODE_ENV === "production") {
            return Response.json(
              { error: "Server misconfigured" },
              { status: 500 },
            );
          }
          // dev: skip check
        } else if (origin) {
          try {
            const appOrigin = new URL(appUrl).origin;
            const requestOrigin = new URL(origin).origin;
            if (appOrigin !== requestOrigin) {
              return Response.json(
                { error: "Invalid origin" },
                { status: 403 },
              );
            }
          } catch {
            logError("LogoutCSRF", "Failed to parse origin", {
              origin,
              appUrl,
            });
            return Response.json(
              { error: "Invalid origin" },
              { status: 403 },
            );
          }
        }

        const response = Response.json({ success: true });
        // Clear the pb_auth cookie (Secure in prod, plain in dev for HTTP).
        response.headers.set(
          "Set-Cookie",
          serialize(PB_AUTH_COOKIE, "", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          }),
        );
        // Also clear the one-time OAuth provider cookie if still present.
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
      },
    },
  },
});
