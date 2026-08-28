import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Grid2X2, List, Search, X } from "lucide-react";
import { Link } from "react-router";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { StarsBackground } from "@/components/ui/stars-background";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { formatDateShort } from "@/lib/dates";
import type { BlogPost } from "@/types";

type ViewMode = "grid" | "index";

function authorName(post: BlogPost) {
  return typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
}

function postDate(post: BlogPost) {
  return post.publishedAt ? formatDateShort(post.publishedAt) : "";
}

function contentType(post: BlogPost) {
  const source = `${post.topicLabel || ""} ${post.category || ""} ${post.title}`.toLowerCase();
  if (source.includes("event") || source.includes("recap")) return "EVENT LOG";
  if (source.includes("project")) return "PROJECT FILE";
  if (source.includes("technical") || source.includes("tech")) return "TECH NOTE";
  if (source.includes("member") || source.includes("people")) return "PEOPLE";
  if (source.includes("ieee") || source.includes("history")) return "EXPLAINER";
  return "BRANCH NOTE";
}

function matchesFilter(post: BlogPost, filter: string) {
  if (filter === "All") return true;
  return post.category === filter || post.topicLabel === filter;
}

export default function BlogClient({ blogs = [] }: { blogs?: BlogPost[] }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of blogs) {
      for (const label of [post.category, post.topicLabel]) {
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    return ["All", ...Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label).slice(0, 7)];
  }, [blogs]);

  const lead = useMemo(() => blogs.find((post) => post.coverUrl) || blogs[0], [blogs]);
  const latest = useMemo(() => blogs.filter((post) => post.id !== lead?.id).slice(0, 4), [blogs, lead]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return blogs.filter((post) => {
      if (post.id === lead?.id) return false;
      if (!matchesFilter(post, filter)) return false;
      if (!needle) return true;
      const haystack = [post.title, post.excerpt, post.topicLabel, post.category, authorName(post)].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [blogs, filter, query, lead]);

  const preview = visible.find((post) => post.id === previewId) || visible[0];
  const totalMinutes = blogs.reduce((sum, post) => sum + (post.readMinutes || 1), 0);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-white text-gray-900 selection:bg-ieee-blue/20">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <StarsBackground starDensity={0.00032} allStarsTwinkle starColor="#1e293b" />
        <ShootingStars starColor="#00629b" trailColor="#0099D6" minDelay={4200} maxDelay={8500} minSpeed={8} maxSpeed={16} starWidth={9} starHeight={1} />
      </div>
      <Navbar />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[100dvh]"><TechnicalDetails /></div>

      <main className="relative z-20 mx-auto w-full max-w-[1320px] px-5 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <header data-testid="blog-journal-masthead" className="border-t border-gray-200 pt-6 sm:pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            <h1 className="text-gray-600">IEEE Sahrdaya / Blog</h1>
            <div className="flex items-center gap-4"><span>{String(blogs.length).padStart(2, "0")} stories</span><span>{totalMinutes} min total</span><span>{new Date().getFullYear()} / live</span></div>
          </div>

          <div className="mt-8 grid gap-7 border-b border-gray-200 pb-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end lg:gap-12 sm:pb-10">
            <div>
              <p className="font-pixel text-3xl leading-tight tracking-[-0.05em] text-ieee-blue sm:text-4xl lg:text-5xl">BLOG</p>
              <p className="mt-4 max-w-4xl text-[2.6rem] font-bold leading-[0.97] tracking-[-0.045em] text-gray-950 sm:text-[3.8rem] lg:text-[4.7rem]">Stories from inside the branch.</p>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <p className="text-sm leading-6 text-gray-500">Technical notes, event reports, projects, people and ideas worth keeping.</p>
              <p className="mt-5 font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.17em] text-gray-400">Record what happened.<br />Share what we learned.<br />Keep the signal alive.</p>
            </div>
          </div>
        </header>

        {lead ? (
          <section data-testid="blog-lead-story" className="py-8 sm:py-10">
            <div className="mb-4 flex items-center gap-3"><span className="h-2 w-2 bg-ieee-blue" /><p className="font-pixel text-[11px] text-gray-700">LATEST / 01</p><div className="h-px flex-1 bg-gray-200" /></div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.65fr)]">
              <Link to={`/blog/${lead.slug}`} className="group relative min-h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm sm:min-h-[500px] lg:min-h-[560px]">
                {lead.coverUrl ? <img src={lead.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                  <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-blue-200">{contentType(lead)} · {postDate(lead)} · {lead.readMinutes || 1} min</p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-[1] tracking-[-0.035em] sm:text-5xl">{lead.title}</h2>
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold backdrop-blur-sm transition group-hover:bg-white group-hover:text-gray-950">Read story <ArrowUpRight className="h-4 w-4" /></div>
                </div>
              </Link>

              <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3"><p className="font-pixel text-[10px] text-gray-700">LATEST SIGNALS</p><span className="font-mono text-[8px] uppercase tracking-[0.15em] text-gray-400">LIVE FEED</span></div>
                <ol className="mt-2">
                  {latest.map((post, index) => (
                    <li key={post.id} className="border-b border-gray-100 last:border-b-0">
                      <Link to={`/blog/${post.slug}`} className="group grid grid-cols-[30px_1fr_auto] gap-3 py-4">
                        <span className="font-pixel text-[9px] text-ieee-blue">{String(index + 2).padStart(2, "0")}</span>
                        <span><span className="block font-mono text-[7px] font-semibold uppercase tracking-[0.15em] text-gray-400">{contentType(post)}</span><span className="mt-1 block text-sm font-semibold leading-snug text-gray-800 transition group-hover:text-ieee-blue">{post.title}</span></span>
                        <ArrowRight className="mt-3 h-4 w-4 text-gray-300 transition group-hover:translate-x-1 group-hover:text-ieee-blue" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </section>
        ) : null}

        <section id="archive" className="border-t border-gray-200 pt-8 sm:pt-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="font-pixel text-[11px] text-ieee-blue">BRANCH LOG / {String(visible.length).padStart(2, "0")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Browse the archive.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Switch between a visual grid and a compact index. Search, filter, skim or wander.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[250px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search blog stories" placeholder="Search stories…" className="h-11 w-full rounded-full border border-gray-200 bg-white pl-9 pr-9 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-ieee-blue" />
                {query ? <button type="button" aria-label="Clear story search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button> : null}
              </div>
              <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm" aria-label="Blog archive view">
                <button type="button" onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] transition ${viewMode === "grid" ? "bg-gray-950 text-white" : "text-gray-500 hover:text-gray-900"}`}><Grid2X2 className="h-3.5 w-3.5" /> Grid</button>
                <button type="button" onClick={() => setViewMode("index")} aria-pressed={viewMode === "index"} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] transition ${viewMode === "index" ? "bg-gray-950 text-white" : "text-gray-500 hover:text-gray-900"}`}><List className="h-3.5 w-3.5" /> Index</button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto border-y border-gray-200 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter blog stories">
            {filters.map((label) => <button key={label} type="button" onClick={() => setFilter(label)} aria-pressed={filter === label} className={`shrink-0 rounded-full border px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] transition ${filter === label ? "border-ieee-blue bg-ieee-blue text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-900"}`}>{label}</button>)}
          </div>

          {viewMode === "grid" ? (
            <div data-testid="blog-archive" className="mt-7 grid gap-6 md:grid-cols-2 xl:grid-cols-12">
              {visible.map((post, index) => {
                const wide = index % 5 === 0;
                return <article key={post.id} data-blog-archive-row className={wide ? "md:col-span-2 xl:col-span-7" : "xl:col-span-5"}>
                  <Link to={`/blog/${post.slug}`} className="group block h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-ieee-blue/30 hover:shadow-md">
                    <div className={`relative overflow-hidden bg-gray-100 ${wide ? "aspect-[16/8]" : "aspect-[16/10]"}`}>
                      {post.coverUrl ? <img src={post.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#f8fafc_25%,transparent_25%,transparent_50%,#f8fafc_50%,#f8fafc_75%,transparent_75%)] bg-[length:20px_20px]" />}
                      <span className="absolute left-3 top-3 rounded-sm bg-gray-950 px-2.5 py-1.5 font-pixel text-[8px] text-white">{String(index + 2).padStart(2, "0")}</span>
                    </div>
                    <div className="p-5 sm:p-6">
                      <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{contentType(post)} · {postDate(post)} · {post.readMinutes || 1} min</p>
                      <h3 className={`${wide ? "sm:text-3xl" : "sm:text-2xl"} mt-2 text-2xl font-bold leading-tight tracking-[-0.03em] text-gray-900 transition group-hover:text-ieee-blue`}>{post.title}</h3>
                      {post.excerpt ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500">{post.excerpt}</p> : null}
                      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4"><span className="font-mono text-[8px] uppercase tracking-[0.15em] text-gray-400">{authorName(post)}</span><span className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 text-gray-500 transition group-hover:border-ieee-blue group-hover:bg-ieee-blue group-hover:text-white"><ArrowUpRight className="h-4 w-4" /></span></div>
                    </div>
                  </Link>
                </article>;
              })}
              {visible.length === 0 ? <div className="md:col-span-2 xl:col-span-12 py-16 text-center"><p className="font-pixel text-[10px] text-gray-400">NO MATCHING SIGNALS</p><button type="button" onClick={() => { setFilter("All"); setQuery(""); }} className="mt-3 text-sm font-semibold text-ieee-blue hover:underline">Reset archive</button></div> : null}
            </div>
          ) : (
            <div data-testid="blog-archive" className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
              <div className="border-y border-gray-200 bg-white/85 backdrop-blur-sm">
                {visible.map((post, index) => <article key={post.id} data-blog-archive-row onMouseEnter={() => setPreviewId(post.id)} onFocusCapture={() => setPreviewId(post.id)} className="group border-b border-gray-200 last:border-b-0">
                  <Link to={`/blog/${post.slug}`} className="grid gap-3 px-2 py-5 transition hover:bg-gray-50 sm:grid-cols-[54px_1fr_90px_auto] sm:items-center sm:px-4">
                    <span className="font-pixel text-[9px] text-gray-300 transition group-hover:text-ieee-blue">{String(index + 2).padStart(2, "0")}</span>
                    <span><span className="font-mono text-[7px] font-semibold uppercase tracking-[0.15em] text-ieee-blue">{contentType(post)}</span><h3 className="mt-1 text-lg font-bold leading-tight tracking-[-0.02em] text-gray-900 transition group-hover:translate-x-1 group-hover:text-ieee-blue sm:text-xl">{post.title}</h3></span>
                    <span className="font-mono text-[8px] uppercase leading-5 tracking-[0.13em] text-gray-400">{postDate(post)}<br />{post.readMinutes || 1} min</span>
                    <ArrowUpRight className="hidden h-4 w-4 text-gray-300 transition group-hover:text-ieee-blue sm:block" />
                  </Link>
                </article>)}
                {visible.length === 0 ? <div className="py-16 text-center"><p className="font-pixel text-[10px] text-gray-400">NO MATCHING SIGNALS</p></div> : null}
              </div>
              <aside className="hidden lg:block">
                <div className="sticky top-28 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  {preview ? <>
                    <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">{preview.coverUrl ? <img src={preview.coverUrl} alt="" className="h-full w-full object-cover" /> : null}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-4 pt-16"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-blue-100">PREVIEW / {contentType(preview)}</p></div></div>
                    <div className="p-5"><h3 className="text-2xl font-bold leading-tight tracking-[-0.03em]">{preview.title}</h3>{preview.excerpt ? <p className="mt-3 line-clamp-4 text-sm leading-6 text-gray-500">{preview.excerpt}</p> : null}<div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-gray-400"><span>{postDate(preview)}</span><span>{preview.readMinutes || 1} min read</span></div></div>
                  </> : <div className="grid aspect-[4/3] place-items-center font-pixel text-[9px] text-gray-300">NO PREVIEW</div>}
                </div>
              </aside>
            </div>
          )}

          <div className="mt-10 grid overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:grid-cols-[1fr_auto] sm:items-stretch">
            <div className="p-5 sm:p-6"><p className="font-pixel text-[9px] text-ieee-blue">KEEP MOVING</p><h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">The archive grows with the branch.</h3><p className="mt-2 text-sm text-gray-500">New workshops, projects, people and ideas become the next stories here.</p></div>
            <Link to="/events" className="group flex min-w-[210px] items-center justify-between gap-6 border-t border-gray-200 bg-ieee-blue px-6 py-5 font-semibold text-white transition hover:bg-blue-700 sm:border-l sm:border-t-0">Explore events <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
