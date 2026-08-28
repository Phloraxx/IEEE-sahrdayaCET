import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Grid3X3, List, Search, X } from "lucide-react";
import { Link } from "react-router";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { StarsBackground } from "@/components/ui/stars-background";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import type { Society } from "@/types";

export interface SocietyActivitySignal {
  eventCount: number;
  nextEvent?: { title: string; slug: string; date: string };
}

export interface UpcomingSocietyEvent {
  id: string;
  title: string;
  slug: string;
  date: string;
  venue: string;
  society: { id: string; name: string; slug: string };
}

interface SocietiesClientProps {
  societies: Society[];
  activityBySociety: Record<string, SocietyActivitySignal>;
  upcomingEvents: UpcomingSocietyEvent[];
}

type ViewMode = "grid" | "list";

type Accent = {
  text: string;
  wash: string;
  line: string;
  ghost: string;
  color: string;
};

const DEFAULT_ACCENT: Accent = {
  text: "group-hover:text-ieee-blue",
  wash: "group-hover:bg-ieee-blue/[0.025]",
  line: "bg-ieee-blue",
  ghost: "text-ieee-blue/[0.055]", color: "#00629B",
};
const SOCIETY_ACCENTS: Record<string, Accent> = {
  cas: { text: "group-hover:text-emerald-700", wash: "group-hover:bg-emerald-50/30", line: "bg-emerald-600", ghost: "text-emerald-500/[0.065]", color: "#15803d" },
  css: { text: "group-hover:text-sky-700", wash: "group-hover:bg-sky-50/30", line: "bg-sky-600", ghost: "text-sky-500/[0.06]", color: "#0284c7" },
  cs: { text: "group-hover:text-blue-700", wash: "group-hover:bg-blue-50/30", line: "bg-blue-600", ghost: "text-blue-500/[0.06]", color: "#2563eb" },
  edsoc: { text: "group-hover:text-indigo-700", wash: "group-hover:bg-indigo-50/30", line: "bg-indigo-600", ghost: "text-indigo-500/[0.06]", color: "#4f46e5" },
  embs: { text: "group-hover:text-fuchsia-700", wash: "group-hover:bg-fuchsia-50/30", line: "bg-fuchsia-600", ghost: "text-fuchsia-500/[0.06]", color: "#c026d3" },
  ies: { text: "group-hover:text-orange-700", wash: "group-hover:bg-orange-50/30", line: "bg-orange-600", ghost: "text-orange-500/[0.06]", color: "#ea580c" },
  ias: { text: "group-hover:text-lime-700", wash: "group-hover:bg-lime-50/30", line: "bg-lime-600", ghost: "text-lime-500/[0.065]", color: "#65a30d" },
  npss: { text: "group-hover:text-rose-700", wash: "group-hover:bg-rose-50/30", line: "bg-rose-600", ghost: "text-rose-500/[0.06]", color: "#e11d48" },
  pes: { text: "group-hover:text-emerald-700", wash: "group-hover:bg-emerald-50/30", line: "bg-emerald-600", ghost: "text-emerald-500/[0.065]", color: "#15803d" },
  ras: { text: "group-hover:text-red-700", wash: "group-hover:bg-red-50/30", line: "bg-red-600", ghost: "text-red-500/[0.06]", color: "#dc2626" },
  sight: { text: "group-hover:text-orange-700", wash: "group-hover:bg-orange-50/30", line: "bg-orange-600", ghost: "text-orange-500/[0.06]", color: "#ea580c" },
  sps: { text: "group-hover:text-teal-700", wash: "group-hover:bg-teal-50/30", line: "bg-teal-600", ghost: "text-teal-500/[0.06]", color: "#0d9488" },
  wie: { text: "group-hover:text-purple-700", wash: "group-hover:bg-purple-50/30", line: "bg-purple-600", ghost: "text-purple-500/[0.06]", color: "#9333ea" },
};

function societyAccent(slug: string): Accent {
  return SOCIETY_ACCENTS[slug.toLowerCase()] ?? DEFAULT_ACCENT;
}

function societyDescription(society: Society) {
  return blogHtmlToPlainText(society.bio || "").replace(/\s+/g, " ").trim();
}

function formatSignalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value.toUpperCase() ?? "";
  return `${day} ${month}`.trim();
}

function SocietyLogo({ society }: { society: Society }) {
  return society.logoUrl ? (
    <img src={society.logoUrl} alt={`${society.name} logo`} loading="lazy" className="max-h-full max-w-full object-contain" />
  ) : (
    <span className="text-2xl font-semibold text-slate-300">{society.name.charAt(0)}</span>
  );
}

type BackdropPattern = "circuit" | "feedback" | "field" | "grid" | "orbit" | "wave";

const BACKDROP_PATTERNS: Record<string, BackdropPattern> = {
  cas: "circuit", css: "feedback", cs: "grid", edsoc: "grid", embs: "orbit",
  ies: "circuit", ias: "circuit", npss: "orbit", pes: "field", ras: "circuit",
  sight: "orbit", sps: "wave", wie: "orbit",
};

function ReactiveBackdrop({ society, reduceMotion }: { society: Society | null; reduceMotion: boolean }) {
  if (!society) return null;
  const accent = societyAccent(society.slug);
  const pattern = BACKDROP_PATTERNS[society.slug.toLowerCase()] ?? "grid";
  return (
    <motion.div
      key={society.id}
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.45 }}
      data-testid="society-reactive-backdrop"
      className="pointer-events-none fixed inset-0 z-[1] hidden overflow-hidden lg:block"
    >
      <svg viewBox="0 0 800 800" className="absolute -right-[7vw] top-[17vh] h-[58vw] w-[58vw] max-h-[820px] max-w-[820px]" style={{ color: accent.color }}>
        <g fill="none" fillOpacity="0.075" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.045">
          {pattern === "grid" && <>
            {Array.from({ length: 9 }).map((_, i) => <path key={`gv-${i}`} d={`M${120 + i * 64} 90V710`} />)}
            {Array.from({ length: 9 }).map((_, i) => <path key={`gh-${i}`} d={`M90 ${120 + i * 64}H710`} />)}
            <circle cx="376" cy="376" r="108" /><circle cx="376" cy="376" r="7" fill="currentColor" />
          </>}
          {pattern === "wave" && <>
            <path d="M90 300 C170 170 250 430 330 300 S490 170 570 300 S730 430 790 300" />
            <path d="M70 360 C160 230 250 490 340 360 S520 230 610 360 S760 485 820 360" />
            <path d="M95 420 C180 290 265 550 350 420 S520 290 610 420 S760 545 820 420" />
            <path d="M110 480 C200 350 290 610 380 480 S560 350 650 480" />
          </>}
          {pattern === "field" && <>
            {[80, 130, 180, 230, 280].map((r) => <ellipse key={r} cx="455" cy="390" rx={r} ry={Math.round(r * 0.62)} />)}
            <path d="M115 390H735" /><path d="M455 95V685" />
            <circle cx="455" cy="390" r="8" fill="currentColor" />
          </>}
          {pattern === "circuit" && <>
            <path d="M110 220H270V330H420V190H650" />
            <path d="M90 520H235V420H360V575H510V455H720" />
            <path d="M180 115V220M650 190V95M235 520V650M510 575V705" />
            {[['270','330'],['420','190'],['235','420'],['360','575'],['510','455']].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="currentColor" />)}
          </>}
          {pattern === "feedback" && <>
            <path d="M160 405 C160 240 290 130 445 130 C605 130 700 245 700 390 C700 535 595 650 440 650 C285 650 165 550 165 440" />
            <path d="M220 405 C220 280 315 210 435 210 C550 210 630 290 630 395 C630 500 545 575 440 575 C330 575 245 510 225 435" />
            <path d="M150 440L165 405L195 430M690 365L700 400L665 392" />
            <circle cx="435" cy="395" r="52" /><circle cx="435" cy="395" r="7" fill="currentColor" />
          </>}
          {pattern === "orbit" && <>
            <ellipse cx="430" cy="390" rx="300" ry="120" transform="rotate(-18 430 390)" />
            <ellipse cx="430" cy="390" rx="285" ry="105" transform="rotate(38 430 390)" />
            <ellipse cx="430" cy="390" rx="250" ry="86" transform="rotate(82 430 390)" />
            <circle cx="430" cy="390" r="34" /><circle cx="430" cy="390" r="7" fill="currentColor" />
            <circle cx="672" cy="283" r="9" fill="currentColor" /><circle cx="275" cy="585" r="9" fill="currentColor" />
          </>}
        </g>
      </svg>
    </motion.div>
  );
}

function LiveActivitySection({ upcomingEvents, totalUpcoming, activeCommunities }: { upcomingEvents: UpcomingSocietyEvent[]; totalUpcoming: number; activeCommunities: number }) {
  return (
    <section data-testid="society-live-activity" className="relative z-20 bg-gray-950 text-white">
      <div className="h-24 sm:h-36" aria-hidden="true" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 18%, #eef3f6 58%, #030712 100%)" }} />
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="grid gap-8 border-b border-white/15 pb-9 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-300">Live signal / IEEE Sahrdaya</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">What&apos;s happening next.</h2>
          </div>
          <div className="flex gap-8 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45 lg:text-right">
            <span>{String(totalUpcoming).padStart(2, "0")} upcoming events</span>
            <span>{String(activeCommunities).padStart(2, "0")} active communities</span>
          </div>
        </div>

        {upcomingEvents.length > 0 ? (
          <div>
            {upcomingEvents.map((event, index) => {
              const accent = societyAccent(event.society.slug);
              return (
                <Link key={event.id} to={`/events/${event.slug}`} className="group relative grid gap-3 border-b border-white/12 py-6 transition-colors hover:bg-white/[0.025] sm:grid-cols-[105px_minmax(0,1fr)_140px_28px] sm:items-center sm:px-2">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    <span className="mr-3 text-white/20">{String(index + 1).padStart(2, "0")}</span>{formatSignalDate(event.date)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-[-0.025em] text-white transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none sm:text-2xl">{event.title}</h3>
                    {event.venue && <p className="mt-1 truncate text-sm text-white/40">{event.venue}</p>}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent.color }} />
                    {event.society.slug.toUpperCase()}
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-white/35 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </Link>
              );
            })}
            <div className="flex justify-end pt-8">
              <Link to="/events" className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:text-white">Explore all events <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 border-b border-white/12 py-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-lg text-white/55">No future events are published yet. Explore the directory and check back as communities announce their next sessions.</p>
            <Link to="/events" className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">Explore events <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        )}
      </div>
    </section>
  );
}
function GridCard({ society, index, total, activity, onActivate }: { society: Society; index: number; total: number; activity?: SocietyActivitySignal; onActivate: (id: string | null) => void }) {
  const accent = societyAccent(society.slug);
  const description = societyDescription(society);
  const nextDate = activity?.nextEvent ? formatSignalDate(activity.nextEvent.date) : "";
  return (
    <Link
      to={`/societies/${society.slug.toLowerCase()}`}
      data-society-id={society.id}
      onMouseEnter={() => onActivate(society.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(society.id)}
      onBlur={() => onActivate(null)}
      className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-4"
    >
      <article className={`relative flex h-full min-h-[218px] flex-col overflow-hidden border-t border-slate-200 px-1 py-4 transition-colors duration-500 sm:min-h-[318px] sm:px-2 sm:pb-6 sm:pt-5 ${accent.wash}`}>
        <div className={`absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 ${accent.line}`} />
        <span aria-hidden="true" className={`pointer-events-none absolute -bottom-3 right-1 hidden select-none font-sans text-[7.5rem] font-black uppercase leading-none tracking-[-0.09em] opacity-0 transition-all duration-500 group-hover:-translate-x-1 group-hover:opacity-100 motion-reduce:transform-none motion-reduce:transition-none lg:block ${accent.ghost}`}>
          {society.slug}
        </span>

        <div className="relative z-10 flex items-center justify-between gap-4 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[9px]">
          <span>IEEE / {society.slug.toUpperCase()}</span>
          <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-[minmax(0,1fr)_64px] items-start gap-4 sm:mt-8 sm:grid-cols-[minmax(0,1fr)_88px] sm:gap-4 lg:grid-cols-[minmax(0,1fr)_112px] lg:gap-6">
          <div className="min-w-0">
            <h2 className={`min-w-0 text-lg font-semibold leading-[1.04] tracking-[-0.035em] text-slate-950 transition-colors duration-300 sm:text-[1.5rem] lg:text-[1.72rem] ${accent.text}`}>
              {society.name}
            </h2>
            {nextDate && (
              <div className="mt-3 flex items-center gap-2 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-[9px]">
                <span className={`h-1.5 w-1.5 rounded-full ${accent.line}`} />
                <span>NEXT / {nextDate}</span>
                {activity && activity.eventCount > 1 && <span>+{activity.eventCount - 1}</span>}
              </div>
            )}
          </div>
          <div className="flex h-14 w-16 items-center justify-end transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.06] motion-reduce:transform-none motion-reduce:transition-none sm:h-16 sm:w-[88px] lg:h-20 lg:w-28">
            <SocietyLogo society={society} />
          </div>
        </div>

        {description && (
          <p className="relative z-10 mt-4 line-clamp-2 max-w-[38ch] text-[12px] leading-[1.55] text-slate-500 sm:mt-6 sm:line-clamp-3 sm:text-sm sm:leading-6">
            {description}
          </p>
        )}

        <div className="relative z-10 mt-auto flex items-end justify-between gap-4 pt-5 sm:pt-8">
          <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition-all duration-300 group-hover:tracking-[0.22em] group-hover:text-slate-700 sm:text-[9px]">
            OPEN / {society.slug.toUpperCase()}
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-400 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none group-hover:border-slate-300 group-hover:bg-white sm:h-8 sm:w-8">
            <ArrowUpRight className={`h-3.5 w-3.5 ${accent.text}`} />
          </span>
        </div>
      </article>
    </Link>
  );
}

function ListRow({ society, index, activity, onActivate }: { society: Society; index: number; activity?: SocietyActivitySignal; onActivate: (id: string | null) => void }) {
  const accent = societyAccent(society.slug);
  const description = societyDescription(society);
  const nextDate = activity?.nextEvent ? formatSignalDate(activity.nextEvent.date) : "";
  return (
    <Link
      to={`/societies/${society.slug.toLowerCase()}`}
      data-society-id={society.id}
      onMouseEnter={() => onActivate(society.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(society.id)}
      onBlur={() => onActivate(null)}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-4"
    >
      <article className={`relative grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden border-t border-slate-200 px-1 py-4 transition-colors duration-500 sm:grid-cols-[42px_64px_minmax(0,1fr)_minmax(220px,0.85fr)_auto] sm:px-2 sm:py-5 ${accent.wash}`}>
        <div className={`absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 ${accent.line}`} />
        <span aria-hidden="true" className={`pointer-events-none absolute right-20 top-1/2 hidden -translate-y-1/2 select-none text-6xl font-black uppercase tracking-[-0.08em] opacity-0 transition-opacity duration-500 group-hover:opacity-100 lg:block ${accent.ghost}`}>{society.slug}</span>
        <span className="relative z-10 font-mono text-[9px] font-semibold tracking-[0.16em] text-slate-400">{String(index + 1).padStart(2, "0")}</span>
        <div className="relative z-10 hidden h-10 w-14 items-center justify-start transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none sm:flex"><SocietyLogo society={society} /></div>
        <div className="relative z-10 min-w-0">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-[9px]">IEEE / {society.slug.toUpperCase()}</p>
          <h2 className={`mt-1 truncate text-base font-semibold tracking-[-0.02em] text-slate-950 transition-colors sm:text-lg ${accent.text}`}>{society.name}</h2>
          {nextDate && <p className="mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">NEXT / {nextDate}</p>}
        </div>
        <p className="relative z-10 hidden line-clamp-2 text-sm leading-5 text-slate-500 sm:block">{description}</p>
        <ArrowUpRight className={`relative z-10 h-4 w-4 text-slate-400 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none ${accent.text}`} />
      </article>
    </Link>
  );
}

export default function SocietiesClient({ societies, activityBySociety, upcomingEvents }: SocietiesClientProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [hoveredSocietyId, setHoveredSocietyId] = useState<string | null>(null);
  const [manualSocietyId, setManualSocietyId] = useState<string | null>(null);
  const [scrollSocietyId, setScrollSocietyId] = useState<string | null>(null);
  const manualTimerRef = useRef<number | null>(null);
  const activeSocietyId = hoveredSocietyId ?? manualSocietyId ?? scrollSocietyId;

  useEffect(() => {
    const saved = window.localStorage.getItem("societies-view");
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem("societies-view", next);
  };

  useEffect(() => {
    setHoveredSocietyId(null);
    setManualSocietyId(null);
    setScrollSocietyId(null);
    if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
  }, [query, view]);

  useEffect(() => () => {
    if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "Escape") {
        if (query) setQuery("");
        if (editing) target?.blur();
        return;
      }
      if (editing) return;
      const key = event.key.toLowerCase();
      if (key === "/") {
        event.preventDefault();
        document.getElementById("society-search")?.focus();
      } else if (key === "g") {
        setView("grid");
        window.localStorage.setItem("societies-view", "grid");
      } else if (key === "l") {
        setView("list");
        window.localStorage.setItem("societies-view", "list");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [query]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return societies;
    return societies.filter((society) => {
      const haystack = `${society.name} ${society.slug} ${societyDescription(society)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, societies]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!media.matches) {
        setScrollSocietyId(null);
        return;
      }
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-society-id]"));
      const targetY = window.innerHeight * 0.52;
      const targetX = window.innerWidth * 0.5;
      const activationBottom = window.innerHeight * 0.62;
      let closest: { id: string; distance: number } | null = null;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom < 160 || rect.top > activationBottom) continue;
        const id = node.dataset.societyId;
        if (!id) continue;
        const dy = rect.top + rect.height / 2 - targetY;
        const dx = (rect.left + rect.width / 2 - targetX) * 0.45;
        const distance = Math.hypot(dx, dy);
        if (!closest || distance < closest.distance) closest = { id, distance };
      }
      setScrollSocietyId(closest?.id ?? null);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
    };
  }, [filtered, view]);

  const scrollToSociety = (societyId: string) => {
    const node = document.querySelector<HTMLElement>(`[data-society-id="${societyId}"]`);
    if (!node) return;
    setHoveredSocietyId(null);
    setManualSocietyId(societyId);
    setScrollSocietyId(societyId);
    if (manualTimerRef.current) window.clearTimeout(manualTimerRef.current);
    manualTimerRef.current = window.setTimeout(() => {
      setManualSocietyId((current) => current === societyId ? null : current);
      manualTimerRef.current = null;
    }, 1400);

    // The network lives in a sticky control strip. Let the click's native focus
    // cycle finish first, then blur the sticky source before scrolling. Focus is
    // transferred to the destination only after the scroll has settled so the
    // browser cannot re-anchor the viewport to the sticky node mid-animation.
    window.setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const target = document.querySelector<HTMLElement>(`[data-society-id="${societyId}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const top = Math.max(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
      window.setTimeout(() => target.focus({ preventScroll: true }), reduceMotion ? 0 : 550);
    }, 0);
  };

  const activeSociety = activeSocietyId ? societies.find((society) => society.id === activeSocietyId) ?? null : null;
  const activeIndex = activeSociety ? societies.indexOf(activeSociety) : -1;
  const activeActivity = activeSociety ? activityBySociety[activeSociety.id] : undefined;
  const upcomingEventCount = Object.values(activityBySociety).reduce((total, signal) => total + signal.eventCount, 0);
  const activeCommunityCount = Object.keys(activityBySociety).length;

  return (
    <div className="relative min-h-screen w-full bg-white font-sans text-slate-950 selection:bg-ieee-blue/15">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-dvh overflow-hidden opacity-70">
        <StarsBackground starDensity={0.00022} allStarsTwinkle starColor="#94a3b8" />
        <div className="relative z-10 h-full opacity-50"><TechnicalDetails /></div>
      </div>
      <ReactiveBackdrop society={activeSociety} reduceMotion={Boolean(reduceMotion)} />
      <Navbar mobileAlign="right" />
      {activeSociety && (
        <motion.aside
          key={activeSociety.id}
          initial={reduceMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          data-testid="society-position-indicator"
          className="pointer-events-none fixed right-4 top-1/2 z-[19] hidden -translate-y-1/2 flex-col items-center gap-2 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400 xl:flex"
          aria-hidden="true"
        >
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span className="h-10 w-px bg-slate-200" />
          <span>{String(societies.length).padStart(2, "0")}</span>
          <span className="mt-1" style={{ color: societyAccent(activeSociety.slug).color }}>{activeSociety.slug.toUpperCase()}</span>
        </motion.aside>
      )}

      <main className="relative z-10 px-5 pb-0 pt-28 sm:px-6 sm:pt-32">
        <div className="mx-auto max-w-7xl">
          <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative overflow-hidden border-b border-slate-200 pb-12 sm:pb-16 lg:min-h-[520px] lg:pb-14">
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-3 left-0 hidden select-none text-[11.5vw] font-black leading-none tracking-[-0.075em] text-slate-950/[0.025] xl:block">SOCIETIES</div>
            <div className="relative z-10 flex items-center justify-between gap-6 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span>IEEE Sahrdaya / Community Index</span>
              <span>Directory · 2026</span>
            </div>

            <div className="relative z-10 mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="max-w-4xl">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">Explore · Connect · Build</p>
                <h1 className="mt-5 text-[3.25rem] font-semibold leading-[0.9] tracking-[-0.06em] text-slate-950 sm:text-7xl lg:text-[5.35rem] xl:text-[6.15rem]">
                  Find your field.<br /><span className="text-ieee-blue">Find your people.</span>
                </h1>
                <div className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">From computing and robotics to power, healthcare, signal processing and humanitarian technology — discover the IEEE community that matches what you want to explore next.</p>
                  <a href="#society-directory" className="group inline-flex items-center gap-3 whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-950">
                    Start exploring <span className="inline-block transition-transform duration-300 group-hover:translate-y-1">↓</span>
                  </a>
                </div>
              </div>

              <div className="relative border-y border-slate-200 py-5 lg:border-y-0 lg:border-l lg:py-2 lg:pl-9">
                <div className="flex items-end justify-between gap-6 lg:block">
                  <div>
                    <div className="text-[5.8rem] font-semibold leading-[0.78] tracking-[-0.075em] text-slate-950 sm:text-[7rem] lg:text-[9rem]">{String(societies.length).padStart(2, "0")}</div>
                    <p className="mt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Communities / One branch</p>
                  </div>
                  <div className="grid gap-2 text-right font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400 lg:mt-10 lg:grid-cols-2 lg:text-left">
                    <span>{String(upcomingEventCount).padStart(2, "0")} upcoming events</span>
                    <span className="lg:text-right">{String(activeCommunityCount).padStart(2, "0")} active now</span>
                    <span>Thrissur · Kerala</span>
                    <span className="lg:text-right">IEEE Student Branch</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <div id="society-directory" data-testid="society-directory-controls" className="sticky top-20 z-20 scroll-mt-24 bg-white/94 backdrop-blur-xl">
          <section data-testid="society-network" className="hidden border-b border-slate-200 py-4 md:block" aria-label="Society network status">
            <div className="flex items-center justify-between gap-6 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <motion.p
                key={activeSociety?.id ?? "network-idle"}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="truncate"
              >
                {activeSociety
                  ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(societies.length).padStart(2, "0")} · ${activeSociety.slug.toUpperCase()} · ${activeSociety.name}`
                  : `${String(societies.length).padStart(2, "0")} NODES · ONE STUDENT BRANCH`}
              </motion.p>
              <motion.p
                key={activeActivity?.nextEvent?.slug ?? "activity-idle"}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="shrink-0 text-right"
              >
                {activeActivity?.nextEvent
                  ? `NEXT / ${formatSignalDate(activeActivity.nextEvent.date)}`
                  : upcomingEventCount > 0
                    ? `${String(upcomingEventCount).padStart(2, "0")} UPCOMING EVENTS`
                    : "DISCOVER · CONNECT · BUILD"}
              </motion.p>
            </div>
            <div className="relative mt-4 py-2">
              <motion.div
                aria-hidden="true"
                className="absolute inset-x-0 top-1/2 h-px origin-left bg-slate-200"
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="relative grid" style={{ gridTemplateColumns: `repeat(${societies.length}, minmax(0, 1fr))` }}>
                {societies.map((society, index) => {
                  const active = society.id === activeSocietyId;
                  const accent = societyAccent(society.slug);
                  const eventCount = activityBySociety[society.id]?.eventCount ?? 0;
                  return (
                    <motion.button
                      key={society.id}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.55 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.2 + index * 0.035 }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        scrollToSociety(society.id);
                      }}
                      onClick={(event) => {
                        if (event.detail === 0) scrollToSociety(society.id);
                      }}
                      onMouseEnter={() => setHoveredSocietyId(society.id)}
                      onMouseLeave={() => setHoveredSocietyId(null)}
                      onFocus={() => setHoveredSocietyId(society.id)}
                      onBlur={() => setHoveredSocietyId(null)}
                      data-society-node={society.slug.toLowerCase()}
                      aria-label={`Jump to ${society.name}${eventCount ? `, ${eventCount} upcoming ${eventCount === 1 ? "event" : "events"}` : ""}`}
                      className="group/node flex h-6 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-2"
                    >
                      <span className={`relative block rounded-full border transition-all duration-300 ${eventCount > 1 ? "h-3 w-3" : "h-2.5 w-2.5"} ${active ? `scale-[1.45] border-white ring-1 ring-slate-300 ${accent.line}` : eventCount ? `border-white ring-1 ring-slate-300 ${accent.line}` : "border-slate-300 bg-white"}`}>
                        {eventCount > 1 && <span className="absolute inset-[-4px] rounded-full border opacity-35" style={{ borderColor: accent.color }} />}
                        {eventCount === 1 && !active && <span className={`absolute inset-[-3px] rounded-full opacity-20 ${accent.line}`} />}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="society-search" className="sr-only">Search societies</label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="society-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search societies, fields or interests…" className="h-11 w-full border-0 bg-transparent pl-10 pr-20 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-slate-50/50" />
                {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button> : <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-400 sm:block">/</kbd>}
              </div>
              <div className="flex items-center justify-between gap-3 px-1 sm:px-0">
                <span className="whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:pl-3">{query ? `SEARCH / ${query.toUpperCase()} · ${filtered.length} ${filtered.length === 1 ? "MATCH" : "MATCHES"}` : `${filtered.length} RESULTS`}</span>
                <div className="flex border-l border-slate-200 pl-2" role="group" aria-label="Society view">
                  <button type="button" aria-label="Grid view" title="Grid view (G)" aria-pressed={view === "grid"} onClick={() => chooseView("grid")} className={`p-2 transition ${view === "grid" ? "text-slate-950" : "text-slate-300 hover:text-slate-600"}`}><Grid3X3 className="h-4 w-4" /></button>
                  <button type="button" aria-label="List view" title="List view (L)" aria-pressed={view === "list"} onClick={() => chooseView("list")} className={`p-2 transition ${view === "list" ? "text-slate-950" : "text-slate-300 hover:text-slate-600"}`}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </section>
          </div>
          <section className="mt-6 pb-20 sm:mt-8 sm:pb-28">
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
                    <GridCard society={society} index={societies.indexOf(society)} total={societies.length} activity={activityBySociety[society.id]} onActivate={setHoveredSocietyId} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div layout>
                {filtered.map((society) => (
                  <motion.div key={society.id} layout initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <ListRow society={society} index={societies.indexOf(society)} activity={activityBySociety[society.id]} onActivate={setHoveredSocietyId} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </section>

        </div>
      </main>
      <LiveActivitySection upcomingEvents={upcomingEvents} totalUpcoming={upcomingEventCount} activeCommunities={activeCommunityCount} />
      <div className="relative z-20 bg-white px-5 py-5 sm:px-6" aria-hidden="true">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[9px]">
          <span>End / Live signal</span>
          <span>IEEE Sahrdaya Student Branch</span>
        </div>
      </div>
      <Footer />
    </div>
  );
}
