import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarDays, MapPin, Pencil, Plus, Sparkles } from "lucide-react";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { formatDate, formatDateShort } from "@/lib/dates";
import { getWieEventArtwork } from "@/lib/wie-media";
import type { SocietyPageData } from "@/server/public/society-detail.server";
import { WIE_REVEAL_TRANSITION } from "./wie-page-motion";

type WIEEvent = SocietyPageData["events"][number];

export function eventYear(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getUTCFullYear());
}

function eventCategory(event: WIEEvent): string {
  const value = `${event.title} ${event.tags}`.toLowerCase();
  if (
    value.includes("hack") ||
    value.includes("workshop") ||
    value.includes("ai") ||
    value.includes("cyber")
  ) {
    return "Technical learning";
  }
  if (
    value.includes("business") ||
    value.includes("brand") ||
    value.includes("resume") ||
    value.includes("lead")
  ) {
    return "Leadership and careers";
  }
  return "WIE activity";
}

function eventTags(event: WIEEvent): string[] {
  const explicit = event.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return explicit.length > 0 ? explicit.slice(0, 3) : [eventCategory(event)];
}

function eventDescription(event: WIEEvent, limit = 320): string {
  const text = blogHtmlToPlainText(event.description)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text
    .slice(0, limit)
    .trimEnd()
    .replace(/[.,;:]?$/, "")}…`;
}

export function eventHref(event: WIEEvent): string {
  return event.slug ? `/events/${event.slug}` : "/events";
}

function WIEEventArtwork({
  event,
  contain = false,
  className = "",
}: {
  event: WIEEvent;
  contain?: boolean;
  className?: string;
}) {
  const artwork = getWieEventArtwork(event.slug, event.bannerUrl);
  const fit = artwork?.fit || (contain ? "contain" : "cover");

  if (artwork) {
    return (
      <img
        src={artwork.src}
        alt={`${event.title} event artwork`}
        loading={contain ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full transition-transform duration-700 ease-out motion-reduce:transition-none ${
          fit === "contain"
            ? "object-contain p-4 sm:p-6"
            : "object-cover group-hover:scale-[1.025] motion-reduce:transform-none"
        } ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${event.title} event artwork`}
      className={`relative isolate h-full w-full overflow-hidden bg-[#24152a] p-6 text-white ${className}`}
    >
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.24) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-white/20" />
      <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full border border-[#d4a8df]/30 bg-[#8b3ba0]/10" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <span className="font-pixel text-[8px] leading-relaxed tracking-[0.16em] text-[#e9c8ef]">
            WIE / ACTIVITY
          </span>
          <span className="font-display text-5xl leading-none text-white/15 sm:text-6xl">
            {eventYear(event.date)}
          </span>
        </div>
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#d7a5e2]">
            {eventCategory(event)}
          </p>
          <p className="max-w-[18ch] text-2xl font-black leading-[1.05] tracking-tight sm:text-3xl">
            {event.title}
          </p>
        </div>
      </div>
    </div>
  );
}


export interface WIEActivitySectionProps {
  societyId: string;
  canEdit: boolean;
  featuredEvent?: WIEEvent;
  archiveEvents: WIEEvent[];
  archiveYearOptions: string[];
  selectedYear: string;
  onSelectedYearChange: (year: string) => void;
  filteredArchiveEvents: WIEEvent[];
  reduceMotion: boolean;
}

export function WIEActivitySection({
  societyId,
  canEdit,
  featuredEvent,
  archiveEvents,
  archiveYearOptions,
  selectedYear,
  onSelectedYearChange,
  filteredArchiveEvents,
  reduceMotion,
}: WIEActivitySectionProps) {
  return (
    <section id="activities" className="bg-[#fbf8fc] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
              03 / THE WORK
            </p>
            <h2 className="mt-5 font-display text-6xl uppercase leading-none tracking-tight text-[#211326] sm:text-8xl">
              Featured activity
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {canEdit && (
              <Link
                to={`/admin/events/new?society=${societyId}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2c1a31]/15 bg-white px-5 py-2.5 text-sm font-black text-[#24152a] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
              >
                <Plus className="h-4 w-4" /> Add event
              </Link>
            )}
            <Link
              to="/events"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2c1a31]/15 bg-white px-5 py-2.5 text-sm font-black text-[#24152a] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
            >
              All IEEE events <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {featuredEvent ? (
          <motion.article
            initial={
              reduceMotion ? false : { opacity: 0, y: 30, scale: 0.99 }
            }
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={WIE_REVEAL_TRANSITION}
            className="group overflow-hidden rounded-[2.25rem] border border-[#2c1a31]/12 bg-white shadow-[0_30px_90px_rgba(50,25,58,0.1)] transition-shadow duration-500 hover:shadow-[0_38px_110px_rgba(50,25,58,0.15)] motion-reduce:transition-none"
          >
            <div className="grid lg:grid-cols-[1.02fr_.98fr]">
              <div className="relative aspect-[4/3] min-h-[360px] overflow-hidden bg-[#211326] sm:min-h-[480px] lg:aspect-auto lg:min-h-full">
                <WIEEventArtwork event={featuredEvent} />
                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-[#1b101e]/30 via-transparent to-transparent" />
              </div>
              <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-14">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[#eee2f0] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#672677]">
                      {eventCategory(featuredEvent)}
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#807184]">
                      {featuredEvent.status}
                    </span>
                  </div>
                  <h3 className="mt-7 max-w-[16ch] font-display text-5xl uppercase leading-[0.94] tracking-tight text-[#211326] sm:text-7xl">
                    {featuredEvent.title}
                  </h3>
                  <div className="mt-8 grid gap-5 border-y border-[#2c1a31]/12 py-6 sm:grid-cols-2">
                    <div className="flex gap-3">
                      <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#7a2d8d]" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#655a69]">
                          Date
                        </p>
                        <p className="mt-1 font-bold text-[#2b1b30]">
                          {formatDate(featuredEvent.date)}
                        </p>
                      </div>
                    </div>
                    {featuredEvent.venue && (
                      <div className="flex gap-3">
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#7a2d8d]" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#655a69]">
                            Venue
                          </p>
                          <p className="mt-1 font-bold leading-relaxed text-[#2b1b30]">
                            {featuredEvent.venue}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[#655a69]">
                    {eventDescription(featuredEvent)}
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {eventTags(featuredEvent).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#2c1a31]/12 px-3 py-1.5 text-xs font-bold text-[#655a69]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-12 flex flex-wrap items-center gap-3">
                  <Link
                    to={eventHref(featuredEvent)}
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#24152a] px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#7a2d8d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d]"
                  >
                    View full activity <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  {canEdit && (
                    <Link
                      to={`/admin/events/${featuredEvent.id}/edit`}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#2c1a31]/15 px-5 py-3 text-sm font-black text-[#4e4152] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </motion.article>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-[#7a2d8d]/30 bg-white px-6 py-20 text-center">
            <Sparkles className="mx-auto h-9 w-9 text-[#7a2d8d]" />
            <h3 className="mt-5 text-2xl font-black text-[#24152a]">
              No public activity has been published yet.
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-[#6e6172]">
              Published and completed WIE events will appear here
              automatically from PocketBase.
            </p>
          </div>
        )}

        {archiveEvents.length > 0 && (
          <div className="mt-20">
            <div className="mb-9 flex flex-col gap-6 border-b border-[#2c1a31]/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
                  ACTIVITY LOG
                </p>
                <h3 className="mt-3 text-3xl font-black tracking-tight text-[#24152a] sm:text-4xl">
                  More verified WIE records
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {["all", ...archiveYearOptions].map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => onSelectedYearChange(year)}
                    aria-pressed={selectedYear === year}
                    className={`min-h-10 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                      selectedYear === year
                        ? "border-[#24152a] bg-[#24152a] text-white"
                        : "border-[#2c1a31]/15 bg-white text-[#655a69] hover:border-[#7a2d8d]/45 hover:text-[#7a2d8d]"
                    }`}
                  >
                    {year === "all" ? "All years" : year}
                  </button>
                ))}
                <span
                  aria-hidden="true"
                  className="ml-2 font-display text-4xl text-[#7a2d8d]"
                >
                  {String(filteredArchiveEvents.length).padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="grid gap-7 md:grid-cols-2">
              {filteredArchiveEvents.map((event, index) => (
                <motion.article
                  key={event.id}
                  initial={false}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                  transition={{ duration: 0.22 }}
                  className="group overflow-hidden rounded-[1.75rem] border border-[#2c1a31]/10 bg-white shadow-[0_22px_70px_rgba(50,25,58,0.07)] transition-shadow duration-300 hover:shadow-[0_30px_85px_rgba(50,25,58,0.13)] motion-reduce:transition-none"
                >
                  <Link
                    to={eventHref(event)}
                    className="block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7a2d8d]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#211326]">
                      <WIEEventArtwork event={event} />
                      <span className="absolute right-4 top-4 rounded-full border border-white/30 bg-[#1b101e]/70 px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.14em] text-white backdrop-blur-md">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="p-6 sm:p-7">
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.15em] text-[#7a2d8d]">
                        <span>{formatDateShort(event.date)}</span>
                        <span className="h-1 w-1 rounded-full bg-[#7a2d8d]/40" />
                        <span>{eventCategory(event)}</span>
                      </div>
                      <h4 className="mt-4 text-2xl font-black leading-tight tracking-tight text-[#211326] transition group-hover:text-[#7a2d8d] sm:text-3xl">
                        {event.title}
                      </h4>
                      <p className="mt-4 line-clamp-3 leading-relaxed text-[#6c6070]">
                        {eventDescription(event, 220)}
                      </p>
                      <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#24152a]">
                        Open activity{" "}
                        <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    </div>
                  </Link>
                  {canEdit && (
                    <div className="border-t border-[#2c1a31]/10 px-6 py-3 sm:px-7">
                      <Link
                        to={`/admin/events/${event.id}/edit`}
                        className="inline-flex items-center gap-2 text-xs font-black text-[#6d6071] hover:text-[#7a2d8d]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit this event
                      </Link>
                    </div>
                  )}
                </motion.article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
