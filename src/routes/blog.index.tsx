import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import BlogClient from "@/features/blog/BlogClient";
import { getPublishedBlogs } from "@/lib/blog-public.server";
import { CanonicalLink } from "@/components/CanonicalLink";

const description = "Stories, recaps and technical writing from IEEE Sahrdaya Student Branch — events, societies, members and technology.";

export const meta = () => [
  { title: "Blog | IEEE Sahrdaya Student Branch" },
  { name: "description", content: description },
  { property: "og:title", content: "Blog | IEEE Sahrdaya Student Branch" },
  { property: "og:description", content: description },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/blog` },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Blog | IEEE Sahrdaya Student Branch" },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: `${APP_URL}/web.png` },
];
export async function loader() {
  try { return await getPublishedBlogs(); } catch { return []; }
}

export default function BlogPage() {
  const blogs = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path="/blog" />
    <ErrorBoundary>
      <BlogClient blogs={blogs} />
    </ErrorBoundary>
    </>
  );
}
