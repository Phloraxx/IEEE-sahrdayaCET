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
              <div className="absolute right-4 top-5 hidden rotate-[-4deg] border border-[#f05a42] bg-[#fff8f4] px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-[#d84532] md:block">Field notes / 01</div>
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

            <aside className="flex min-h-[180px] flex-col justify-between bg-[#07101f] p-5 text-white sm:p-6 lg:min-h-full" aria-label="Journal issue information">
              <div>
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-white/45">Issue / 01</p>
                <p className="mt-2 text-5xl font-black leading-none tracking-[-0.06em] text-[#f05a42]">26</p>
              </div>
              <div className="font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-white/55">
                <p>Read</p><p>Build</p><p>Report</p><p>Remember</p>
              </div>
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

        <section id="archive" className="mt-10 border-t border-slate-300 pt-8 sm:mt-14 sm:pt-10">
          <div className="grid gap-6 border-b border-slate-300 pb-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="flex items-center gap-3"><span className="h-2 w-2 bg-[#f05a42]" /><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Archive / {String(visible.length).padStart(2, "0")}</p></div>
              <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[#07101f] sm:text-5xl">All stories, no filler.</h2>
            </div>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search blog stories" placeholder="Search stories…" className="h-11 w-full border-b border-slate-400 bg-transparent pl-7 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#f05a42]" />
              {query ? <button type="button" aria-label="Clear story search" onClick={() => setQuery("")} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-800"><X className="h-4 w-4" /></button> : null}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-slate-300 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter blog stories">
            {filters.map((label, index) => {
              const active = filter === label;
              const inactiveTone = index % 3 === 1 ? "hover:border-ieee-blue hover:text-ieee-blue" : index % 3 === 2 ? "hover:border-[#f05a42] hover:text-[#d84532]" : "hover:border-slate-700 hover:text-slate-900";
              return <button key={label} type="button" onClick={() => setFilter(label)} aria-pressed={active} className={`shrink-0 border px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] transition ${active ? "border-[#07101f] bg-[#07101f] text-white" : `border-slate-300 bg-[#fffdf7] text-slate-500 ${inactiveTone}`}`}>{label}</button>;
            })}
          </div>

          <div data-testid="blog-archive" className="border-b border-slate-300">
            {visible.map((post, index) => (
              <article key={post.id} data-blog-archive-row className="group border-t border-slate-300 first:border-t-0">
                <Link to={`/blog/${post.slug}`} className="relative grid gap-4 overflow-hidden py-5 transition-colors duration-300 group-hover:bg-[#fffdf7] sm:grid-cols-[72px_minmax(0,1fr)_150px_24px] sm:items-center sm:px-3 sm:py-6 lg:grid-cols-[94px_minmax(0,1fr)_190px_150px_24px]">
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0 bg-[#f05a42] transition-all duration-300 group-hover:w-1" />
                  <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400"><span className="text-base font-black text-slate-300 transition group-hover:text-[#f05a42]">{String(index + 1).padStart(2, "0")}</span><span className="mt-1 block">{postDate(post)}</span></div>
                  <div className="min-w-0"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{post.topicLabel || post.category || "Story"}</p><h3 className="mt-1.5 text-xl font-semibold leading-tight tracking-[-0.03em] text-[#07101f] transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">{post.title}</h3></div>
                  {post.coverUrl ? <div className="hidden h-20 overflow-hidden border border-slate-300 bg-slate-100 sm:block"><img src={post.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-110 group-hover:saturate-[1.15]" /></div> : <div className="hidden h-20 border border-dashed border-slate-300 sm:block" />}
                  <div className="hidden font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.13em] text-slate-400 lg:block"><span>{authorName(post)}</span><span className="block">{post.readMinutes || 1} min read</span></div>
                  <ArrowUpRight className="hidden h-4 w-4 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#f05a42] sm:block" />
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
