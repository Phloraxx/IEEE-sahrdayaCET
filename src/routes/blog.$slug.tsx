import { createFileRoute } from "@tanstack/react-router";
import { getBlogBySlug } from "./api/-blogs";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Clock } from "lucide-react";
import { APP_URL } from "@/lib/constants";
import type { BlogPost } from "@/types";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ loaderData }) => {
    const post = loaderData as BlogPost | undefined;
    if (!post) return { meta: [{ title: "Not Found" }] };
    
    return {
      meta: [
        { title: `${post.title} | IEEE Sahrdaya Blog` },
        { name: "description", content: post.excerpt || "Read this article on the IEEE Sahrdaya Blog." },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.excerpt || "" },
        { property: "og:url", content: `${APP_URL}/blog/${post.slug}` },
        { property: "og:image", content: post.coverUrl || `${APP_URL}/web.png` },
      ],
      links: [{ rel: "canonical", href: `${APP_URL}/blog/${post.slug}` }],
    };
  },
  loader: async ({ params }) => {
    const post = await getBlogBySlug({ data: params.slug });
    if (!post) {
      throw new Error("Blog post not found");
    }
    return post;
  },
  component: BlogPostPage,
});

function BlogPostPage() {
  const post = Route.useLoaderData() as BlogPost;
  
  return (
    <ErrorBoundary>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground font-sans">
        <Navbar />

        {/* Soft paper grain to match the blog aesthetic */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
          }}
        />

        <main className="relative z-10 mx-auto w-full max-w-[900px] px-5 pt-32 pb-24 md:px-10">
          <article>
            {/* Header & Meta Information */}
            <header className="mb-10 text-center">
              {post.topicLabel && (
                <span className="mb-6 inline-block rounded-full bg-accent/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent ring-1 ring-accent/20">
                  {post.topicLabel}
                </span>
              )}
              
              <h1 className="mb-8 text-balance font-display text-4xl leading-[0.95] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                {post.title}
              </h1>
              
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="text-foreground">
                  {typeof post.author === 'string' ? post.author : post.author?.name || 'IEEE Sahrdaya'}
                </span>
                <span>&bull;</span>
                <span>
                  {post.publishedAt 
                    ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) 
                    : ''}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> {post.readMinutes || 5} min read
                </span>
              </div>
            </header>

            {/* Featured Cover Image */}
            {post.coverUrl && (
              <figure className="mb-14 overflow-hidden rounded-3xl border border-border bg-muted shadow-sm ring-1 ring-black/5">
                <img 
                  src={post.coverUrl} 
                  alt={post.title} 
                  className="aspect-[16/9] w-full object-cover transition-transform duration-700 hover:scale-[1.02]" 
                />
              </figure>
            )}

            {/* Article Content Rendered as HTML */}
            <div 
              className="mx-auto max-w-[700px] font-sans text-lg leading-[1.8] text-foreground/90 
                [&>p]:mb-7 
                [&>h2]:mt-14 [&>h2]:mb-6 [&>h2]:font-display [&>h2]:text-3xl [&>h2]:tracking-tight [&>h2]:text-foreground
                [&>h3]:mt-10 [&>h3]:mb-4 [&>h3]:font-display [&>h3]:text-2xl [&>h3]:tracking-tight [&>h3]:text-foreground
                [&>ul]:mb-7 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:mb-2
                [&>ol]:mb-7 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:mb-2
                [&>blockquote]:my-10 [&>blockquote]:border-l-4 [&>blockquote]:border-accent [&>blockquote]:pl-6 [&>blockquote]:text-xl [&>blockquote]:italic [&>blockquote]:text-muted-foreground
                [&>img]:my-10 [&>img]:rounded-2xl [&>img]:border [&>img]:border-border [&>img]:shadow-sm
                [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:rounded-xl [&>pre]:bg-muted [&>pre]:p-5 [&>pre]:text-sm
                [&>code]:rounded-md [&>code]:bg-muted/50 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-sm [&>code]:text-accent
              "
              dangerouslySetInnerHTML={{ __html: post.content || '' }}
            />
          </article>
        </main>
        
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
