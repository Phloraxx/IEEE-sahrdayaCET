import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import BlogClient from "@/features/blog/BlogClient";
import { getPublishedBlogs } from "@/lib/blog-public.server";

export const meta = () => [
  { title: "Blog | IEEE Sahrdaya Student Branch" },
  { name: "description", content: "Stories, recaps and technical writing from IEEE Sahrdaya Student Branch — events, societies, members and technology." },
  { property: "og:title", content: "Blog | IEEE Sahrdaya Student Branch" },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/blog` },
];
export async function loader() {
  try { return await getPublishedBlogs(); } catch { return []; }
}

export default function BlogPage() {
  const blogs = useLoaderData<typeof loader>();
  return (
    <ErrorBoundary>
      <BlogClient blogs={blogs} />
    </ErrorBoundary>
  );
}
