import { ArrowRight, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { Link } from "react-router";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { formatDateLong, formatEventTime, formatWeekdayShort } from "@/lib/dates";
import type { HomeEventSummary } from "@/server/public/home.server";

interface Props {
  events: HomeEventSummary[];
  upcomingCount: number;
  societyCount: number;
  execomCount: number;
}

function EventVisual({ event }: { event: HomeEventSummary }) {
  if (event.bannerUrl) {
    return <img src={event.bannerUrl} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]" />;
  }
  return <EventBannerFallback title={event.title} societyName={event.society?.name} societySlug={event.society?.slug} className="h-full" showTitle={false} />;
}

export function NowAtSahrdaya({ events, upcomingCount, societyCount, execomCount }: Props) {
  const lead = events[0];
  const rail = events.slice(1, 4);

  return (
    <section id="events" className="relative bg-white px-5 pt-20 pb-12 sm:px-6 sm:pt-24 sm:pb-14 lg:px-10 lg:pt-28 lg:pb-16">
      <div className="mx-auto max-w-[1320px]">
        <HomeSectionHeading
          index="01"
          label="Now at Sahrdaya"
          title={<>What&apos;s happening <span className="text-ieee-blue">right now.</span></>}
          description="The next workshops, builds and sessions across the branch — pulled directly from the live programme."
          action={<Link to="/events" className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-700 transition hover:text-ieee-blue">View programme <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>}
        />

        {lead ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.72fr)]">
            <Link to={`/events/${lead.slug}`} className="group relative min-h-[430px] overflow-hidden rounded-2xl bg-gray-950 text-white sm:min-h-[520px]">
              <div className="absolute inset-0"><EventVisual event={lead} /></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/5" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-white/65 sm:p-7">
                <span>Next / 01</span>
                <span>{lead.registrationAvailable ? "Registration open" : "Programme entry"}</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 lg:p-8">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-200">{lead.society?.name || "IEEE Sahrdaya"}</p>
                <h3 className="mt-3 max-w-4xl text-4xl font-bold leading-[0.96] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{lead.title}</h3>
                {lead.description ? <p className="mt-4 max-w-2xl line-clamp-2 text-sm leading-6 text-white/68 sm:text-base">{lead.description}</p> : null}
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-white/75">
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-300" />{formatDateLong(lead.date)} · {formatEventTime(lead.date, lead.timeTbc)}</span>
                  {lead.venue ? <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-300" />{lead.venue}</span> : null}
                </div>
                <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold backdrop-blur-sm transition group-hover:bg-white group-hover:text-gray-950">View event <ArrowUpRight className="h-4 w-4" /></span>
              </div>
            </Link>

            <aside className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <p className="font-pixel text-[10px] text-gray-700">UPCOMING / {String(upcomingCount).padStart(2, "0")}</p>
                <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-400">Live programme</span>
              </div>
              <ol className="grow">
                {rail.map((event, index) => (
                  <li key={event.id} className="border-b border-gray-100 last:border-b-0">
                    <Link to={`/events/${event.slug}`} className="group grid grid-cols-[38px_1fr_auto] gap-3 py-5">
                      <span className="font-pixel text-[9px] text-ieee-blue">{String(index + 2).padStart(2, "0")}</span>
                      <span>
                        <span className="block font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-400">{formatWeekdayShort(event.date)} · {formatDateLong(event.date)}</span>
                        <span className="mt-1.5 block text-base font-bold leading-snug text-gray-900 transition group-hover:text-ieee-blue">{event.title}</span>
                        <span className="mt-2 block text-xs text-gray-500">{event.society?.name || "IEEE Sahrdaya"}</span>
                      </span>
                      <ArrowUpRight className="mt-1 h-4 w-4 text-gray-300 transition group-hover:text-ieee-blue" />
                    </Link>
                  </li>
                ))}
              </ol>
              <Link to="/events" className="mt-4 inline-flex items-center justify-between rounded-xl bg-gray-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-ieee-blue">Browse all events <ArrowRight className="h-4 w-4" /></Link>
            </aside>
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center"><p className="font-pixel text-[10px] text-gray-400">NO UPCOMING PROGRAMME</p><Link to="/events" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ieee-blue">Browse event archive <ArrowRight className="h-4 w-4" /></Link></div>
        )}

        <div className="mt-6 grid border-y border-gray-200 sm:grid-cols-3">
          {[['Communities', societyCount], ['Upcoming', upcomingCount], ['Execom roster', execomCount]].map(([label, value], index) => (
            <div key={String(label)} className={`flex items-baseline justify-between gap-4 py-4 sm:px-5 ${index > 0 ? "border-t border-gray-200 sm:border-l sm:border-t-0" : ""}`}><span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</span><strong className="font-pixel text-lg text-gray-900">{String(value).padStart(2, "0")}</strong></div>
          ))}
        </div>
      </div>
    </section>
  );
}
