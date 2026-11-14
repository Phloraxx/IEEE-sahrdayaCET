import { isPastEvent } from "@/lib/event-lifecycle";
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
import { formatAppDateISO, formatDate, formatDay, formatEventTime, formatMonth, formatWeekdayShort, formatYear } from "@/lib/dates";
import { eventTitleSize, MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import type { EventAvailabilityKind } from "@/lib/event-availability";
import { getEventLifecycleSnapshot } from "@/lib/event-lifecycle-snapshot";
import { programmeLabel } from "@/lib/academic-options";
import { memberPrice } from "@/lib/event-requirements";
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
  type SerializableEvent,
} from "@/server/public/events.server";

type EventDetailData = { event: SerializableEvent };

export async function loader({
  params,
}: LoaderFunctionArgs): Promise<EventDetailData> {
  if (!params.slug) throw new Response("Event not found", { status: 404 });
  const event = await fetchEventBySlug(params.slug);
  if (!event) throw new Response("Event not found", { status: 404 });
  return { event };
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

export default function EventDetailPage() {
  const { event } = useLoaderData<typeof loader>();
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
    void downloadRegistrationReceipt(myRegistration.registrationId).catch(() => toast.error("Receipt could not be downloaded. Please try again."));
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
  const stampInitials =
    event.title
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "E";
  const lifecycle = getEventLifecycleSnapshot(event);
  const attendanceMode = event.attendanceMode;
  const registrationAvailable = lifecycle.registration.available;
  const availability = lifecycle.registration;
  const waitlistEligible = event.waitlistEnabled && lifecycle.registration.mode === "internal" && availability.kind === "full";
  const audienceRestricted = (event.eligibleSemesters?.length || 0) > 0 || (event.eligibleProgrammes?.length || 0) > 0;
  const requirements = event.requirements ?? [];
  const attendeeNote = event.attendeeNote?.trim() || "";
  const memberDiscountPercent = Number(event.ieeeMemberDiscountPercent || 0);
  const ieeeMemberPrice = memberDiscountPercent > 0 ? memberPrice(event.price, memberDiscountPercent) : null;
  const eligibleProgrammeLabels = (event.eligibleProgrammes ?? []).map((code) => programmeLabel(code) || code);
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
  const eventEnded = isPastEvent(event);
  const unavailableRegistrationLabel =
    eventEnded ? "Event completed" : availability.kind === "opening-soon"
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
      <Navbar />

      <section data-testid="event-programme-hero" className="relative overflow-hidden bg-[#f4f2ed] text-[#111315]">
        <div className="relative mx-auto max-w-[1180px] px-5 pb-6 pt-16 sm:px-8 sm:pb-8 sm:pt-20 md:pt-24 lg:pt-28">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={backHref} className="group inline-flex min-h-11 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black/45 transition hover:text-[#00629B]">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {backLabel}
            </Link>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black/40">Programme / {formatYear(event.date)}</span>
          </div>

          <div className="mt-7 overflow-hidden rounded-[28px] bg-[#fffaf0] shadow-[0_34px_70px_-38px_rgba(6,17,29,0.5)] ring-1 ring-black/[0.06]">
            <div className="p-6 sm:p-9">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  {event.society ? (
                    <Link to={`/societies/${event.society.slug}`} className="inline-flex min-h-6 items-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B] transition hover:text-[#111315]">
                      {event.society.name}
                    </Link>
                  ) : (
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">IEEE Sahrdaya</p>
                  )}
                  <h1 className={`mt-3 max-w-3xl ${titleSize} break-words font-semibold leading-[0.9] tracking-[-0.06em] text-[#111315]`}>
                    {event.title}
                  </h1>
                </div>

                <div className="hidden shrink-0 rounded-[10px] bg-white p-1 shadow-[0_8px_20px_-10px_rgba(6,17,29,0.45)] ring-1 ring-black/[0.06] sm:block">
                  <div className="relative grid h-20 w-16 place-items-center overflow-hidden rounded-[6px] bg-[#0b2239]">
                    {eventArtwork ? (
                      <EventArtworkPreview src={eventArtwork.src} alt="" />
                    ) : (
                      <span aria-hidden="true" className="font-pixel text-[13px] leading-none text-white/85">{stampInitials}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[auto_12rem_minmax(0,1fr)] sm:items-end">
                <div>
                  <span className="block font-mono text-5xl font-semibold leading-none tracking-[-0.08em] tabular-nums text-[#111315]">{formatDay(event.date)}</span>
                  <span className="mt-1.5 block font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-black/45">{formatMonth(event.date)} · {formatWeekdayShort(event.date)}</span>
                </div>
                <div className="sm:border-l sm:border-black/10 sm:pl-6">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-black/40">Time</p>
                  <p className="mt-1.5 text-sm font-semibold leading-6 text-[#111315]">{formatEventTime(event.date, event.timeTbc)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1 sm:border-l sm:border-black/10 sm:pl-6">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-black/40">Venue</p>
                  <p className="mt-1.5 text-sm font-semibold leading-6 text-[#111315]">{event.attendanceMode === "online" ? "Online" : event.venue || "Sahrdaya College of Engineering & Technology"}</p>
                </div>
              </div>
            </div>

            <div className="relative flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-dashed border-black/20 px-6 py-4 sm:px-9">
              <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#f4f2ed] shadow-[inset_0_2px_6px_rgba(6,17,29,0.3)]" />
              <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[#f4f2ed] shadow-[inset_0_2px_6px_rgba(6,17,29,0.3)]" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-black/40">Admit one</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-black/45">
                {event.price > 0 ? `₹${event.price}` : "Free"} · {eventEnded ? "Event completed" : availability.label}
              </span>
              <div aria-hidden="true" className="flex h-7 items-end gap-[1.5px]">
                {[2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 1].map((width, index) => (
                  <span key={index} style={{ width }} className="h-full bg-[#1b1a17]/70" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-[1440px] px-5 pb-36 sm:px-8 lg:px-12 lg:pb-28">
        <div className="grid gap-14 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20 lg:py-20">
          <div className="min-w-0">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00629B]">About the event</h2>
            {event.description ? (
              <section className="prose prose-slate mt-6 max-w-3xl prose-headings:font-semibold prose-headings:tracking-[-0.035em] prose-p:text-[1.05rem] prose-p:leading-8 prose-p:text-black/68 prose-a:text-[#00629B]" dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(event.description) }} />
            ) : (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-black/55">Full event details will be added here by the organising society.</p>
            )}

            {(audienceRestricted || requirements.length > 0 || attendeeNote || ieeeMemberPrice !== null) && (
              <section data-testid="event-attendee-guidance" className="mt-10 rounded-[24px] bg-[#fbf9f4] px-5 py-7 ring-1 ring-black/[0.05] sm:px-7">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Plan your attendance</p>
                <div className="mt-6 grid gap-8 md:grid-cols-2">
                  {audienceRestricted && <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">Who can attend</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Eligibility</h2><div className="mt-4 space-y-2 text-sm leading-6 text-black/58">{(event.eligibleSemesters?.length || 0) > 0 && <p><span className="font-semibold text-black/75">Semesters:</span> {event.eligibleSemesters?.join(", ")}</p>}{eligibleProgrammeLabels.length > 0 && <p><span className="font-semibold text-black/75">Programmes:</span> {eligibleProgrammeLabels.join(", ")}</p>}</div></div>}
                  {ieeeMemberPrice !== null && <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">IEEE member price</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">₹{ieeeMemberPrice}</h2><p className="mt-3 text-sm leading-6 text-black/55">IEEE members receive {memberDiscountPercent}% off the regular ₹{event.price} fee after providing a Membership ID. Coupons and member pricing do not stack; the better price is used.</p></div>}
                  {(requirements.length > 0 || attendeeNote) && <div className="md:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">Before you attend</p>{requirements.length > 0 && <ol className="mt-4 grid gap-3 sm:grid-cols-2">{requirements.map((item, index) => <li key={`${index}-${item}`} className="flex gap-3 text-sm leading-6 text-black/62"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-black/15 text-[9px] font-bold text-black/45">{index + 1}</span><span>{item}</span></li>)}</ol>}{attendeeNote && <p className="mt-5 border-l-2 border-[#00629B] pl-4 text-sm leading-6 text-black/58">{attendeeNote}</p>}</div>}
                </div>
              </section>
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

          <aside className="h-fit rounded-[24px] bg-[#fbf9f4] p-5 ring-1 ring-black/[0.05] sm:p-6 lg:sticky lg:top-28">
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
                  <Link to={`/payment/${myRegistration.registrationId}`} className="mt-7 hidden w-full items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] lg:flex">
                    Continue payment <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </>
              ) : myRegistration.ticketId ? (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-700">Your registration</p>
                  <div className="mt-5 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> You&apos;re registered</div>
                  <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Your place is confirmed.</h2>
                  <Link to={`/ticket/${myRegistration.ticketId}`} className="mt-7 hidden w-full items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] lg:flex">
                    View ticket <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  {myRegistration.receiptAvailable && <button type="button" onClick={downloadReceipt} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-black/50 hover:text-[#00629B]"><ReceiptText className="h-4 w-4" /> Payment receipt</button>}
                </>
              ) : null
            ) : eventEnded ? (
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
                    <a href={registerUrl} target="_blank" rel="noopener noreferrer" className="mt-7 hidden w-full items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] lg:flex">Register externally <ExternalLink className="h-4 w-4" /></a>
                  ) : (
                    <Link to={registerUrl} className="mt-7 hidden w-full items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-4 text-base font-bold text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] lg:flex">Reserve your place <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></Link>
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

      </article>

      {actionHref && actionLabel && !myRegistration?.manualReview && (
        <motion.div
          initial={false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE }}
          className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-50 border-t border-black/10 bg-[#f4f2ed]/95 pl-[calc(1.25rem+env(safe-area-inset-left,0px))] pr-[calc(1.25rem+env(safe-area-inset-right,0px))] backdrop-blur-xl md:bottom-0 lg:hidden ${compactMobileAction ? "py-2" : "py-3"}`}
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
              <a href={actionHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white">{actionLabel}<ExternalLink className="h-4 w-4" /></a>
            ) : (
              <Link to={actionHref} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#00629B] px-5 py-3.5 text-sm font-bold text-white">{actionLabel}<ArrowRight className="h-4 w-4" /></Link>
            )}
          </div>
        </motion.div>
      )}
      <Footer mobileActionClearance />
    </main>
  );
}
