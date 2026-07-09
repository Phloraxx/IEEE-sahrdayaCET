import { createFileRoute } from "@tanstack/react-router";
import { serialize } from "cookie";
import { APP_URL, PB_AUTH_COOKIE, PB_OAUTH_PROVIDER_COOKIE } from "@/lib/constants";
import { verifySameOrigin } from "@/lib/verify-same-origin";

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
        const cookieDomain = getCookieDomain(APP_URL);
        const clearOpts = {
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax" as const,
          path: "/",
          maxAge: 0,
        };
        // Clear host-only cookies
        response.headers.set("Set-Cookie", serialize(PB_AUTH_COOKIE, "", clearOpts));
        response.headers.append("Set-Cookie", serialize(PB_OAUTH_PROVIDER_COOKIE, "", clearOpts));
        // Clear domain-wide variants (set at login with Domain=.ieeesahrdaya.com)
        if (cookieDomain) {
          response.headers.append(
            "Set-Cookie",
            serialize(PB_AUTH_COOKIE, "", { ...clearOpts, domain: cookieDomain }),
          );
          response.headers.append(
            "Set-Cookie",
            serialize(PB_OAUTH_PROVIDER_COOKIE, "", { ...clearOpts, domain: cookieDomain }),
          );
        }
        return response;
      },
    },
  },
});
