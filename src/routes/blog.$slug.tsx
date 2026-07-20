import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, CalendarDays, Clock } from "lucide-react";
import { getBlogBySlug } from "./api/-blogs";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import type { BlogPost } from "@/types";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ loaderData }) => {
    const post = loaderData as BlogPost | undefined;
    if (!post) return { meta: [{ title: "Not Found" }] };

    return {
      meta: [
        { title: `${post.title} | IEEE Sahrdaya Blog` },
        {
          name: "description",
          content: post.excerpt || "Read this article on the IEEE Sahrdaya Blog.",
        },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.excerpt || "" },
        { property: "og:url", content: `${APP_URL}/blog/${post.slug}` },
        { property: "og:image", content: post.coverUrl || `${APP_URL}/web.png` },
        { property: "og:type", content: "article" },
        ...(post.publishedAt
          ? [{ property: "article:published_time", content: post.publishedAt }]
          : []),
      ],
      links: [{ rel: "canonical", href: `${APP_URL}/blog/${post.slug}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt || undefined,
            image: post.coverUrl || `${APP_URL}/web.png`,
            datePublished: post.publishedAt || undefined,
            author: {
              "@type": "Person",
              name:
                typeof post.author === "string"
                  ? post.author
                  : post.author?.name || "IEEE Sahrdaya",
            },
            publisher: {
              "@type": "Organization",
              name: "IEEE Sahrdaya Student Branch",
              url: APP_URL,
            },
          })
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        },
      ],
    };
  },
  loader: async ({ params }) => {
    const post = await getBlogBySlug({ data: params.slug });
    if (!post) throw new Error("Blog post not found");
    return post;
  },
  component: BlogPostPage,
});

function formatPublishedDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function BlogPostPage() {
  const post = Route.useLoaderData() as BlogPost;
  const author =
    typeof post.author === "string"
      ? post.author
      : post.author?.name || "IEEE Sahrdaya";
  const society = typeof post.society === "string" ? undefined : post.society;
  const event = typeof post.event === "string" ? undefined : post.event;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
          <Link
            to="/blog/"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All stories
          </Link>

          <article className="mt-8">
            <header className="mx-auto max-w-4xl text-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {post.topicLabel && (
                  <span className="rounded-full bg-ieee-blue/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-ieee-blue ring-1 ring-ieee-blue/15">
                    {post.topicLabel}
                  </span>
                )}
                {post.category && (
                  <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {post.category}
                  </span>
                )}
              </div>

              <h1 className="mt-6 text-balance font-display text-5xl leading-[0.92] tracking-tight sm:text-6xl md:text-7xl">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mx-auto mt-6 max-w-3xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {post.excerpt}
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
                <span className="font-bold text-foreground">{author}</span>
                {formatPublishedDate(post.publishedAt) && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatPublishedDate(post.publishedAt)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> {post.readMinutes || 1} min read
                </span>
              </div>

              {(society || event) && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {society?.slug && (
                    <Link
                      to="/societies/$slug"
                      params={{ slug: society.slug }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ieee-blue/30 hover:text-ieee-blue"
                    >
                      <Building2 className="h-3.5 w-3.5" /> {society.name || "Society"}
                    </Link>
                  )}
                  {event && (
                    <Link
                      to="/events"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ieee-blue/30 hover:text-ieee-blue"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> {event.title}
                    </Link>
                  )}
                </div>
              )}
            </header>

            {post.coverUrl && (
              <figure className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-muted shadow-xl shadow-black/5">
                <img
                  src={post.coverUrl}
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                />
              </figure>
            )}

            <div
              className="prose-blog mx-auto mt-12 max-w-3xl text-[17px] leading-[1.85] text-foreground/90
                [&>p]:mb-7
                [&>h2]:mb-5 [&>h2]:mt-12 [&>h2]:text-3xl [&>h2]:font-black [&>h2]:tracking-tight
                [&>h3]:mb-4 [&>h3]:mt-10 [&>h3]:text-2xl [&>h3]:font-bold
                [&>ul]:mb-7 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:mb-2
                [&>ol]:mb-7 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:mb-2
                [&>blockquote]:my-9 [&>blockquote]:border-l-4 [&>blockquote]:border-ieee-blue [&>blockquote]:bg-ieee-blue/5 [&>blockquote]:py-3 [&>blockquote]:pl-6 [&>blockquote]:pr-4 [&>blockquote]:text-lg [&>blockquote]:italic
                [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:rounded-2xl [&>pre]:bg-slate-950 [&>pre]:p-5 [&>pre]:text-sm [&>pre]:text-slate-100
                [&>code]:rounded-md [&>code]:bg-muted [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-sm
                [&_a]:font-semibold [&_a]:text-ieee-blue [&_a]:underline [&_a]:underline-offset-4"
              dangerouslySetInnerHTML={{ __html: post.content || "" }}
            />

            <div className="mx-auto mt-14 flex max-w-3xl items-center justify-between gap-4 border-t border-border pt-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Keep reading</p>
                <p className="mt-1 text-sm font-semibold">Explore more stories from IEEE Sahrdaya.</p>
              </div>
              <Link
                to="/blog/"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-background"
              >
                All stories <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
              </Link>
            </div>
          </article>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
