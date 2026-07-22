import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ArrowLeft, Building2, CalendarDays, Clock } from "lucide-react";
import { getBlogBySlug } from "@/lib/blog-public.server";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import type { BlogPost } from "@/types";

export const meta = ({ data }: { data?: BlogPost }) => {
  if (!data) return [{ title: "Article not found | IEEE Sahrdaya" }];
  return [
    { title: `${data.title} | IEEE Sahrdaya Blog` },
    { name: "description", content: data.excerpt || "Read this article on the IEEE Sahrdaya Blog." },
    { property: "og:title", content: data.title },
    { property: "og:description", content: data.excerpt || "" },
    { property: "og:url", content: `${APP_URL}/blog/${data.slug}` },
    { property: "og:image", content: data.coverUrl || `${APP_URL}/web.png` },
    { property: "og:type", content: "article" },
  ];
};

export async function loader({ params }: LoaderFunctionArgs): Promise<BlogPost> {
  if (!params.slug) throw new Response("Article not found", { status: 404 });
  const post = await getBlogBySlug(params.slug);
  if (!post) throw new Response("Article not found", { status: 404 });
  return post as BlogPost;
}

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

export default function BlogPostPage() {
  const post = useLoaderData<typeof loader>();
  const author =
    typeof post.author === "string"
      ? post.author
      : post.author?.name || "IEEE Sahrdaya";
  const society = typeof post.society === "string" ? undefined : post.society;
  const event = typeof post.event === "string" ? undefined : post.event;

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground font-sans">
        <Navbar />

        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
          }}
        />

        <main className="relative z-10 mx-auto w-full max-w-[900px] px-5 pb-24 pt-32 md:px-10">
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

              <h1 className="mt-6 text-balance font-display text-4xl leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
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
                      to={`/societies/${society.slug}`}
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
              <figure className="mx-auto mt-10 overflow-hidden rounded-3xl border border-border bg-muted shadow-sm ring-1 ring-black/5">
                <img
                  src={post.coverUrl}
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                />
              </figure>
            )}

            <div
              className="prose-blog mx-auto mt-12 max-w-[700px] text-[17px] leading-[1.85] text-foreground/90
                [&>p]:mb-7
                [&>h1]:mb-5 [&>h1]:mt-12 [&>h1]:text-3xl [&>h1]:font-black [&>h1]:tracking-tight sm:[&>h1]:text-4xl
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
