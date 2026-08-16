import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Clock3,
  ReceiptText,
  MapPin,
  XCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { EventArtworkPreview } from "@/components/events/EventArtworkPreview";
import { useAuth } from "@/lib/auth-context";
import { getMyEventRegistration } from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import type { MyEventRegistration } from "@/lib/registration-state";
import Footer from "@/components/Footer";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText, sanitizeBlogHtml } from "@/lib/blog-content";
import { formatDate, formatTime } from "@/lib/dates";
import { eventTitleSize, MOTION_DURATION, MOTION_EASE, revealUp } from "@/lib/motion";
import { getEventAvailability, type EventAvailabilityKind } from "@/lib/event-availability";
import {
  getEventSocietySlug,
  resolveEventArtwork,
  resolveEventSocialImagePath,
} from "@/lib/event-artwork";
import {
  getEventAttendanceKind,
  getEventLifecycle,
  getSchemaAttendanceMode,
  getSchemaEventStatus,
} from "@/lib/event-presentation";
import {
  fetchEventBySlug,
  type SerializableEvent,
} from "@/server/public/events.server";

export async function loader({
  params,
}: LoaderFunctionArgs): Promise<SerializableEvent> {
  if (!params.slug) throw new Response("Event not found", { status: 404 });
  const event = await fetchEventBySlug(params.slug);
  if (!event) throw new Response("Event not found", { status: 404 });
  return event;
}

function resolveEventImage(event: SerializableEvent): string {
  const imagePath = resolveEventSocialImagePath(event);
  return imagePath.startsWith("http") ? imagePath : `${APP_URL}${imagePath}`;
}

export const meta = ({ data }: { data?: SerializableEvent }) => {
  if (!data)
    return [
      { title: "Event not found | IEEE Sahrdaya" },
      { name: "robots", content: "noindex" },
    ];

  const description =
    blogHtmlToPlainText(data.description).slice(0, 160) ||
    `${data.title} at IEEE Sahrdaya Student Branch.`;
  const url = `${APP_URL}/events/${data.slug}`;
  const image = resolveEventImage(data);

  return [
    { title: `${data.title} | IEEE Sahrdaya` },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: data.title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: data.title },
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
  const atSahrdaya = /sahrdaya|kodakara/i.test(venue);
  return {
    "@type": "Place",
    name: venue,
    ...(atSahrdaya
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
  const event = useLoaderData<typeof loader>();
  const { user, status: authStatus } = useAuth();
  const [myRegistration, setMyRegistration] = useState<MyEventRegistration | null>(null);
  const [myRegistrationLoading, setMyRegistrationLoading] = useState(false);
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

  const downloadReceipt = () => {
    if (!myRegistration?.registrationId) return;
    void downloadRegistrationReceipt(myRegistration.registrationId).catch(() => undefined);
  };
  const canonicalUrl = `${APP_URL}/events/${event.slug}`;
  const isWieEvent = getEventSocietySlug(event) === "wie";
  const backHref = isWieEvent ? "/societies/wie#activities" : "/events";
  const backLabel = isWieEvent ? "Back to WIE activities" : "All events";
  const registerUrl = event.externalFormUrl || `/register/${event.id}`;
  const description = blogHtmlToPlainText(event.description);
  const eventImageUrl = resolveEventImage(event);
  const eventArtwork = resolveEventArtwork(event);
  const titleSize = eventTitleSize(event.title);
  const lifecycle = getEventLifecycle(event.status);
  const attendanceKind = getEventAttendanceKind(event.venue);
  const hasCapacity =
    !event.maxCapacity || event.registeredCount < event.maxCapacity;
  const registrationAvailable =
    lifecycle === "scheduled" && event.registrationOpen && hasCapacity;
  const availability = getEventAvailability({
    status: event.status,
    date: event.date,
    endDate: event.endDate,
    registrationOpen: event.registrationOpen,
    registrationMode: event.registrationMode,
    registrationStart: event.registrationStart,
    registrationDeadline: event.registrationDeadline,
    maxCapacity: event.maxCapacity,
    registeredCount: event.registeredCount,
  });
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
    url: event.externalLink || event.externalFormUrl || canonicalUrl,
  };
  const location =
    attendanceKind === "online"
      ? virtualLocation
      : attendanceKind === "hybrid"
        ? [physicalLocation(event), virtualLocation]
        : physicalLocation(event);
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: toSchemaDate(event.date),
    ...(event.endDate ? { endDate: toSchemaDate(event.endDate) } : {}),
    eventStatus: getSchemaEventStatus(event.status),
    eventAttendanceMode: getSchemaAttendanceMode(event.venue),
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
      : null;

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <link rel="canonical" href={canonicalUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(eventSchema) }} />
      <Navbar mobileAlign="right" />

      <article className="mx-auto max-w-[1440px] px-5 pb-36 pt-28 sm:px-8 lg:px-12 lg:pb-28 lg:pt-36">
        <motion.div {...revealUp(reduceMotion, 8)} className="flex items-center justify-between border-b border-black/12 pb-5">
          <Link to={backHref} className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-black/45 transition hover:text-[#00629B]">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {backLabel}
          </Link>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-black/30">Event / {new Date(event.date).getFullYear()}</span>
        </motion.div>

        <header className="grid gap-10 border-b border-black/12 py-10 md:grid-cols-12 md:gap-8 md:py-16 lg:py-20">
          <div className="md:col-span-8 lg:col-span-9">
            {event.society && (
              <motion.div {...revealUp(reduceMotion, 8)} transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.06 }}>
                <Link to={`/societies/${event.society.slug}`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00629B] hover:underline">
                  {event.society.name}
                </Link>
              </motion.div>
            )}
            <div className="mt-4 overflow-hidden pb-[0.08em]">
              <motion.h1
                initial={reduceMotion ? false : { y: "108%", opacity: 0.25 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.62, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.08 }}
                className={`max-w-6xl ${titleSize} font-semibold leading-[0.88] tracking-[-0.07em] text-[#111315]`}
              >
                {event.title}
              </motion.h1>
            </div>
          </div>

          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={{ show: { transition: { staggerChildren: reduceMotion ? 0 : 0.07, delayChildren: reduceMotion ? 0 : 0.18 } } }}
            className="grid grid-cols-2 gap-x-6 gap-y-7 border-t border-black/12 pt-6 md:col-span-4 md:grid-cols-1 md:border-l md:border-t-0 md:pl-7 md:pt-1 lg:col-span-3"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE } } }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">When</p>
              <p className="mt-2 text-base font-semibold leading-tight">{formatDate(event.date)}</p>
              <p className="mt-1 text-sm text-black/45">{formatTime(event.date)}</p>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE } } }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Where</p>
              <p className="mt-2 text-sm font-semibold leading-snug">{event.venue || "Sahrdaya College of Engineering & Technology"}</p>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE } } }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Entry</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{event.price > 0 ? `₹${event.price}` : "Free"}</p>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.ui, ease: MOTION_EASE } } }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Availability</p>
              <p className={`mt-2 text-sm font-semibold ${availabilityClass[availability.kind]}`}>{availability.label}</p>
            </motion.div>
          </motion.div>
        </header>

        {eventArtwork && (
          <motion.div {...revealUp(reduceMotion, 12)} className="border-b border-black/12 py-8 md:py-12">
            <EventArtworkPreview
              src={eventArtwork.src}
              alt={`${event.title} event artwork`}
              mode="bounded"
            />
          </motion.div>
        )}

        <div className="grid gap-14 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20 lg:py-20">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00629B]">About the event</p>
            {event.description ? (
              <section className="prose prose-slate mt-6 max-w-3xl prose-headings:font-semibold prose-headings:tracking-[-0.035em] prose-p:text-[1.05rem] prose-p:leading-8 prose-p:text-black/68 prose-a:text-[#00629B]" dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(event.description) }} />
            ) : (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-black/55">Full event details will be added here by the organising society.</p>
            )}

            <div className="mt-14 grid gap-8 border-y border-black/12 py-8 sm:grid-cols-2">
              <div>
                <CalendarDays className="h-5 w-5 text-[#00629B]" />
                <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Date & time</p>
                <p className="mt-2 font-semibold">{formatDate(event.date)} · {formatTime(event.date)}</p>
              </div>
              <div>
                {attendanceKind === "online" ? <Globe2 className="h-5 w-5 text-[#00629B]" /> : <MapPin className="h-5 w-5 text-[#00629B]" />}
                <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Location</p>
                <p className="mt-2 font-semibold leading-snug">{event.venue || "Sahrdaya College of Engineering & Technology"}</p>
              </div>
            </div>

            {event.externalLink && (
              <a href={event.externalLink} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#00629B]">
                Open event link <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            )}
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
            ) : lifecycle === "completed" ? (
              <>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Event status</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Completed.</h2>
                <p className="mt-4 text-sm leading-6 text-black/50">Held on {formatDate(event.date)} and preserved in the programme archive.</p>
              </>
            ) : lifecycle === "cancelled" ? (
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
                ) : <div className="mt-7 border-y border-black/12 py-4 text-sm font-bold text-black/40">{unavailableRegistrationLabel}</div>}
                <p className="mt-5 text-xs leading-5 text-black/40">{event.price > 0 ? "Your place is confirmed only after payment is captured." : "Free registration creates your ticket immediately."}</p>
              </>
            )}
          </aside>
        </div>
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
