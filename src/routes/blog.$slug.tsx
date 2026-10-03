import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, Clock } from "lucide-react";
import { getBlogBySlug, getPublishedBlogs } from "@/lib/blog-public.server";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { StarsBackground } from "@/components/ui/stars-background";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import { formatDateLong, formatDateShort } from "@/lib/dates";
import { getBlogContentType } from "@/lib/blog-presentation";
import type { BlogPost } from "@/types";

type ArticleData = { post: BlogPost; related: BlogPost[] };
type Heading = { id: string; text: string; level: 2 | 3 };

export const meta = ({ data }: { data?: ArticleData }) => {
  const post = data?.post;
  if (!post) return [{ title: "Article not found | IEEE Sahrdaya" }];
  return [
    { title: `${post.title} | IEEE Sahrdaya Blog` },
    { name: "description", content: post.excerpt || "Read this article on the IEEE Sahrdaya Blog." },
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.excerpt || "" },
    { property: "og:url", content: `${APP_URL}/blog/${post.slug}` },
    { property: "og:image", content: post.coverUrl || `${APP_URL}/web.png` },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: post.title },
    { name: "twitter:description", content: post.excerpt || "" },
    { name: "twitter:image", content: post.coverUrl || `${APP_URL}/web.png` },
  ];
};

export async function loader({ params }: LoaderFunctionArgs): Promise<ArticleData> {
  if (!params.slug) throw new Response("Article not found", { status: 404 });
  const [post, all] = await Promise.all([getBlogBySlug(params.slug), getPublishedBlogs().catch(() => [])]);
  if (!post) throw new Response("Article not found", { status: 404 });
  const candidates = all.filter((item) => item.id !== post.id);
  const related = [
    ...candidates.filter((item) => post.topicLabel && item.topicLabel === post.topicLabel),
    ...candidates.filter((item) => post.category && item.category === post.category && item.topicLabel !== post.topicLabel),
    ...candidates,
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 3);
  return { post: post as BlogPost, related: related as BlogPost[] };
}

function slugifyHeading(text: string, index: number) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `${slug}-${index + 1}` : `section-${index + 1}`;
}

function prepareArticleHtml(content?: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  let index = 0;
  const html = (content || "").replace(/<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_match, level, inner) => {
    const text = blogHtmlToPlainText(inner).trim();
    const id = slugifyHeading(text, index++);
    headings.push({ id, text, level: Number(level) as 2 | 3 });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html, headings };
}

function ArticleContents({ headings }: { headings: Heading[] }) {
  return (
    <nav aria-label="Article contents">
      <ol className="border-l border-gray-200 pl-3">
        {headings.map((heading, index) => (
          <li key={heading.id} className={heading.level === 3 ? "ml-3" : ""}>
            <a href={`#${heading.id}`} className="flex min-h-11 items-start gap-2 py-3 text-sm leading-5 text-gray-700 transition hover:text-ieee-blue [overflow-wrap:anywhere]">
              <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-gray-500">{String(index + 1).padStart(2, "0")}</span>
              <span>{heading.text}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function authorName(post: BlogPost) {
  return typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
}


export default function BlogPostPage() {
  const { post, related } = useLoaderData<typeof loader>();
  const author = authorName(post);
  const society = typeof post.society === "string" ? undefined : post.society;
  const event = typeof post.event === "string" ? undefined : post.event;
  const canonicalUrl = `${APP_URL}/blog/${post.slug}`;
  const article = prepareArticleHtml(post.content);
  const storyType = getBlogContentType(post);
  const blogSchema = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title,
    description: post.excerpt || undefined, image: post.coverUrl ? [post.coverUrl] : [`${APP_URL}/web.png`],
    datePublished: post.publishedAt || undefined, dateModified: post.updatedAt || post.publishedAt || undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl }, author: { "@type": "Person", name: author },
    publisher: { "@type": "Organization", name: "IEEE Sahrdaya Student Branch", logo: { "@type": "ImageObject", url: `${APP_URL}/ieee-logo-square.png` } },
  };

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-white text-gray-900 selection:bg-ieee-blue/20">
        <link rel="canonical" href={canonicalUrl} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema).replace(/</g, "\\u003c") }} />
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <StarsBackground starDensity={0.00028} allStarsTwinkle starColor="#1e293b" />
          <ShootingStars starColor="#00629b" trailColor="#0099D6" minDelay={5200} maxDelay={9800} minSpeed={7} maxSpeed={15} starWidth={8} starHeight={1} />
        </div>
        <Navbar />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[100dvh]"><TechnicalDetails /></div>

        <main className="relative z-20 mx-auto w-full max-w-[1240px] px-5 pb-24 pt-16 sm:px-6 sm:pt-20 md:pt-32 lg:px-10">
          <article>
            <header id="article-start" tabIndex={-1} data-testid="blog-article-header" className="scroll-mt-4 border-t border-gray-200 pt-6 sm:pt-8 md:scroll-mt-28">
              <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                <Link to="/blog/" className="inline-flex min-h-11 items-center gap-2 text-gray-700 transition hover:text-ieee-blue"><ArrowLeft className="h-3.5 w-3.5" /> Blog / Archive</Link>
                <div className="flex flex-wrap gap-x-4 gap-y-2"><span>{storyType}</span>{post.publishedAt ? <span>{formatDateShort(post.publishedAt)}</span> : null}<span>{post.readMinutes || 1} min</span></div>
              </div>

              <div className="mt-7 grid gap-6 border-b border-gray-200 pb-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-stretch lg:gap-10 sm:pb-10">
                <div className="flex min-w-0 flex-col justify-end">
                  <p className="font-pixel text-[11px] text-ieee-blue">IEEE SAHRDAYA / BLOG</p>
                  <h1 className="mt-4 max-w-4xl break-words text-balance text-[clamp(2.25rem,6vw,2.65rem)] font-bold leading-[1.04] tracking-[-0.05em] text-gray-950 sm:text-[4.1rem] lg:text-[5rem]">{post.title}</h1>
                  <div className="mt-6 h-1 w-20 bg-ieee-blue" />
                </div>
                <aside className="flex min-w-0 flex-col justify-between rounded-xl bg-gray-950 p-5 text-white sm:p-6" aria-label="Story summary">
                  <div><p className="font-pixel text-[9px] text-blue-300">STORY FILE</p>{post.excerpt ? <p className="mt-4 text-sm leading-6 text-white/70 sm:text-base">{post.excerpt}</p> : null}</div>
                  <div className="mt-7 border-t border-white/10 pt-4 font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-white/70"><span className="break-words text-white/90">By {author}</span>{post.publishedAt ? <span className="block">{formatDateLong(post.publishedAt)}</span> : null}<span className="block">{post.readMinutes || 1} min read</span></div>
                </aside>
              </div>
            </header>

            {post.coverUrl ? <figure className="relative mt-8 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm sm:mt-10"><img src={post.coverUrl} alt="" className="aspect-[16/8.5] w-full object-cover" /><figcaption className="absolute bottom-0 left-0 bg-gray-950/85 px-3 py-2 font-pixel text-[8px] text-white backdrop-blur-sm">{storyType} / 01</figcaption></figure> : null}

            <div className="mt-10 grid gap-10 xl:grid-cols-[170px_minmax(0,720px)_minmax(0,1fr)] xl:items-start xl:gap-12">
              {article.headings.length > 1 ? (
                <details data-testid="article-mobile-contents" className="mx-auto w-full max-w-[760px] border-y border-gray-200 xl:hidden">
                  <summary className="min-h-11 cursor-pointer py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-700">Article contents · {article.headings.length} sections</summary>
                  <div className="pb-4"><ArticleContents headings={article.headings} /></div>
                </details>
              ) : null}
              <aside className="hidden min-w-0 xl:block">
                {article.headings.length > 1 ? (
                  <div className="sticky top-28">
                    <p className="mb-4 font-pixel text-[10px] text-gray-700">CONTENTS</p>
                    <ArticleContents headings={article.headings} />
                  </div>
                ) : <div className="font-pixel text-[10px] leading-6 text-gray-600">BLOG ENTRY<br />IEEE SAHRDAYA</div>}
              </aside>

              <div data-testid="article-body" className="prose-blog [overflow-wrap:anywhere] [&_pre]:[overflow-wrap:normal] mx-auto w-full max-w-[760px] min-w-0 text-[17px] leading-[1.85] text-gray-800 xl:mx-0 xl:max-w-none [&>p]:mb-7 [&>h1]:mb-5 [&>h1]:mt-12 [&>h1]:scroll-mt-28 [&>h1]:border-t [&>h1]:border-gray-200 [&>h1]:pt-6 [&>h1]:text-3xl [&>h1]:font-bold [&>h1]:tracking-tight [&>h2]:mb-5 [&>h2]:mt-12 [&>h2]:scroll-mt-28 [&>h2]:border-t [&>h2]:border-gray-200 [&>h2]:pt-6 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:tracking-[-0.025em] [&>h3]:mb-4 [&>h3]:mt-10 [&>h3]:scroll-mt-28 [&>h3]:text-2xl [&>h3]:font-bold [&>ul]:mb-7 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:mb-2 [&>ol]:mb-7 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:mb-2 [&>blockquote]:my-9 [&>blockquote]:border-l-2 [&>blockquote]:border-ieee-blue [&>blockquote]:bg-blue-50/60 [&>blockquote]:py-3 [&>blockquote]:pl-5 [&>blockquote]:pr-4 [&>blockquote]:text-lg [&>blockquote]:italic [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:rounded-lg [&>pre]:bg-gray-950 [&>pre]:p-5 [&>pre]:text-sm [&>pre]:text-gray-100 [&>code]:bg-gray-100 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-sm [&_a]:font-semibold [&_a]:text-ieee-blue [&_a]:underline [&_a]:underline-offset-4" dangerouslySetInnerHTML={{ __html: article.html }} />

              <aside className="mx-auto w-full max-w-[760px] xl:sticky xl:top-28 xl:mx-0 xl:max-w-none">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="font-pixel text-[8px] text-ieee-blue">STORY DATA</p><dl className="mt-4 space-y-4 text-xs text-gray-500"><div><dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600">Author</dt><dd className="mt-1 break-words font-semibold text-gray-800">{author}</dd></div><div><dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600">Reading time</dt><dd className="mt-1 inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.readMinutes || 1} minutes</dd></div></dl>{(society?.slug || event) ? <div className="mt-5 border-t border-gray-100 pt-4"><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600">Connected to</p>{society?.slug ? <Link to={`/societies/${society.slug}`} className="mt-2 flex min-h-11 items-center gap-2 break-words text-sm font-semibold text-gray-700 transition hover:text-ieee-blue"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{society.name || "Society"}</Link> : null}{event ? <Link to={event.slug ? `/events/${event.slug}` : "/events"} className="mt-2 flex min-h-11 items-center gap-2 break-words text-sm font-semibold text-gray-700 transition hover:text-ieee-blue"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />{event.title}</Link> : null}</div> : null}</div>
              </aside>
            </div>

            {related.length > 0 ? <section className="mt-16 border-t border-gray-200 pt-8 sm:mt-20 sm:pt-10"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-pixel text-[9px] text-ieee-blue">NEXT SIGNALS</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.035em]">More from the blog.</h2></div><Link to="/blog/" className="inline-flex min-h-11 items-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600 transition hover:text-ieee-blue">Browse archive ↗</Link></div><div className="mt-6 grid gap-5 md:grid-cols-3">{related.map((item, index) => <Link key={item.id} to={`/blog/${item.slug}`} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-ieee-blue/30 hover:shadow-md"><div className="relative aspect-[16/10] overflow-hidden bg-gray-100">{item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : null}<span className="absolute left-3 top-3 bg-gray-950 px-2 py-1 font-pixel text-[7px] text-white">{String(index + 1).padStart(2, "0")}</span></div><div className="p-4"><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ieee-blue">{item.topicLabel || item.category || "Story"}</p><h3 className="mt-1.5 break-words text-lg font-bold leading-tight tracking-[-0.02em] text-gray-900 transition group-hover:text-ieee-blue">{item.title}</h3><div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3"><span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-600">{item.readMinutes || 1} min read</span><ArrowUpRight className="h-4 w-4 text-gray-300 transition group-hover:text-ieee-blue" /></div></div></Link>)}</div></section> : null}
            <nav aria-label="Article navigation" className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 py-6">
              <Link to="/blog/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ieee-blue">Open archive <ArrowUpRight className="h-4 w-4" /></Link>
              <a href="#article-start" className="inline-flex min-h-11 items-center text-sm font-semibold text-gray-700 transition hover:text-ieee-blue">Back to top ↑</a>
            </nav>
          </article>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
