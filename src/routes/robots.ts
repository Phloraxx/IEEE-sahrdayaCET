import { APP_URL } from "@/lib/constants";

export async function loader() {
  const production = process.env.DEPLOY_ENV === "production";
  const body = production
    ? `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /ticket/\nDisallow: /register/\nDisallow: /api/\nSitemap: ${APP_URL}/sitemap.xml\n`
    : "User-agent: *\nDisallow:\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": production ? "public, max-age=300, s-maxage=3600" : "no-store",
      ...(production ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
