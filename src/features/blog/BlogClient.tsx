import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Search, X } from "lucide-react";
import { Link } from "react-router";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { formatDateShort } from "@/lib/dates";
import type { BlogPost } from "@/types";

function authorName(post: BlogPost) {
  return typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
}

function postDate(post: BlogPost) {
  return post.publishedAt ? formatDateShort(post.publishedAt) : "";
}

function matchesFilter(post: BlogPost, filter: string) {
  if (filter === "All") return true;
  return post.category === filter || post.topicLabel === filter;
}

export default function BlogClient({ blogs = [] }: { blogs?: BlogPost[] }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

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
      if (!matchesFilter(post, filter)) return false;
      if (!needle) return true;
      const haystack = [post.title, post.excerpt, post.topicLabel, post.category, authorName(post)].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [blogs, filter, query]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#faf9f6] text-slate-950 font-sans">
      <Navbar />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.025] mix-blend-multiply" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>\")" }} />

      <main className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <header data-testid="blog-journal-masthead" className="border-y border-slate-200 py-5 sm:py-6">
          <div className="flex items-center justify-between gap-6 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <h1 className="text-slate-600">IEEE Sahrdaya / Blog</h1>
            <span>Journal · {new Date().getFullYear()}</span>
          </div>
          <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_340px] xl:items-end xl:gap-14">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">Stories from the branch</p>
              <p className="mt-3 max-w-4xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-[3.25rem] lg:text-[3.65rem] xl:text-[4.15rem]">
                Technical ideas, people, projects and moments worth remembering.
              </p>
            </div>
            <p className="max-w-sm border-l border-slate-200 pl-5 text-sm leading-6 text-slate-500">
              A living record of what IEEE Sahrdaya builds, learns, hosts and shares—written from inside the student branch.
            </p>
          </div>
        </header>

        {lead ? (
          <section data-testid="blog-lead-story" className="grid border-b border-slate-200 py-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)] lg:gap-10 lg:py-10">
            <Link to={`/blog/${lead.slug}`} className="group relative block min-h-[310px] overflow-hidden bg-slate-100 sm:min-h-[430px] lg:min-h-[520px]">
              {lead.coverUrl ? <img src={lead.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]" /> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-white/85 sm:bottom-5 sm:left-5">Lead story / 01</div>
            </Link>

            <div className="flex flex-col pt-6 lg:pt-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Latest / Lead story</p>
              <Link to={`/blog/${lead.slug}`} className="group mt-4">
                <h2 className="text-3xl font-semibold leading-[1.02] tracking-[-0.035em] transition group-hover:text-ieee-blue sm:text-4xl">{lead.title}</h2>
                {lead.excerpt ? <p className="mt-4 text-sm leading-6 text-slate-500 sm:text-base">{lead.excerpt}</p> : null}
              </Link>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                <span>{lead.topicLabel || lead.category || "Story"}</span><span>{postDate(lead)}</span><span>{lead.readMinutes || 1} min</span>
              </div>
              <Link to={`/blog/${lead.slug}`} className="mt-6 inline-flex items-center gap-2 self-start border-b border-slate-950 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-950 transition hover:border-ieee-blue hover:text-ieee-blue">Read story <ArrowUpRight className="h-3.5 w-3.5" /></Link>

              <div className="mt-9 border-t border-slate-200 pt-5 lg:mt-auto">
                <p className="mb-3 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400">Latest stories</p>
                <ol>
                  {latest.map((post, index) => (
                    <li key={post.id} className="border-t border-slate-200 first:border-t-0">
                      <Link to={`/blog/${post.slug}`} className="group grid grid-cols-[28px_1fr_auto] gap-3 py-3.5">
                        <span className="font-mono text-[8px] font-semibold text-slate-300">{String(index + 2).padStart(2, "0")}</span>
                        <span className="text-sm font-semibold leading-snug text-slate-800 transition group-hover:text-ieee-blue">{post.title}</span>
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-ieee-blue" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        ) : null}

        <section id="archive" className="pt-8 sm:pt-10">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Archive / {String(visible.length).padStart(2, "0")}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">All stories</h2>
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search blog stories" placeholder="Search stories…" className="h-11 w-full border-b border-slate-300 bg-transparent pl-7 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-ieee-blue" />
              {query ? <button type="button" aria-label="Clear story search" onClick={() => setQuery("")} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-800"><X className="h-4 w-4" /></button> : null}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter blog stories">
            {filters.map((label) => (
              <button key={label} type="button" onClick={() => setFilter(label)} aria-pressed={filter === label} className={`shrink-0 border px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] transition ${filter === label ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-transparent text-slate-500 hover:border-slate-400 hover:text-slate-900"}`}>{label}</button>
            ))}
          </div>

          <div data-testid="blog-archive" className="divide-y divide-slate-200">
            {visible.map((post, index) => (
              <article key={post.id} data-blog-archive-row className="group">
                <Link to={`/blog/${post.slug}`} className="grid gap-4 py-5 sm:grid-cols-[70px_minmax(0,1fr)_150px_24px] sm:items-center sm:py-6 lg:grid-cols-[90px_minmax(0,1fr)_190px_150px_24px]">
                  <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400"><span>{String(index + 1).padStart(2, "0")}</span><span className="mt-1 block">{postDate(post)}</span></div>
                  <div className="min-w-0"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{post.topicLabel || post.category || "Story"}</p><h3 className="mt-1.5 text-xl font-semibold leading-tight tracking-[-0.025em] text-slate-900 transition group-hover:text-ieee-blue sm:text-2xl">{post.title}</h3></div>
                  {post.coverUrl ? <div className="hidden h-20 overflow-hidden bg-slate-100 sm:block"><img src={post.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div> : <div className="hidden h-20 border border-dashed border-slate-200 sm:block" />}
                  <div className="hidden font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.13em] text-slate-400 lg:block"><span>{authorName(post)}</span><span className="block">{post.readMinutes || 1} min read</span></div>
                  <ArrowUpRight className="hidden h-4 w-4 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-blue sm:block" />
                </Link>
              </article>
            ))}
            {visible.length === 0 ? <div className="py-16 text-center"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">No stories match this view</p><button type="button" onClick={() => { setFilter("All"); setQuery(""); }} className="mt-3 text-sm font-semibold text-ieee-blue hover:underline">Reset archive</button></div> : null}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
