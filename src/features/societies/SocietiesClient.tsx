import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Grid3X3, List, Search, X } from "lucide-react";
import { Link } from "react-router";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { StarsBackground } from "@/components/ui/stars-background";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import type { Society } from "@/types";

interface SocietiesClientProps {
  societies: Society[];
}

type ViewMode = "grid" | "list";

type Accent = {
  border: string;
  text: string;
  wash: string;
  line: string;
};

const DEFAULT_ACCENT: Accent = {
  border: "group-hover:border-ieee-blue/35",
  text: "group-hover:text-ieee-blue",
  wash: "group-hover:bg-ieee-blue/[0.025]",
  line: "bg-ieee-blue",
};
const SOCIETY_ACCENTS: Record<string, Accent> = {
  wie: { border: "group-hover:border-purple-300/70", text: "group-hover:text-purple-700", wash: "group-hover:bg-purple-50/35", line: "bg-purple-600" },
  cs: { border: "group-hover:border-blue-300/70", text: "group-hover:text-blue-700", wash: "group-hover:bg-blue-50/35", line: "bg-blue-600" },
  ras: { border: "group-hover:border-red-300/70", text: "group-hover:text-red-700", wash: "group-hover:bg-red-50/35", line: "bg-red-600" },
  pes: { border: "group-hover:border-emerald-300/70", text: "group-hover:text-emerald-700", wash: "group-hover:bg-emerald-50/35", line: "bg-emerald-600" },
  ias: { border: "group-hover:border-amber-300/70", text: "group-hover:text-amber-700", wash: "group-hover:bg-amber-50/35", line: "bg-amber-600" },
  sps: { border: "group-hover:border-teal-300/70", text: "group-hover:text-teal-700", wash: "group-hover:bg-teal-50/35", line: "bg-teal-600" },
  edsoc: { border: "group-hover:border-indigo-300/70", text: "group-hover:text-indigo-700", wash: "group-hover:bg-indigo-50/35", line: "bg-indigo-600" },
  css: { border: "group-hover:border-sky-300/70", text: "group-hover:text-sky-700", wash: "group-hover:bg-sky-50/35", line: "bg-sky-600" },
  sight: { border: "group-hover:border-orange-300/70", text: "group-hover:text-orange-700", wash: "group-hover:bg-orange-50/35", line: "bg-orange-600" },
};

function societyAccent(slug: string): Accent {
  return SOCIETY_ACCENTS[slug.toLowerCase()] ?? DEFAULT_ACCENT;
}

function societyDescription(society: Society) {
  return blogHtmlToPlainText(society.bio || "").replace(/\s+/g, " ").trim();
}

function SocietyLogo({ society }: { society: Society }) {
  return society.logoUrl ? (
    <img src={society.logoUrl} alt={`${society.name} logo`} loading="lazy" className="max-h-full max-w-full object-contain" />
  ) : (
    <span className="text-2xl font-semibold text-slate-300">{society.name.charAt(0)}</span>
  );
}
function GridCard({ society, index }: { society: Society; index: number }) {
  const accent = societyAccent(society.slug);
  const description = societyDescription(society);
  return (
    <Link to={`/societies/${society.slug.toLowerCase()}`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-2">
      <article className={`relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[border-color,background-color,box-shadow] duration-300 ${accent.border} ${accent.wash} group-hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]`}>
        <div className="flex h-full flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <span>IEEE / {society.slug.toUpperCase()}</span>
            <span>{String(index + 1).padStart(2, "0")}</span>
          </div>
          <div className="mt-5 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-5 sm:block">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-xl border border-slate-100 bg-white p-3 sm:h-32 sm:w-full sm:p-5">
              <SocietyLogo society={society} />
            </div>
            <div className="min-w-0 sm:mt-7">
              <h2 className={`text-xl font-semibold leading-tight tracking-tight text-slate-900 transition-colors sm:text-2xl ${accent.text}`}>{society.name}</h2>
              {description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500 sm:mt-3 sm:line-clamp-3 sm:leading-6">{description}</p>}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 sm:mt-auto sm:pt-5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Explore society</span>
            <ArrowUpRight className={`h-4 w-4 text-slate-400 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${accent.text}`} />
          </div>
        </div>
        <div className={`absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${accent.line}`} />
      </article>
    </Link>
  );
}
function ListRow({ society, index }: { society: Society; index: number }) {
  const accent = societyAccent(society.slug);
  const description = societyDescription(society);
  return (
    <Link to={`/societies/${society.slug.toLowerCase()}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-2">
      <article className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 transition duration-300 sm:grid-cols-[44px_72px_minmax(0,1fr)_minmax(180px,0.8fr)_auto] sm:px-5 ${accent.border} ${accent.wash}`}>
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-slate-400">{String(index + 1).padStart(2, "0")}</span>
        <div className="hidden h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-white p-2 sm:flex"><SocietyLogo society={society} /></div>
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">IEEE / {society.slug.toUpperCase()}</p>
          <h2 className={`mt-1 truncate text-base font-semibold text-slate-900 transition-colors sm:text-lg ${accent.text}`}>{society.name}</h2>
        </div>
        <p className="hidden line-clamp-2 text-sm leading-5 text-slate-500 sm:block">{description}</p>
        <ArrowUpRight className={`h-4 w-4 text-slate-400 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${accent.text}`} />
      </article>
    </Link>
  );
}

export default function SocietiesClient({ societies }: SocietiesClientProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    const saved = window.localStorage.getItem("societies-view");
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem("societies-view", next);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      document.getElementById("society-search")?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return societies;
    return societies.filter((society) => {
      const haystack = `${society.name} ${society.slug} ${societyDescription(society)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, societies]);

  return (
    <div className="relative min-h-screen w-full bg-white font-sans text-slate-950 selection:bg-ieee-blue/15">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-dvh overflow-hidden opacity-70">
        <StarsBackground starDensity={0.00022} allStarsTwinkle starColor="#94a3b8" />
        <div className="relative z-10 h-full opacity-50"><TechnicalDetails /></div>
      </div>
      <Navbar />

      <main className="relative z-10 px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
        <div className="mx-auto max-w-7xl">
          <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="border-b border-slate-200 pb-10 sm:pb-14">
            <div className="flex items-center justify-between gap-6 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span>IEEE Sahrdaya / Societies</span>
              <span>{String(societies.length).padStart(2, "0")} communities</span>
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)] lg:items-end">
              <div>
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-7xl xl:text-[5.6rem]">{societies.length} communities.<br /><span className="text-ieee-blue">One student branch.</span></h1>
              </div>              <div className="max-w-md lg:justify-self-end">
                <p className="text-base leading-7 text-slate-600 sm:text-lg">Explore the technical societies, affinity groups and communities where IEEE Sahrdaya students learn, build, research and lead.</p>
                <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <span>Thrissur · Kerala</span><span className="text-right">Student Branch</span>
                  <span>Technical communities</span><span className="text-right">IEEE</span>
                </div>
              </div>
            </div>
          </motion.section>

          <section className="sticky top-20 z-20 -mx-2 mt-6 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:mt-8 sm:p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="society-search" className="sr-only">Search societies</label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="society-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search societies, fields or interests…" className="h-12 w-full rounded-xl border-0 bg-slate-50/80 pl-10 pr-20 text-sm text-slate-900 outline-none ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-ieee-blue/50" />
                {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button> : <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-400 sm:block">/</kbd>}
              </div>
              <div className="flex items-center justify-between gap-3 px-1 sm:px-0">
                <span className="whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:pl-3">{filtered.length} results</span>
                <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Society view">
                  <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => chooseView("grid")} className={`rounded-md p-2 transition ${view === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}><Grid3X3 className="h-4 w-4" /></button>
                  <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => chooseView("list")} className={`rounded-md p-2 transition ${view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </section>
          <section className="mt-6 sm:mt-8">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 px-6 py-16 text-center">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">No matching societies</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Try another field or interest.</h2>
                <button type="button" onClick={() => setQuery("")} className="mt-5 text-sm font-semibold text-ieee-blue hover:underline">Clear search</button>
              </div>
            ) : view === "grid" ? (
              <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((society, index) => (
                  <motion.div key={society.id} layout initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.2) }}>
                    <GridCard society={society} index={societies.indexOf(society)} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div layout className="space-y-2">
                {filtered.map((society) => (
                  <motion.div key={society.id} layout initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <ListRow society={society} index={societies.indexOf(society)} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </section>

          <section className="mt-20 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white sm:mt-28">
            <div className="grid gap-10 px-6 py-9 sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-300">Not sure where to start?</p>
                <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">See what our communities are building right now.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Workshops, competitions, talks and hands-on sessions are often the easiest way to discover the society that fits you.</p>
              </div>
              <Link to="/events" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-50">Explore upcoming events <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
