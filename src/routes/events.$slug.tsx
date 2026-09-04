import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Clock3,
  ReceiptText,
  XCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { EventArtworkPreview } from "@/components/events/EventArtworkPreview";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import SustainXEventStory from "@/components/events/SustainXEventStory";
import { useAuth } from "@/lib/auth-context";
import {
  getEventWaitlist,
  getMyEventRegistration,
  joinEventWaitlist,
  leaveEventWaitlist,
  type EventWaitlistResponse,
} from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import type { MyEventRegistration } from "@/lib/registration-state";
import Footer from "@/components/Footer";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText, sanitizeBlogHtml } from "@/lib/blog-content";
import { formatAppDateISO, formatDate, formatEventTime, formatYear } from "@/lib/dates";
import { eventTitleSize, MOTION_DURATION, MOTION_EASE, revealUp } from "@/lib/motion";
import type { EventAvailabilityKind } from "@/lib/event-availability";
import { getEventLifecycleSnapshot } from "@/lib/event-lifecycle-snapshot";
import {
  getEventSocietySlug,
  resolveEventArtwork,
  resolveEventSocialImagePath,
} from "@/lib/event-artwork";
import {
  getSchemaAttendanceMode,
  getSchemaEventStatus,
} from "@/lib/event-presentation";
import {
  fetchEventBySlug,
  fetchEvents,
  type SerializableEvent,
} from "@/server/public/events.server";

type EventDetailData = { event: SerializableEvent; related: SerializableEvent[] };

export async function loader({
  params,
}: LoaderFunctionArgs): Promise<EventDetailData> {
  if (!params.slug) throw new Response("Event not found", { status: 404 });
  const [event, programme] = await Promise.all([fetchEventBySlug(params.slug), fetchEvents()]);
  if (!event) throw new Response("Event not found", { status: 404 });

  const candidates = programme.filter((item) => item.id !== event.id);
  const eventTime = new Date(event.date).getTime();
  const future = candidates.filter((item) => new Date(item.date).getTime() > eventTime);
  const pool = future.length > 0 ? future : [...candidates].reverse();
  const sameSociety = event.society?.id
    ? pool.filter((item) => item.society?.id === event.society?.id)
    : [];
  const related = [...sameSociety, ...pool]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 3);

  return { event, related };
}

function resolveEventImage(event: SerializableEvent): string {
  const imagePath = resolveEventSocialImagePath(event);
  return imagePath.startsWith("http") ? imagePath : `${APP_URL}${imagePath}`;
}

export const meta = ({ data }: { data?: EventDetailData }) => {
  const event = data?.event;
  if (!event)
    return [
      { title: "Event not found | IEEE Sahrdaya" },
      { name: "robots", content: "noindex" },
    ];

  const description =
    event.slug === "sustainx"
      ? "SustainX: From Street to Smart City — 14 teams, three phases and practical SDG 11 ideas at IEEE Sahrdaya on 20 August 2026."
      : blogHtmlToPlainText(event.description).slice(0, 160) ||
        `${event.title} at IEEE Sahrdaya Student Branch.`;
  const url = `${APP_URL}/events/${event.slug}`;
  const image = resolveEventImage(event);

  return [
    { title: `${event.title} | IEEE Sahrdaya` },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: event.title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: event.title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
};

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** PocketBase timestamps use a space separator; schema.org expects ISO-8601. */
function toSchemaDate(value: string): string {
  return value.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
}

function physicalLocation(event: SerializableEvent) {
  const venue = event.venue || "Sahrdaya College of Engineering & Technology";
  const address = event.locationAddress.trim();
  const atSahrdaya = /sahrdaya|kodakara/i.test(`${venue} ${address}`);
  return {
    "@type": "Place",
    name: venue,
    ...(address
      ? { address }
      : atSahrdaya
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: "Sahrdaya College of Engineering & Technology",
              addressLocality: "Kodakara",
              addressRegion: "Kerala",
              postalCode: "680684",
              addressCountry: "IN",
            },
          }
        : {}),
  };
}

function RelatedEventCard({ event }: { event: SerializableEvent }) {
  const artwork = resolveEventArtwork(event);
  const availability = getEventLifecycleSnapshot(event).registration;
  return (
    <Link
      to={`/events/${event.slug}`}
      className="group grid gap-4 border-t border-black/12 py-5 transition hover:border-[#00629B] sm:grid-cols-[118px_1fr_auto] sm:items-center"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#07121f]">
        {artwork ? (
          <EventArtworkPreview src={artwork.src} alt={`${event.title} event artwork`} />
        ) : (
          <EventBannerFallback
            title={event.title}
            societyName={event.society?.name}
            societySlug={event.society?.slug}
            showTitle={false}
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#00629B]">
          {event.society?.name || "IEEE Sahrdaya"}
        </p>
        <h3 className="mt-2 text-xl font-semibold leading-[1.02] tracking-[-0.035em] transition group-hover:text-[#00629B]">
          {event.title}
        </h3>
        <p className="mt-2 text-xs leading-5 text-black/45">
          {formatDate(event.date)} · {formatEventTime(event.date, event.timeTbc)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/38">{availability.label}</span>
        <ArrowRight className="h-4 w-4 text-black/25 transition group-hover:translate-x-1 group-hover:text-[#00629B] sm:ml-auto sm:mt-3" />
      </div>
    </Link>
  );
}

export default function EventDetailPage() {
  const { event, related } = useLoaderData<typeof loader>();
  const { user, status: authStatus } = useAuth();
  const [myRegistration, setMyRegistration] = useState<MyEventRegistration | null>(null);
  const [myRegistrationLoading, setMyRegistrationLoading] = useState(false);
  const [waitlistState, setWaitlistState] = useState<EventWaitlistResponse | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [compactMobileAction, setCompactMobileAction] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const onScroll = () => setCompactMobileAction(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id || event.externalFormUrl) {
      setMyRegistration(null);
      setMyRegistrationLoading(false);
      return;
    }
    let active = true;
    setMyRegistrationLoading(true);
    void getMyEventRegistration(event.id)
      .then((state) => { if (active) setMyRegistration(state); })
      .catch(() => { if (active) setMyRegistration(null); })
      .finally(() => { if (active) setMyRegistrationLoading(false); });
    return () => { active = false; };
  }, [authStatus, event.externalFormUrl, event.id, user?.id]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id || !event.waitlistEnabled || event.registrationMode !== "internal") {
      setWaitlistState(null);
      setWaitlistLoading(false);
      return;
    }
    let active = true;
    setWaitlistLoading(true);
    void getEventWaitlist(event.id)
      .then((state) => { if (active) setWaitlistState(state); })
      .catch(() => { if (active) setWaitlistState(null); })
      .finally(() => { if (active) setWaitlistLoading(false); });
    return () => { active = false; };
  }, [authStatus, event.id, event.registrationMode, event.waitlistEnabled, user?.id]);

  const refreshWaitlist = async () => {
    if (!user?.id || !event.waitlistEnabled) return;
    try { setWaitlistState(await getEventWaitlist(event.id)); } catch { /* keep current state */ }
  };
  const joinWaitlist = async () => {
    setWaitlistBusy(true);
    try {
      await joinEventWaitlist(event.id);
      await refreshWaitlist();
      toast.success("You joined the waitlist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join the waitlist");
      await refreshWaitlist();
    } finally { setWaitlistBusy(false); }
  };
  const leaveWaitlist = async () => {
    setWaitlistBusy(true);
    try {
      await leaveEventWaitlist(event.id);
      await refreshWaitlist();
      toast.success("You left the waitlist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not leave the waitlist");
    } finally { setWaitlistBusy(false); }
  };

  const downloadReceipt = () => {
    if (!myRegistration?.registrationId) return;
    void downloadRegistrationReceipt(myRegistration.registrationId).catch(() => undefined);
  };
  const canonicalUrl = `${APP_URL}/events/${event.slug}`;
  const isWieEvent = getEventSocietySlug(event) === "wie";
  const backHref = isWieEvent ? "/societies/wie#activities" : "/events";
  const backLabel = isWieEvent ? "Back to WIE activities" : "All events";
  const registerUrl = event.externalFormUrl || `/register/${event.id}`;
  const description =
    event.slug === "sustainx"
      ? "SustainX brought 14 teams together to identify local sustainability challenges, develop practical solutions and present ideas aligned with UN SDG 11."
      : blogHtmlToPlainText(event.description);
  const eventImageUrl = resolveEventImage(event);
  const eventArtwork = resolveEventArtwork(event);
  const titleSize = eventTitleSize(event.title);
  const lifecycle = getEventLifecycleSnapshot(event);
  const attendanceMode = event.attendanceMode;
  const registrationAvailable = lifecycle.registration.available;
  const availability = lifecycle.registration;
  const waitlistEligible = event.waitlistEnabled && lifecycle.registration.mode === "internal" && availability.kind === "full";
  const audienceRestricted = (event.eligibleSemesters?.length || 0) > 0 || (event.eligibleProgrammes?.length || 0) > 0;
  const waitlistEntry = waitlistState?.state || null;
  const availabilityClass: Record<EventAvailabilityKind, string> = {
    "opening-soon": "text-[#00629B]",
    open: "text-[#00629B]",
    filling: "text-teal-700",
    "filling-fast": "text-amber-700",
    "few-left": "text-orange-700",
    "closing-soon": "text-amber-700",
    full: "text-rose-700",
    closed: "text-black/40",
  };
  const unavailableRegistrationLabel =
    availability.kind === "opening-soon"
      ? "Registration opens soon"
      : availability.kind === "full"
        ? "Registration full"
        : "Registration closed";
  const virtualLocation = {
    "@type": "VirtualLocation",
    // Private meeting URLs are intentionally excluded from public event data.
    url: canonicalUrl,
  };
  const location =
    attendanceMode === "online"
      ? virtualLocation
      : attendanceMode === "hybrid"
        ? [physicalLocation(event), virtualLocation]
        : physicalLocation(event);
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.timeTbc ? formatAppDateISO(event.date) : toSchemaDate(event.date),
    ...(event.endDate ? { endDate: event.timeTbc ? formatAppDateISO(event.endDate) : toSchemaDate(event.endDate) } : {}),
    eventStatus: getSchemaEventStatus(event.status),
    eventAttendanceMode: getSchemaAttendanceMode({ attendanceMode: event.attendanceMode, venue: event.venue }),
    description: description || undefined,
    image: [eventImageUrl],
    url: canonicalUrl,
    location,
    organizer: {
      "@type": "Organization",
      name: event.society?.name || "IEEE Sahrdaya Student Branch",
      url: event.society?.slug
        ? `${APP_URL}/societies/${event.society.slug}`
        : APP_URL,
    },
    ...(registrationAvailable
      ? {
          offers: {
            "@type": "Offer",
            url: event.externalFormUrl || `${APP_URL}/register/${event.id}`,
            price: event.price,
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };

  const actionHref = myRegistration?.found
    ? myRegistration.paymentRequired
      ? `/payment/${myRegistration.registrationId}`
      : myRegistration.ticketId
        ? `/ticket/${myRegistration.ticketId}`
        : null
    : registrationAvailable
      ? registerUrl
      : waitlistEligible && waitlistEntry?.status !== "waiting"
        ? registerUrl
        : null;
  const actionLabel = myRegistration?.found
    ? myRegistration.paymentRequired
      ? "Continue payment"
      : myRegistration.ticketId
        ? "View ticket"
        : null
    : registrationAvailable
      ? event.price > 0
        ? `Register · ₹${event.price}`
        : "Register free"
      : waitlistEligible
        ? waitlistEntry?.status === "offered" ? "Claim reserved seat" : "Join waitlist"
        : null;

  if (event.slug === "sustainx") {
    return (
      <SustainXEventStory
        event={event}
        canonicalUrl={canonicalUrl}
        schemaJson={safeJson(eventSchema)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <link rel="canonical" href={canonicalUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(eventSchema) }} />
      <Navbar mobileAlign="right" />

      <section data-testid="event-programme-hero" className="relative overflow-hidden bg-[#07121f] text-[#f4f2ed]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-10 pt-28 sm:px-8 sm:pb-12 lg:px-12 lg:pt-36">
          <motion.div {...revealUp(reduceMotion, 8)} className="flex items-center justify-between border-b border-white/15 pb-5">
            <Link to={backHref} className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55 transition hover:text-[#58c6ff]">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {backLabel}
            </Link>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/38">Programme / {formatYear(event.date)}</span>
          </motion.div>

          <header className="grid gap-10 py-10 md:grid-cols-12 md:items-end md:gap-8 md:py-14 lg:py-16">
            <div className="md:col-span-7 lg:col-span-8">
              {event.society ? (
                <motion.div {...revealUp(reduceMotion, 8)} transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.06 }}>
                  <Link to={`/societies/${event.society.slug}`} className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#58c6ff] transition hover:text-white">
                    {event.society.name}
                  </Link>
                </motion.div>
              ) : <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#58c6ff]">IEEE Sahrdaya</p>}
              <div className="mt-5 overflow-hidden pb-[0.09em]">
                <motion.h1
                  initial={reduceMotion ? false : { y: "108%", opacity: 0.25 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.62, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.08 }}
                  className={`max-w-5xl ${titleSize} font-semibold leading-[0.88] tracking-[-0.07em] text-[#f4f2ed]`}
                >
                  {event.title}
                </motion.h1>
              </div>
              <p className="mt-6 max-w-2xl text-sm leading-6 text-white/48 sm:text-base">
                {description || "Event details from the IEEE Sahrdaya programme."}
              </p>
            </div>

            <motion.div {...revealUp(reduceMotion, 12)} className="md:col-span-5 lg:col-span-4">
              <div className="relative aspect-[4/3] overflow-hidden border border-white/12 bg-black/20 md:aspect-[4/5]">
                {eventArtwork ? (
                  <EventArtworkPreview src={eventArtwork.src} alt={`${event.title} event artwork`} />
                ) : (
                  <EventBannerFallback
                    title={event.title}
                    societyName={event.society?.name}
                    societySlug={event.society?.slug}
                    showTitle={false}
                  />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.18em] text-white/35">
                <span>Event record / {formatYear(event.date)}</span>
                <span>{eventArtwork ? "Official artwork" : "Programme identity"}</span>
              </div>
            </motion.div>
          </header>

          <div className="grid border-y border-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Date", formatDate(event.date)],
              ["Time", formatEventTime(event.date, event.timeTbc)],
              ["Venue", event.attendanceMode === "online" ? "Online" : event.venue || "Sahrdaya College of Engineering & Technology"],
              ["Entry / status", `${event.price > 0 ? `₹${event.price}` : "Free"} · ${availability.label}`],
            ].map(([label, value], index) => (
              <div key={String(label)} className={`min-w-0 py-5 sm:px-5 ${index > 0 ? "sm:border-l sm:border-white/10" : ""} ${index > 1 ? "border-t border-white/10 lg:border-t-0" : index === 1 ? "border-t border-white/10 sm:border-t-0" : ""}`}>
                <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/32">{label}</p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-white/82">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-[1440px] px-5 pb-36 sm:px-8 lg:px-12 lg:pb-28">
        <div className="grid gap-14 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20 lg:py-20">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00629B]">About the event</p>
            {event.description ? (
              <section className="prose prose-slate mt-6 max-w-3xl prose-headings:font-semibold prose-headings:tracking-[-0.035em] prose-p:text-[1.05rem] prose-p:leading-8 prose-p:text-black/68 prose-a:text-[#00629B]" dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(event.description) }} />
            ) : (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-black/55">Full event details will be added here by the organising society.</p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a href={`/events/${event.slug}/calendar.ics`} className="group inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#00629B]">
                Add to calendar <CalendarPlus className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
              </a>
              {event.externalLink && (
                <a href={event.externalLink} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#00629B]">
                  Open event link <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              )}
            </div>
          </div>

          <aside className="h-fit border-t border-black/15 pt-6 lg:sticky lg:top-28">
            {myRegistrationLoading ? (
              <div className="py-8 text-sm font-semibold text-black/45">Checking your registration…</div>
            ) : myRegistration?.found ? (
              myRegistration.manualReview ? (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-700">Your registration</p>
                  <Clock3 className="mt-6 h-8 w-8 text-amber-600" />
                  <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">Payment under review</h2>
                  <p className="mt-3 text-sm leading-6 text-black/50">An organiser is reviewing the payment. Don&apos;t register or pay again.</p>
                </>
              ) : myRegistration.paymentRequired ? (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">Your registration</p>
                  <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Almost there.</h2>
                  <p className="mt-3 text-sm leading-6 text-black/50">Your details are saved. Payment is the only step left.</p>
                  <Link to={`/payment/${myRegistration.registrationId}`} className="group mt-7 hidden w-full items-center justify-between border-y border-[#00629B] py-4 font-bold text-[#00629B] lg:flex">
                    Continue payment <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </>
              ) : myRegistration.ticketId ? (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-700">Your registration</p>
                  <div className="mt-5 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> You&apos;re registered</div>
                  <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Your place is confirmed.</h2>
                  <Link to={`/ticket/${myRegistration.ticketId}`} className="group mt-7 hidden w-full items-center justify-between border-y border-[#00629B] py-4 font-bold text-[#00629B] lg:flex">
                    View ticket <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  {myRegistration.receiptAvailable && <button type="button" onClick={downloadReceipt} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-black/50 hover:text-[#00629B]"><ReceiptText className="h-4 w-4" /> Payment receipt</button>}
                </>
              ) : null
            ) : lifecycle.phase === "completed" ? (
              <>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Event status</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Completed.</h2>
                <p className="mt-4 text-sm leading-6 text-black/50">Held on {formatDate(event.date)} and preserved in the programme archive.</p>
              </>
            ) : lifecycle.phase === "cancelled" ? (
              <>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-700">Event status</p>
                <div className="mt-5 flex items-center gap-2 font-bold text-rose-700"><XCircle className="h-5 w-5" /> Event cancelled</div>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Registration</p>
                    <p className="mt-2 text-5xl font-semibold tracking-[-0.065em]">{event.price > 0 ? `₹${event.price}` : "Free"}</p>
                  </div>
                  <div className={`mb-1 flex items-center gap-2 text-xs font-semibold ${availabilityClass[availability.kind]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{availability.label}</div>
                </div>
                {registrationAvailable ? (
                  event.externalFormUrl ? (
                    <a href={registerUrl} target="_blank" rel="noopener noreferrer" className="group mt-7 hidden w-full items-center justify-between border-y border-[#00629B] py-4 font-bold text-[#00629B] lg:flex">Register externally <ExternalLink className="h-4 w-4" /></a>
                  ) : (
                    <Link to={registerUrl} className="group mt-7 hidden w-full items-center justify-between border-y border-[#00629B] py-4 text-lg font-bold text-[#00629B] lg:flex">Reserve your place <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></Link>
                  )
                ) : waitlistEligible ? (
                  authStatus === "authenticated" && waitlistLoading ? (
                    <div className="mt-7 border-y border-black/12 py-4 text-sm font-semibold text-black/40">Checking waitlist…</div>
                  ) : waitlistEntry?.status === "offered" ? (
                    <div className="mt-7 border-y border-emerald-600/30 py-4">
                      <p className="text-sm font-bold text-emerald-800">A seat is reserved for you.</p>
                      {waitlistEntry.offerExpiresAt && <p className="mt-1 text-xs text-emerald-800/70">Complete registration before the offer expires.</p>}
                      <Link to={registerUrl} className="group mt-4 flex items-center justify-between font-bold text-[#00629B]">Claim reserved seat <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                    </div>
                  ) : waitlistEntry?.status === "waiting" ? (
                    <div className="mt-7 border-y border-[#00629B]/25 py-4">
                      <p className="text-sm font-bold text-[#00629B]">You’re on the waitlist{waitlistEntry.position > 0 ? ` · position ${waitlistEntry.position}` : ""}.</p>
                      <p className="mt-1 text-xs leading-5 text-black/45">When a place opens, it is temporarily reserved before the next person is considered.</p>
                      <button type="button" disabled={waitlistBusy} onClick={() => void leaveWaitlist()} className="mt-3 min-h-10 text-xs font-bold text-black/40 transition hover:text-rose-700 disabled:opacity-40">{waitlistBusy ? "Updating…" : "Leave waitlist"}</button>
                    </div>
                  ) : authStatus === "authenticated" ? (
                    <div className="mt-7 border-y border-black/12 py-4">
                      <p className="text-sm font-bold text-black/55">All seats are reserved.</p>
                      <p className="mt-1 text-xs leading-5 text-black/42">{audienceRestricted ? "Confirm your programme and semester before joining this restricted waitlist." : "Join the waitlist and a released seat will be held for you before anyone else can register into it."}</p>
                      {audienceRestricted ? <Link to={registerUrl} className="group mt-4 flex w-full items-center justify-between font-bold text-[#00629B]">Continue to waitlist <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link> : <button type="button" disabled={waitlistBusy} onClick={() => void joinWaitlist()} className="group mt-4 flex w-full items-center justify-between font-bold text-[#00629B] disabled:opacity-40">{waitlistBusy ? "Joining…" : "Join waitlist"}{!waitlistBusy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}</button>}
                    </div>
                  ) : (
                    <Link to={registerUrl} className="group mt-7 flex w-full items-center justify-between border-y border-[#00629B] py-4 font-bold text-[#00629B]">Sign in to join waitlist <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                  )
                ) : <div className="mt-7 border-y border-black/12 py-4 text-sm font-bold text-black/40">{unavailableRegistrationLabel}</div>}
                <p className="mt-5 text-xs leading-5 text-black/40">{waitlistEligible ? "Waitlist offers reserve capacity for one attendee at a time." : event.price > 0 ? "Your place is confirmed only after payment is captured." : "Free registration creates your ticket immediately."}</p>
              </>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section data-testid="related-events" className="border-t border-black/12 pb-6 pt-8 sm:pt-10">
            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Continue through the programme</p>
                <h2 className="mt-3 text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">More from the programme.</h2>
              </div>
              <div className="lg:col-span-5 lg:text-right">
                <Link to="/events" className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-black/55 transition hover:text-[#00629B]">
                  Browse full programme <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
            <div className="mt-7">{related.map((item) => <RelatedEventCard key={item.id} event={item} />)}</div>
          </section>
        )}
      </article>

      {actionHref && actionLabel && !myRegistration?.manualReview && (
        <motion.div
          initial={reduceMotion ? false : { y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE }}
          className={`fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-[#f4f2ed]/95 px-5 backdrop-blur-xl lg:hidden ${compactMobileAction ? "py-2" : "py-3"}`}
        >
          <div className="mx-auto flex max-w-lg items-center gap-4">
            <AnimatePresence initial={false}>
              {!myRegistration?.found && !compactMobileAction && (
                <motion.div key="entry" initial={reduceMotion ? false : { opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">Entry</p><p className="text-lg font-semibold">{event.price > 0 ? `₹${event.price}` : "Free"}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {event.externalFormUrl && !myRegistration?.found ? (
              <a href={actionHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white">{actionLabel}<ExternalLink className="h-4 w-4" /></a>
            ) : (
              <Link to={actionHref} className="flex flex-1 items-center justify-center gap-2 bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white">{actionLabel}<ArrowRight className="h-4 w-4" /></Link>
            )}
          </div>
        </motion.div>
      )}
      <Footer />
    </main>
  );
}
