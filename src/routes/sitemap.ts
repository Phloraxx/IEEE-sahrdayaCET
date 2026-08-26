import { APP_URL } from "@/lib/constants";
import { getPublishedBlogs } from "@/lib/blog-public.server";
import { fetchEvents } from "@/server/public/events.server";
import { fetchSocieties } from "@/server/public/societies.server";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastmod?: string): string {
  const loc = xmlEscape(`${APP_URL}${path}`);
  const modified = lastmod ? `<lastmod>${xmlEscape(new Date(lastmod).toISOString())}</lastmod>` : "";
  return `<url><loc>${loc}</loc>${modified}</url>`;
}

export async function loader() {
  if (process.env.DEPLOY_ENV !== "production") {
    return new Response("Not Found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
    });
  }

  const [events, blogs, societies] = await Promise.all([
    fetchEvents(),
    getPublishedBlogs().catch(() => []),
    fetchSocieties(),
  ]);

  const entries = [
    urlEntry("/"),
    urlEntry("/events"),
    urlEntry("/blog"),
    urlEntry("/societies"),
    urlEntry("/full-execom"),
    urlEntry("/terms-and-conditions"),
    urlEntry("/privacy-policy"),
    urlEntry("/refund-and-cancellation-policy"),
    urlEntry("/return-policy"),
    urlEntry("/shipping-policy"),
    ...events.filter((event) => event.slug).map((event) => urlEntry(`/events/${encodeURIComponent(event.slug)}`, event.updatedAt)),
    ...blogs.filter((blog) => blog.slug).map((blog) => urlEntry(`/blog/${encodeURIComponent(blog.slug)}`, blog.updatedAt)),
    ...societies.filter((society) => society.slug).map((society) => urlEntry(`/societies/${encodeURIComponent(society.slug)}`, society.updatedAt)),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
