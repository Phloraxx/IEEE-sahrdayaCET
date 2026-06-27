import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import { PB_AUTH_COOKIE, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
          return Response.json({ error: 'Unsupported media type' }, { status: 415 });
        }
        const isProduction = process.env.NODE_ENV === "production";

        try {
          verifySameOrigin(request);
        } catch {
          return Response.json({ error: 'Invalid origin' }, { status: 403 });
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
