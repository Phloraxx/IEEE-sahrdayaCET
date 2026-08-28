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

  const archivePosts = useMemo(() => {
    if (!query.trim() && filter === "All" && lead) {
      return visible.filter((post) => post.id !== lead.id);
    }
    return visible;
  }, [filter, lead, query, visible]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f7f3ea] font-sans text-slate-950">
      <Navbar />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.045] mix-blend-multiply" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #00629b 0.7px, transparent 0.8px)", backgroundSize: "24px 24px" }} />

      <main className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <header data-testid="blog-journal-masthead" className="relative overflow-hidden border-y border-slate-300/80 bg-[#fffdf7]">
          <div className="flex items-center justify-between gap-6 border-b border-slate-200 px-4 py-4 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:px-6">
            <h1 className="text-slate-700">IEEE Sahrdaya / Blog</h1>
            <span>Journal · {new Date().getFullYear()}</span>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">Stories from the branch</p>
              <p className="mt-4 max-w-[1030px] text-[2.45rem] font-semibold leading-[0.94] tracking-[-0.05em] text-[#07101f] sm:text-[3.5rem] lg:text-[4.5rem] xl:text-[5.05rem]">
                Technical ideas, people,
                <span className="block text-ieee-blue">projects and moments</span>
                <span className="relative inline-block">worth remembering.<span aria-hidden className="absolute -bottom-1 left-0 h-[5px] w-[44%] -rotate-1 bg-[#f05a42] sm:h-[7px]" /></span>
              </p>
              <p className="mt-6 max-w-xl border-l-2 border-ieee-blue pl-4 text-sm leading-6 text-slate-500 sm:text-base">
                A living record of what IEEE Sahrdaya builds, learns, hosts and shares—written from inside the student branch.
              </p>
            </div>

            <aside className="flex min-h-[164px] flex-col justify-between bg-[#07101f] p-5 text-white sm:p-6 lg:min-h-full" aria-label="Journal issue information">
              <div className="flex items-start justify-between gap-5 lg:block">
                <div>
                  <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-white/45">Issue / 01</p>
                  <p className="mt-2 text-5xl font-black leading-none tracking-[-0.06em] text-[#f05a42]">26</p>
                </div>
                <span className="mt-1 h-10 w-10 rounded-full border border-white/20 lg:mt-5 lg:block" aria-hidden />
              </div>
              <p className="max-w-[16ch] text-sm leading-5 text-white/60">A journal made inside the student branch.</p>
            </aside>
          </div>

          <div className="flex gap-8 overflow-hidden bg-ieee-blue px-4 py-3 font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-white sm:px-6">
            <span className="shrink-0 text-[#ffd8ce]">Inside the branch</span>
            <span className="shrink-0">Technical notes</span><span className="shrink-0">People</span><span className="shrink-0">Events</span><span className="shrink-0">Projects</span><span className="shrink-0">Ideas worth keeping</span>
          </div>
        </header>

        {lead ? (
          <section data-testid="blog-lead-story" className="relative mt-8 grid overflow-hidden border border-slate-300 bg-white lg:grid-cols-[minmax(0,1.48fr)_minmax(320px,0.72fr)]">
            <Link to={`/blog/${lead.slug}`} className="group relative block min-h-[320px] overflow-hidden bg-slate-100 sm:min-h-[450px] lg:min-h-[610px]">
              {lead.coverUrl ? <img src={lead.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]" /> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <div className="absolute left-0 top-0 bg-[#f05a42] px-4 py-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white">Lead / 01</div>
              <div className="absolute bottom-5 left-5 max-w-[260px] font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.18em] text-white/85">From IEEE Sahrdaya<br />{postDate(lead)}</div>
              <span aria-hidden className="absolute bottom-0 right-0 h-16 w-16 bg-ieee-blue [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
            </Link>

            <div className="flex flex-col bg-[#07101f] p-5 text-white sm:p-7 lg:p-8">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#f05a42]">Latest / Lead story</p>
              <Link to={`/blog/${lead.slug}`} className="group mt-4">
                <h2 className="text-3xl font-semibold leading-[0.98] tracking-[-0.04em] transition group-hover:text-[#83d6ff] sm:text-4xl lg:text-[2.85rem]">{lead.title}</h2>
                {lead.excerpt ? <p className="mt-5 text-sm leading-6 text-white/60 sm:text-base">{lead.excerpt}</p> : null}
              </Link>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-white/40">
                <span>{lead.topicLabel || lead.category || "Story"}</span><span>{postDate(lead)}</span><span>{lead.readMinutes || 1} min</span>
              </div>
              <Link to={`/blog/${lead.slug}`} className="mt-6 inline-flex items-center gap-2 self-start border-b border-[#f05a42] pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-white transition hover:text-[#83d6ff]">Read story <ArrowUpRight className="h-3.5 w-3.5" /></Link>

              <div className="mt-9 border-t border-white/10 pt-5 lg:mt-auto">
                <p className="mb-3 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-white/35">Latest dispatches</p>
                <ol>
                  {latest.map((post, index) => (
                    <li key={post.id} className="border-t border-white/10 first:border-t-0">
                      <Link to={`/blog/${post.slug}`} className="group grid grid-cols-[30px_1fr_auto] gap-3 py-3.5">
                        <span className="font-mono text-[8px] font-semibold text-[#f05a42]">{String(index + 2).padStart(2, "0")}</span>
                        <span className="text-sm font-semibold leading-snug text-white/80 transition group-hover:translate-x-1 group-hover:text-white">{post.title}</span>
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-white/25 transition group-hover:translate-x-1 group-hover:text-[#83d6ff]" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        ) : null}

        <section id="archive" className="mt-12 border-t border-slate-300 pt-9 sm:mt-16 sm:pt-12">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#f05a42]" />
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Explore the journal</p>
              </div>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold leading-[0.98] tracking-[-0.045em] text-[#07101f] sm:text-5xl">More stories from the branch.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">Browse event recaps, technical notes and member perspectives — a growing record of what we make and learn together.</p>
            </div>
            <div className="relative w-full rounded-full border border-slate-300 bg-[#fffdf7] px-5 shadow-[0_10px_30px_rgba(7,16,31,0.04)]">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search blog stories" placeholder="Search stories…" className="h-12 w-full bg-transparent pl-7 pr-8 text-sm outline-none placeholder:text-slate-400" />
              {query ? <button type="button" aria-label="Clear story search" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 transition hover:text-slate-800"><X className="h-4 w-4" /></button> : null}
            </div>
          </div>

          <div className="mt-7 flex gap-2 overflow-x-auto border-y border-slate-300 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter blog stories">
            {filters.map((label) => {
              const active = filter === label;
              return <button key={label} type="button" onClick={() => setFilter(label)} aria-pressed={active} className={`shrink-0 rounded-full border px-4 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] transition ${active ? "border-ieee-blue bg-ieee-blue text-white" : "border-slate-300 bg-[#fffdf7] text-slate-500 hover:border-ieee-blue/50 hover:text-ieee-blue"}`}>{label}</button>;
            })}
          </div>

          <div data-testid="blog-archive" className="mt-8 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:gap-x-8 lg:gap-y-12">
            {archivePosts.map((post, index) => {
              const wide = index === 0 && archivePosts.length > 2;
              return (
                <article key={post.id} data-blog-archive-row className={`group ${wide ? "md:col-span-2" : ""}`}>
                  <Link to={`/blog/${post.slug}`} className={wide ? "grid overflow-hidden border border-slate-300 bg-[#fffdf7] transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(7,16,31,0.08)] md:grid-cols-[1.12fr_0.88fr]" : "block"}>
                    <div className={`relative overflow-hidden bg-slate-100 ${wide ? "min-h-[300px] sm:min-h-[380px]" : "aspect-[4/3] border border-slate-300"}`}>
                      {post.coverUrl ? <img src={post.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]" /> : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#07101f]/35 via-transparent to-transparent" />
                      <span className="absolute left-4 top-4 bg-[#f05a42] px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-white">{String(index + 1).padStart(2, "0")}</span>
                    </div>

                    <div className={wide ? "flex flex-col justify-between p-6 sm:p-8 lg:p-10" : "pt-5"}>
                      <div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                          <span className="text-ieee-blue">{post.topicLabel || post.category || "Story"}</span>
                          <span>{postDate(post)}</span>
                          <span>{post.readMinutes || 1} min read</span>
                        </div>
                        <h3 className={`mt-3 font-semibold leading-[1.02] tracking-[-0.035em] text-[#07101f] transition-colors group-hover:text-ieee-blue ${wide ? "text-3xl sm:text-4xl lg:text-[2.65rem]" : "text-2xl sm:text-[1.75rem]"}`}>{post.title}</h3>
                        {post.excerpt ? <p className={`mt-4 leading-6 text-slate-500 ${wide ? "max-w-md text-sm sm:text-base" : "line-clamp-2 text-sm"}`}>{post.excerpt}</p> : null}
                      </div>
                      <div className={`flex items-center justify-between gap-4 ${wide ? "mt-8 border-t border-slate-200 pt-5" : "mt-5"}`}>
                        <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400">{authorName(post)}</span>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition group-hover:border-ieee-blue group-hover:bg-ieee-blue group-hover:text-white"><ArrowUpRight className="h-4 w-4" /></span>
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
            {archivePosts.length === 0 ? <div className="col-span-full py-16 text-center"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">No stories match this view</p><button type="button" onClick={() => { setFilter("All"); setQuery(""); }} className="mt-3 text-sm font-semibold text-ieee-blue hover:underline">Reset journal</button></div> : null}
          </div>

          {archivePosts.length > 0 ? (
            <div className="mt-12 grid overflow-hidden border border-slate-300 bg-[#fffdf7] sm:grid-cols-[1fr_auto]">
              <div className="p-6 sm:p-8">
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Come back curious</p>
                <p className="mt-2 max-w-xl text-2xl font-semibold leading-tight tracking-[-0.03em] text-[#07101f] sm:text-3xl">The journal grows with the branch.</p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">New workshops, projects, people and ideas become the next stories here.</p>
              </div>
              <Link to="/events" className="flex min-h-[120px] items-center justify-between gap-8 bg-[#dfeefa] px-6 py-5 text-[#07101f] transition hover:bg-[#cfe6f7] sm:min-w-[300px] sm:px-8">
                <div><span className="font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-ieee-blue">What’s happening next</span><span className="mt-2 block text-lg font-semibold">Explore events</span></div>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          ) : null}
        </section>
      </main>
      <Footer />
    </div>
  );
}
