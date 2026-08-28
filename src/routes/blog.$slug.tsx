import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, Clock } from "lucide-react";
import { getBlogBySlug, getPublishedBlogs } from "@/lib/blog-public.server";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_URL } from "@/lib/constants";
import { formatDateLong, formatDateShort } from "@/lib/dates";
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
  const [post, all] = await Promise.all([getBlogBySlug(params.slug), getPublishedBlogs()]);
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
  const blogSchema = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title,
    description: post.excerpt || undefined, image: post.coverUrl ? [post.coverUrl] : [`${APP_URL}/web.png`],
    datePublished: post.publishedAt || undefined, dateModified: post.updatedAt || post.publishedAt || undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl }, author: { "@type": "Person", name: author },
    publisher: { "@type": "Organization", name: "IEEE Sahrdaya Student Branch", logo: { "@type": "ImageObject", url: `${APP_URL}/ieee-logo-square.png` } },
  };

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#faf9f6] text-slate-950 font-sans">
        <link rel="canonical" href={canonicalUrl} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema).replace(/</g, "\\u003c") }} />
        <Navbar />
        <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.025] mix-blend-multiply" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>\")" }} />

        <main className="relative z-10 mx-auto w-full max-w-[1240px] px-5 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-10">
          <article>
            <header data-testid="blog-article-header" className="border-y border-slate-200 py-5 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-slate-400 sm:text-[9px]">
                <Link to="/blog/" className="inline-flex items-center gap-2 text-slate-600 transition hover:text-ieee-blue"><ArrowLeft className="h-3.5 w-3.5" /> Blog / All stories</Link>
                <div className="flex gap-4"><span>{post.topicLabel || post.category || "Story"}</span>{post.publishedAt ? <span>{formatDateShort(post.publishedAt)}</span> : null}<span>{post.readMinutes || 1} min read</span></div>
              </div>

              <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end lg:gap-14">
                <div>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">IEEE Sahrdaya / Journal</p>
                  <h1 className="mt-4 max-w-4xl text-balance text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[4rem] lg:text-[5rem]">{post.title}</h1>
                </div>
                <div className="border-l border-slate-200 pl-5">
                  {post.excerpt ? <p className="text-base leading-7 text-slate-500">{post.excerpt}</p> : null}
                  <div className="mt-5 border-t border-slate-200 pt-4 font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.15em] text-slate-400">
                    <span className="text-slate-800">By {author}</span>
                    {post.publishedAt ? <span className="block">Published {formatDateLong(post.publishedAt)}</span> : null}
                  </div>
                </div>
              </div>
            </header>

            {post.coverUrl ? <figure className="mt-8 overflow-hidden bg-slate-100 sm:mt-10"><img src={post.coverUrl} alt="" className="aspect-[16/8.5] w-full object-cover" /></figure> : null}

            <div className="mt-10 grid gap-10 xl:grid-cols-[160px_minmax(0,700px)_minmax(0,1fr)] xl:items-start xl:gap-12">
              <aside className="hidden xl:block">
                {article.headings.length > 1 ? <nav aria-label="Article contents" className="sticky top-28"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400">In this story</p><ol className="mt-4 border-l border-slate-200 pl-4">{article.headings.map((heading, index) => <li key={heading.id} className={heading.level === 3 ? "ml-3" : ""}><a href={`#${heading.id}`} className="block py-1.5 text-xs leading-4 text-slate-500 transition hover:text-ieee-blue"><span className="mr-2 font-mono text-[7px] text-slate-300">{String(index + 1).padStart(2, "0")}</span>{heading.text}</a></li>)}</ol></nav> : <div className="font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-400">Journal entry<br />IEEE Sahrdaya</div>}
              </aside>

              <div className="prose-blog mx-auto w-full max-w-[760px] min-w-0 xl:mx-0 xl:max-w-none text-[17px] leading-[1.85] text-slate-800 [&>p]:mb-7 [&>h1]:mb-5 [&>h1]:mt-12 [&>h1]:scroll-mt-28 [&>h1]:text-3xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>h2]:mb-5 [&>h2]:mt-12 [&>h2]:scroll-mt-28 [&>h2]:text-3xl [&>h2]:font-semibold [&>h2]:tracking-[-0.025em] [&>h3]:mb-4 [&>h3]:mt-10 [&>h3]:scroll-mt-28 [&>h3]:text-2xl [&>h3]:font-semibold [&>ul]:mb-7 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:mb-2 [&>ol]:mb-7 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:mb-2 [&>blockquote]:my-9 [&>blockquote]:border-l-2 [&>blockquote]:border-ieee-blue [&>blockquote]:py-1 [&>blockquote]:pl-5 [&>blockquote]:text-lg [&>blockquote]:italic [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:bg-slate-950 [&>pre]:p-5 [&>pre]:text-sm [&>pre]:text-slate-100 [&>code]:bg-slate-100 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-sm [&_a]:font-semibold [&_a]:text-ieee-blue [&_a]:underline [&_a]:underline-offset-4" dangerouslySetInnerHTML={{ __html: article.html }} />

              <aside className="mx-auto w-full max-w-[760px] border-t border-slate-200 pt-5 xl:sticky xl:top-28 xl:mx-0 xl:max-w-none xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400">Story details</p>
                <dl className="mt-4 space-y-4 text-xs text-slate-500"><div><dt className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-300">Author</dt><dd className="mt-1 font-semibold text-slate-800">{author}</dd></div><div><dt className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-300">Reading time</dt><dd className="mt-1 inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.readMinutes || 1} minutes</dd></div></dl>
                {(society?.slug || event) ? <div className="mt-5 border-t border-slate-200 pt-4"><p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-300">Connected to</p>{society?.slug ? <Link to={`/societies/${society.slug}`} className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-700 transition hover:text-ieee-blue"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{society.name || "Society"}</Link> : null}{event ? <Link to={event.slug ? `/events/${event.slug}` : "/events"} className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-700 transition hover:text-ieee-blue"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />{event.title}</Link> : null}</div> : null}
              </aside>
            </div>

            {related.length > 0 ? <section className="mt-16 border-t border-slate-200 pt-7 sm:mt-20"><div className="flex items-end justify-between gap-6"><div><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Continue reading</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">More from the journal</h2></div><Link to="/blog/" className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-ieee-blue">All stories ↗</Link></div><div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">{related.map((item, index) => <Link key={item.id} to={`/blog/${item.slug}`} className="group grid gap-4 py-5 sm:grid-cols-[40px_1fr_140px_20px] sm:items-center"><span className="font-mono text-[8px] font-semibold text-slate-300">{String(index + 1).padStart(2, "0")}</span><div><p className="font-mono text-[7px] font-semibold uppercase tracking-[0.15em] text-ieee-blue">{item.topicLabel || item.category || "Story"}</p><h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-800 transition group-hover:text-ieee-blue">{item.title}</h3></div>{item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" className="hidden h-16 w-full object-cover sm:block" /> : <div className="hidden h-16 border border-dashed border-slate-200 sm:block" />}<ArrowUpRight className="hidden h-4 w-4 text-slate-300 transition group-hover:text-ieee-blue sm:block" /></Link>)}</div></section> : null}
          </article>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
