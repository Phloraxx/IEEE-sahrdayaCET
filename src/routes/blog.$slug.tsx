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

function postDate(post: BlogPost) {
  return post.publishedAt ? formatDateShort(post.publishedAt) : "";
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
      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f7f3ea] font-sans text-[#07101f]">
        <link rel="canonical" href={canonicalUrl} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema).replace(/</g, "\\u003c") }} />
        <Navbar />
        <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.04] mix-blend-multiply" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #00629b 0.7px, transparent 0.8px)", backgroundSize: "24px 24px" }} />

        <main className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-10">
          <article>
            <header data-testid="blog-article-header" className="overflow-hidden border border-slate-300 bg-[#fffdf7]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-slate-400 sm:px-6 sm:text-[9px]">
                <Link to="/blog/" className="inline-flex items-center gap-2 text-slate-700 transition hover:text-ieee-blue"><ArrowLeft className="h-3.5 w-3.5" /> Blog / All stories</Link>
                <div className="flex gap-4"><span>{post.topicLabel || post.category || "Story"}</span>{post.publishedAt ? <span>{formatDateShort(post.publishedAt)}</span> : null}<span>{post.readMinutes || 1} min read</span></div>
              </div>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_310px]">
                <div className="relative px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">IEEE Sahrdaya / Journal</p>
                  <h1 className="mt-4 max-w-5xl text-balance text-[2.7rem] font-semibold leading-[0.94] tracking-[-0.05em] text-[#07101f] sm:text-[4.2rem] lg:text-[5.35rem]">{post.title}</h1>
                  <span aria-hidden className="mt-5 block h-[5px] w-24 -rotate-1 bg-[#f05a42] sm:h-[7px] sm:w-36" />
                </div>

                <aside className="flex flex-col justify-between bg-[#07101f] p-5 text-white sm:p-6 lg:p-7">
                  <div>
                    <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-[#f05a42]">Story / {post.category || "Journal"}</p>
                    {post.excerpt ? <p className="mt-5 text-base leading-7 text-white/72">{post.excerpt}</p> : null}
                  </div>
                  <div className="mt-8 border-t border-white/12 pt-5 font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-white/45">
                    <p className="text-white/85">By {author}</p>
                    {post.publishedAt ? <p>Published {formatDateLong(post.publishedAt)}</p> : null}
                    <p>{post.readMinutes || 1} min read</p>
                  </div>
                </aside>
              </div>
            </header>

            {post.coverUrl ? (
              <figure className="relative mt-6 overflow-hidden border border-slate-300 bg-slate-100 sm:mt-8">
                <img src={post.coverUrl} alt="" className="aspect-[16/8.4] w-full object-cover" />
                <div className="absolute bottom-0 left-0 bg-[#f05a42] px-4 py-2.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-white">From the journal</div>
                <span aria-hidden className="absolute bottom-0 right-0 h-14 w-14 bg-ieee-blue [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
              </figure>
            ) : null}

            <div className="mt-10 grid gap-10 xl:grid-cols-[190px_minmax(0,760px)_250px] xl:items-start xl:gap-12">
              <aside className="hidden xl:block">
                {article.headings.length > 1 ? (
                  <nav aria-label="Article contents" className="sticky top-28">
                    <div className="flex items-center gap-2"><span className="h-2 w-2 bg-[#f05a42]" /><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">In this story</p></div>
                    <ol className="mt-4 border-l border-slate-300 pl-4">
                      {article.headings.map((heading, index) => <li key={heading.id} className={heading.level === 3 ? "ml-3" : ""}><a href={`#${heading.id}`} className="group block py-1.5 text-xs leading-4 text-slate-500 transition hover:text-ieee-blue"><span className="mr-2 font-mono text-[7px] text-slate-300 transition group-hover:text-[#f05a42]">{String(index + 1).padStart(2, "0")}</span>{heading.text}</a></li>)}
                    </ol>
                  </nav>
                ) : <div className="font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-400">Journal entry<br />IEEE Sahrdaya</div>}
              </aside>

              <div className="prose-blog mx-auto w-full max-w-[760px] min-w-0 text-[17px] leading-[1.9] text-slate-800 xl:mx-0 xl:max-w-none sm:text-[18px]
                [&>p]:mb-7 [&>p:first-of-type]:text-[1.08em] [&>p:first-of-type]:leading-[1.85]
                [&>h1]:mb-5 [&>h1]:mt-12 [&>h1]:scroll-mt-28 [&>h1]:text-3xl [&>h1]:font-semibold [&>h1]:tracking-tight
                [&>h2]:relative [&>h2]:mb-5 [&>h2]:mt-14 [&>h2]:scroll-mt-28 [&>h2]:border-t [&>h2]:border-slate-300 [&>h2]:pt-8 [&>h2]:text-3xl [&>h2]:font-semibold [&>h2]:tracking-[-0.03em]
                [&>h2]:before:absolute [&>h2]:before:left-0 [&>h2]:before:top-[-1px] [&>h2]:before:h-[3px] [&>h2]:before:w-12 [&>h2]:before:bg-[#f05a42]
                [&>h3]:mb-4 [&>h3]:mt-10 [&>h3]:scroll-mt-28 [&>h3]:text-2xl [&>h3]:font-semibold
                [&>ul]:mb-7 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:mb-2 [&>ol]:mb-7 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:mb-2
                [&>blockquote]:my-9 [&>blockquote]:border-l-4 [&>blockquote]:border-ieee-blue [&>blockquote]:bg-[#eef7fb] [&>blockquote]:px-6 [&>blockquote]:py-5 [&>blockquote]:text-lg [&>blockquote]:italic
                [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:bg-[#07101f] [&>pre]:p-5 [&>pre]:text-sm [&>pre]:text-slate-100
                [&>code]:bg-white/70 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-sm [&_a]:font-semibold [&_a]:text-ieee-blue [&_a]:underline [&_a]:underline-offset-4"
                dangerouslySetInnerHTML={{ __html: article.html }}
              />

              <aside className="mx-auto w-full max-w-[760px] xl:sticky xl:top-28 xl:mx-0 xl:max-w-none">
                <div className="border border-ieee-blue/15 bg-[#eaf6fb] p-5">
                  <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Story details</p>
                  <dl className="mt-5 space-y-5 text-xs text-slate-600">
                    <div><dt className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-400">Author</dt><dd className="mt-1.5 font-semibold text-[#07101f]">{author}</dd></div>
                    <div><dt className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-400">Reading time</dt><dd className="mt-1.5 inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.readMinutes || 1} minutes</dd></div>
                  </dl>
                  {(society?.slug || event) ? <div className="mt-5 border-t border-ieee-blue/15 pt-4"><p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-400">Connected to</p>{society?.slug ? <Link to={`/societies/${society.slug}`} className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-700 transition hover:text-ieee-blue"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{society.name || "Society"}</Link> : null}{event ? <Link to={event.slug ? `/events/${event.slug}` : "/events"} className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-700 transition hover:text-ieee-blue"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />{event.title}</Link> : null}</div> : null}
                </div>
                <div className="mt-3 border border-slate-300 bg-[#fffdf7] p-5 font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-400"><span className="text-[#f05a42]">Read slowly.</span><br />Keep what matters.</div>
              </aside>
            </div>

            {related.length > 0 ? (
              <section className="mt-16 border-t border-slate-300 pt-8 sm:mt-20 sm:pt-10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div><div className="flex items-center gap-2"><span className="h-2 w-2 bg-[#f05a42]" /><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">Continue reading</p></div><h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">More from the journal.</h2></div>
                  <Link to="/blog/" className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-ieee-blue">All stories ↗</Link>
                </div>
                <div className="mt-6 grid gap-6 md:grid-cols-3">
                  {related.map((item, index) => (
                    <Link key={item.id} to={`/blog/${item.slug}`} className="group block">
                      <div className="relative aspect-[4/3] overflow-hidden border border-slate-300 bg-slate-100">
                        {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" /> : null}
                        <span className="absolute left-0 top-0 bg-[#f05a42] px-3 py-2 font-mono text-[8px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <p className="mt-4 font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{item.topicLabel || item.category || "Story"} · {postDate(item)}</p>
                      <h3 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.025em] text-[#07101f] transition group-hover:text-ieee-blue">{item.title}</h3>
                      {item.excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{item.excerpt}</p> : null}
                      <span className="mt-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-[#fffdf7] transition group-hover:border-ieee-blue group-hover:bg-ieee-blue group-hover:text-white"><ArrowUpRight className="h-3.5 w-3.5" /></span>
                    </Link>
                  ))}
                </div>
                <Link to="/blog/" className="mt-10 grid overflow-hidden border border-slate-300 bg-[#fffdf7] sm:grid-cols-[1fr_230px]">
                  <div className="p-5 sm:p-6"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Back to the journal</p><p className="mt-2 text-xl font-semibold tracking-[-0.025em]">More stories are waiting.</p></div>
                  <div className="flex items-center justify-between bg-[#dff1fb] p-5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[#07101f] sm:p-6"><span>Browse all stories</span><ArrowUpRight className="h-4 w-4" /></div>
                </Link>
              </section>
            ) : null}
          </article>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );

}