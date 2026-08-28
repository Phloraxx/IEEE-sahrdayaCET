import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  Pencil,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Instagram, Linkedin } from "@/components/icons";
import { EventArtworkPreview } from "@/components/events/EventArtworkPreview";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import { useAuth } from "@/lib/auth-context";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { getBlogContentType } from "@/lib/blog-presentation";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { formatDate, formatEventTime } from "@/lib/dates";
import { isPastEvent } from "@/lib/event-lifecycle";
import { getSocietyPalette, personInitials, societyCode } from "@/lib/society-presentation";
import { hasScopedWorkspaceCapability } from "@/lib/workspace-permissions";
import type { SocietyPageData } from "@/server/public/society-detail.server";
import type { BlogPost, Society } from "@/types";

type SocietyEvent = SocietyPageData["events"][number];
type SocietyMember = SocietyPageData["members"][number];

export interface SocietyDetailViewProps {
  page: SocietyPageData;
  directory: Society[];
  stories: BlogPost[];
}

function formatSignalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })
    .format(date)
    .toUpperCase();
}

function eventState(event: SocietyEvent) {
  if (event.status === "completed" || isPastEvent(event)) return "ARCHIVE";
  return "UPCOMING";
}

function MemberPortrait({ member, accent }: { member: SocietyMember; accent: string }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-white/[0.055]">
      {member.photoUrl ? (
        <img src={member.photoUrl} alt={member.name} loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.025]" />
      ) : (
        <div className="grid h-full place-items-center" style={{ backgroundColor: `${accent}16` }}>
          <span className="text-4xl font-semibold text-white/45">{personInitials(member.name)}</span>
        </div>
      )}
    </div>
  );
}

function EventVisual({ event, society }: { event: SocietyEvent; society: SocietyPageData["society"] }) {
  return event.bannerUrl ? (
    <EventArtworkPreview src={event.bannerUrl} alt={`${event.title} event artwork`} />
  ) : (
    <EventBannerFallback title={event.title} societyName={society.name} societySlug={society.slug} showTitle={false} />
  );
}

function StoryVisual({ story, accent }: { story: BlogPost; accent: string }) {
  if (story.coverUrl) {
    return <img src={story.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />;
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07121f]">
      <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 70% 25%, ${accent}aa 0, transparent 38%)` }} />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
      <span className="absolute bottom-4 left-4 font-pixel text-[8px] uppercase tracking-[0.18em] text-white/55">IEEE / STORY</span>
    </div>
  );
}

export function SocietyDetailView({ page, directory, stories }: SocietyDetailViewProps) {
  const { society, members, events } = page;
  const palette = getSocietyPalette(society.slug);
  const code = societyCode(society.slug);
  const { user } = useAuth();
  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });
  const canEdit = hasScopedWorkspaceCapability(workspace.data, "events.edit", { societyId: society.id });

  const advisor = useMemo(
    () => members.find((member) => /advisor|incharge|in-charge/i.test(member.position)),
    [members],
  );
  const officers = useMemo(() => members.filter((member) => member.id !== advisor?.id), [members, advisor]);
  const upcoming = useMemo(
    () => events.filter((event) => event.status === "published" && !isPastEvent(event)).sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [events],
  );
  const archive = useMemo(
    () => events.filter((event) => !upcoming.some((item) => item.id === event.id)).sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [events, upcoming],
  );
  const activity = [...upcoming, ...archive];
  const featuredEvent = activity[0];
  const activityRows = activity.slice(featuredEvent ? 1 : 0, 7);
  const directoryIndex = Math.max(0, directory.findIndex((item) => item.slug === society.slug));
  const previous = directoryIndex > 0 ? directory[directoryIndex - 1] : null;
  const next = directoryIndex >= 0 && directoryIndex < directory.length - 1 ? directory[directoryIndex + 1] : null;
  const bio = blogHtmlToPlainText(society.bio || "").replace(/\s+/g, " ").trim();
  const heroSummary = bio.length > 220
    ? `${bio.slice(0, 220).replace(/\s+\S*$/, "").trim()}…`
    : bio;
  const hiddenActivityCount = Math.max(0, activity.length - (featuredEvent ? 1 : 0) - activityRows.length);

  return (
    <div className="min-h-screen bg-[#f7f8f8] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar />

      <section data-testid="society-profile-hero" className="relative overflow-hidden border-b border-black/10 bg-[#f7f8f8]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.26] [background-image:radial-gradient(circle_at_center,rgba(12,35,52,.18)_0.7px,transparent_0.8px)] [background-size:24px_24px]" />
        <div className="pointer-events-none absolute -right-24 top-24 h-[36rem] w-[36rem] rounded-full blur-3xl" style={{ backgroundColor: `${palette.accent}0d` }} />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-10 pt-28 sm:px-8 sm:pb-12 lg:px-12 lg:pt-36">
          <div className="flex items-center justify-between border-b border-black/12 pb-5">
            <Link to="/societies" className="group inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-black/45 transition hover:text-[#00629B]">
              <ArrowLeft className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" /> Society directory
            </Link>
            <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-black/35">
              Profile {String(directoryIndex + 1).padStart(2, "0")} / {String(directory.length).padStart(2, "0")}
            </span>
          </div>

          <div className="grid gap-10 py-10 md:grid-cols-12 md:items-end md:gap-8 md:py-14 lg:py-16">
            <div className="md:col-span-7 lg:col-span-8">
              <p className="text-[9px] font-bold uppercase tracking-[0.23em]" style={{ color: palette.accent }}>IEEE Sahrdaya / {code}</p>
              <h1 className="mt-5 max-w-5xl text-[clamp(3rem,7.4vw,7.4rem)] font-semibold leading-[0.86] tracking-[-0.072em] text-[#111315]">
                {society.name}
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-black/52 sm:text-lg sm:leading-8">{heroSummary}</p>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[9px] font-bold uppercase tracking-[0.18em]">
                <a href="#people" className="group inline-flex items-center gap-2 text-black/48 transition hover:text-black">Meet the people <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
                <a href="#activity" className="group inline-flex items-center gap-2 text-black/48 transition hover:text-black">See activity <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
                {society.defaultWhatsappLink && (
                  <a href={society.defaultWhatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2" style={{ color: palette.accent }}>Join community <ExternalLink className="h-3.5 w-3.5" /></a>
                )}
              </div>
            </div>

            <div className="md:col-span-5 lg:col-span-4">
              <div className="relative aspect-square overflow-hidden border bg-white" style={{ borderColor: `${palette.accent}26`, background: `linear-gradient(145deg, ${palette.soft}, #ffffff 62%)` }}>
                <span aria-hidden="true" className="absolute -bottom-[0.12em] -right-[0.08em] select-none text-[clamp(7rem,17vw,15rem)] font-black leading-none tracking-[-0.09em]" style={{ color: `${palette.accent}0c` }}>{code}</span>
                <div className="absolute left-5 top-5 flex items-center gap-2 font-mono text-[7px] font-semibold uppercase tracking-[0.18em] text-black/38">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.accent }} /> IEEE Sahrdaya
                </div>
                <div className="absolute inset-[18%] grid place-items-center">
                  {society.logoUrl ? <img src={society.logoUrl} alt={`${society.name} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-7xl font-semibold" style={{ color: palette.accent }}>{code}</span>}
                </div>
                <div className="absolute inset-x-5 bottom-5 flex items-center justify-between border-t border-black/10 pt-3 font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-black/35">
                  <span>Society identity</span><span>{code} / 2026</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid border-y border-black/12 sm:grid-cols-4">
            {[
              ["People", String(members.length).padStart(2, "0")],
              ["Activities", String(events.length).padStart(2, "0")],
              ["Next", upcoming[0] ? formatSignalDate(upcoming[0].date) : "—"],
              ["Directory", `${String(directoryIndex + 1).padStart(2, "0")} / ${String(directory.length).padStart(2, "0")}`],
            ].map(([label, value], index) => (
              <div key={label} className={`py-4 sm:px-5 ${index > 0 ? "sm:border-l sm:border-black/10" : ""} ${index > 1 ? "border-t border-black/10 sm:border-t-0" : index === 1 ? "border-t border-black/10 sm:border-t-0" : ""}`}>
                <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.18em] text-black/32">{label}</p>
                <p className="mt-2 text-lg font-semibold tracking-[-0.035em]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {society.bannerUrl && (
        <figure className="mx-auto max-w-[1440px] border-x border-b border-black/10 bg-[#111315]">
          <div className="relative aspect-[16/8] overflow-hidden sm:aspect-[16/6] lg:aspect-[16/5]">
            <img src={society.bannerUrl} alt={`${society.name} chapter`} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-transparent" />
            <figcaption className="absolute bottom-4 left-5 font-mono text-[7px] font-semibold uppercase tracking-[0.18em] text-white/65 sm:left-8">Chapter frame / {code}</figcaption>
          </div>
        </figure>
      )}

      <section id="about" className="bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 border-b border-black/10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:px-12 lg:py-24">
          <div className="lg:col-span-4">
            <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>01 / Mission</p>
            <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">What {code} is here to advance.</h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <p className="text-xl leading-[1.55] tracking-[-0.02em] text-black/68 sm:text-2xl">{bio}</p>
            <div className="mt-10 h-px w-24" style={{ backgroundColor: palette.accent }} />
            <p className="mt-5 max-w-xl text-sm leading-6 text-black/42">Part of IEEE Sahrdaya Student Branch · Kodakara, Thrissur. Activity and leadership below are drawn from the branch’s public records.</p>
          </div>
        </div>
      </section>

      <section id="people" className="relative overflow-hidden bg-[#07121f] text-white">
        <div className="pointer-events-none absolute -right-32 top-0 h-[34rem] w-[34rem] rounded-full blur-3xl" style={{ backgroundColor: `${palette.accent}18` }} />
        <div className="relative mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="grid gap-7 border-b border-white/12 pb-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>02 / People</p>
              <h2 className="mt-4 text-5xl font-semibold leading-[0.9] tracking-[-0.065em] sm:text-6xl lg:text-7xl">The people behind {code}.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-white/46 lg:col-span-4 lg:justify-self-end">Current public office-bearer records for {society.name}.</p>
          </div>

          {advisor && (
            <div className="grid gap-6 border-b border-white/12 py-10 md:grid-cols-[220px_minmax(0,1fr)] md:items-end lg:grid-cols-[260px_minmax(0,1fr)_220px]">
              <div className="group max-w-[260px]"><MemberPortrait member={advisor} accent={palette.accent} /></div>
              <div>
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.accent }}>Faculty advisor</p>
                <h3 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{advisor.name}</h3>
                <p className="mt-3 text-sm text-white/48">{advisor.position}{advisor.department ? ` · ${advisor.department}` : ""}</p>
              </div>
              <div className="flex gap-4 md:col-start-2 lg:col-start-auto lg:justify-self-end">
                {advisor.linkedin && <a href={advisor.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${advisor.name} on LinkedIn`} className="text-white/45 transition hover:text-white"><Linkedin className="h-5 w-5" /></a>}
                {advisor.instagram && <a href={advisor.instagram} target="_blank" rel="noopener noreferrer" aria-label={`${advisor.name} on Instagram`} className="text-white/45 transition hover:text-white"><Instagram className="h-5 w-5" /></a>}
              </div>
            </div>
          )}

          {officers.length > 0 ? (
            <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {officers.map((member, index) => (
                <article key={member.id} className="group bg-[#07121f] p-4 sm:p-5">
                  <MemberPortrait member={member} accent={palette.accent} />
                  <div className="pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.accent }}>{String(index + 1).padStart(2, "0")} / {member.position}</p>
                        <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.04em]">{member.name}</h3>
                      </div>
                      <div className="flex shrink-0 gap-3 pt-1">
                        {member.linkedin && <a href={member.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on LinkedIn`} className="text-white/35 transition hover:text-white"><Linkedin className="h-4 w-4" /></a>}
                        {member.instagram && <a href={member.instagram} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on Instagram`} className="text-white/35 transition hover:text-white"><Instagram className="h-4 w-4" /></a>}
                      </div>
                    </div>
                    {(member.department || member.batch) && <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/35">{[member.department, member.batch].filter(Boolean).join(" · ")}</p>}
                  </div>
                </article>
              ))}
            </div>
          ) : !advisor ? (
            <div className="border-b border-white/12 py-16 text-sm text-white/45">Leadership details will appear here when they are published.</div>
          ) : null}
        </div>
      </section>

      <section id="activity" className="bg-[#f4f2ed]">
        <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="grid gap-7 border-b border-black/12 pb-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>03 / Activity</p>
              <h2 className="mt-4 text-5xl font-semibold leading-[0.9] tracking-[-0.065em] sm:text-6xl lg:text-7xl">Built, taught, tested.</h2>
            </div>
            <div className="flex items-center gap-5 lg:col-span-4 lg:justify-self-end">
              {canEdit && <a href={`/admin/events/new?society=${society.id}`} className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.17em]" style={{ color: palette.accent }}><Plus className="h-4 w-4" /> Add event</a>}
              <Link to="/events" className="group inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.17em] text-black/48 transition hover:text-black">Full programme <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            </div>
          </div>

          {featuredEvent ? (
            <>
              <Link to={`/events/${featuredEvent.slug}`} className="group grid gap-7 border-b border-black/12 py-10 lg:grid-cols-12 lg:items-center">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#07121f] sm:aspect-[16/9] lg:col-span-5 lg:aspect-[4/3]"><EventVisual event={featuredEvent} society={society} /></div>
                <div className="lg:col-span-6 lg:col-start-7">
                  <div className="flex items-center justify-between gap-4 font-mono text-[8px] font-semibold uppercase tracking-[0.18em]"><span style={{ color: palette.accent }}>{eventState(featuredEvent)} / Lead activity</span><span className="text-black/32">{formatDate(featuredEvent.date)}</span></div>
                  <h3 className="mt-5 text-4xl font-semibold leading-[0.95] tracking-[-0.055em] transition group-hover:text-[#00629B] sm:text-5xl">{featuredEvent.title}</h3>
                  <p className="mt-5 max-w-xl text-sm leading-6 text-black/52">{blogHtmlToPlainText(featuredEvent.description || "").replace(/\s+/g, " ").trim() || "Open the programme record for full details."}</p>
                  <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-[9px] font-bold uppercase tracking-[0.15em] text-black/42"><span>{formatEventTime(featuredEvent.date, featuredEvent.timeTbc)}</span><span>{featuredEvent.venue || "Venue TBC"}</span><span>{featuredEvent.price > 0 ? `₹${featuredEvent.price}` : "Free"}</span></div>
                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold" style={{ color: palette.accent }}>Open event record <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
                </div>
              </Link>

              {activityRows.length > 0 && (
                <div data-testid="society-activity-index">
                  {activityRows.map((event, index) => (
                    <div key={event.id} className="group grid gap-3 border-b border-black/10 py-5 sm:grid-cols-[58px_minmax(0,1fr)_180px_80px] sm:items-center">
                      <span className="font-mono text-[8px] font-semibold text-black/28">{String(index + 2).padStart(2, "0")}</span>
                      <Link to={`/events/${event.slug}`} className="min-w-0">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.accent }}>{eventState(event)}</p>
                        <h3 className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] transition group-hover:text-[#00629B]">{event.title}</h3>
                      </Link>
                      <p className="text-xs leading-5 text-black/42">{formatDate(event.date)}<br />{formatEventTime(event.date, event.timeTbc)}</p>
                      <div className="flex items-center gap-3 sm:justify-end">
                        {canEdit && <a href={`/admin/events/${event.id}/edit`} aria-label={`Edit ${event.title}`} className="text-black/30 transition hover:text-black"><Pencil className="h-3.5 w-3.5" /></a>}
                        <Link to={`/events/${event.slug}`} aria-label={`Open ${event.title}`} className="text-black/30 transition group-hover:translate-x-1 group-hover:text-[#00629B]"><ArrowRight className="h-4 w-4" /></Link>
                      </div>
                    </div>
                  ))}
                  {hiddenActivityCount > 0 && (
                    <Link to="/events" className="group flex items-center justify-between border-b border-black/10 py-5 text-[9px] font-bold uppercase tracking-[0.17em] text-black/42 transition hover:text-black">
                      <span>+ {hiddenActivityCount} more {hiddenActivityCount === 1 ? "record" : "records"} in the programme archive</span>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="grid min-h-72 place-items-center border-b border-black/12 text-center">
              <div>
                <CalendarDays className="mx-auto h-7 w-7 text-black/25" />
                <h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">No public activity yet.</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/45">When {society.name} publishes an event, it will become part of this programme record.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {stories.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
            <div className="grid gap-7 border-b border-black/12 pb-9 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-8">
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>04 / Stories</p>
                <h2 className="mt-4 text-5xl font-semibold leading-[0.9] tracking-[-0.065em] sm:text-6xl">From this society.</h2>
              </div>
              <Link to="/blog" className="group inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.17em] text-black/48 transition hover:text-black lg:col-span-4 lg:justify-self-end">Open Blog <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            </div>
            <div className="grid gap-px bg-black/10 md:grid-cols-3">
              {stories.slice(0, 3).map((story, index) => (
                <Link key={story.id} to={`/blog/${story.slug}`} className="group bg-white p-4 sm:p-5">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#07121f]"><StoryVisual story={story} accent={palette.accent} /></div>
                  <div className="pt-5">
                    <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.17em]" style={{ color: palette.accent }}>{String(index + 1).padStart(2, "0")} / {getBlogContentType(story)}</p>
                    <h3 className="mt-3 text-2xl font-semibold leading-[1.02] tracking-[-0.045em] transition group-hover:text-[#00629B]">{story.title}</h3>
                    <div className="mt-4 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.14em] text-black/35"><span>{story.readMinutes || 1} min</span><ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-black/10 bg-[#f7f8f8]">
        <div className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-12">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-black/32">Continue through the directory</p>
          <div className="mt-6 grid gap-px bg-black/10 md:grid-cols-2">
            {previous ? (
              <Link to={`/societies/${previous.slug}`} className="group bg-[#f7f8f8] p-6 transition hover:bg-white sm:p-8">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Previous society</p><div className="mt-4 flex items-end justify-between gap-5"><h2 className="text-3xl font-semibold leading-none tracking-[-0.05em]">{previous.name}</h2><ArrowLeft className="h-5 w-5 text-black/30 transition group-hover:-translate-x-1" /></div>
              </Link>
            ) : <Link to="/societies" className="group bg-[#f7f8f8] p-6 transition hover:bg-white sm:p-8"><p className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Back to</p><div className="mt-4 flex items-end justify-between gap-5"><h2 className="text-3xl font-semibold leading-none tracking-[-0.05em]">Society directory</h2><ArrowLeft className="h-5 w-5 text-black/30" /></div></Link>}
            {next ? (
              <Link to={`/societies/${next.slug}`} className="group bg-[#f7f8f8] p-6 transition hover:bg-white sm:p-8 md:text-right">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Next society</p><div className="mt-4 flex items-end justify-between gap-5 md:flex-row-reverse"><h2 className="text-3xl font-semibold leading-none tracking-[-0.05em]">{next.name}</h2><ArrowRight className="h-5 w-5 text-black/30 transition group-hover:translate-x-1" /></div>
              </Link>
            ) : <Link to="/societies" className="group bg-[#f7f8f8] p-6 transition hover:bg-white sm:p-8 md:text-right"><p className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Return to</p><div className="mt-4 flex items-end justify-between gap-5 md:flex-row-reverse"><h2 className="text-3xl font-semibold leading-none tracking-[-0.05em]">All 13 societies</h2><ArrowRight className="h-5 w-5 text-black/30" /></div></Link>}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
