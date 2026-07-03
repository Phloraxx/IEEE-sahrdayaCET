import { createFileRoute } from "@tanstack/react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import BlogClient from "@/features/blog/BlogClient";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog | IEEE Sahrdaya Student Branch" },
      {
        name: "description",
        content:
          "Stories, recaps and technical writing from IEEE Sahrdaya Student Branch — events, societies, members and the technology we love.",
      },
      { property: "og:title", content: "Blog | IEEE Sahrdaya Student Branch" },
      {
        property: "og:description",
        content:
          "Stories, recaps and technical writing from IEEE Sahrdaya Student Branch — events, societies, members and the technology we love.",
      },
      { property: "og:url", content: `${APP_URL}/blog` },
      { property: "og:image", content: `${APP_URL}/web.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/blog` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${APP_URL}/blog` },
          ],
        })
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <ErrorBoundary>
      <BlogClient />
    </ErrorBoundary>
  );
}
