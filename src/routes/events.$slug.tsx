import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Clock3,
  ReceiptText,
  MapPin,
  Users,
  XCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import { getMyEventRegistration } from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import type { MyEventRegistration } from "@/lib/registration-state";
import Footer from "@/components/Footer";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText, sanitizeBlogHtml } from "@/lib/blog-content";
import { formatDate, formatTime } from "@/lib/dates";
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
  const eventArtwork = resolveEventArtwork(event);
  const eventImageUrl = resolveEventImage(event);
  const lifecycle = getEventLifecycle(event.status);
  const attendanceKind = getEventAttendanceKind(event.venue);
  const hasCapacity =
    !event.maxCapacity || event.registeredCount < event.maxCapacity;
  const registrationAvailable =
    lifecycle === "scheduled" && event.registrationOpen && hasCapacity;
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

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-slate-800">
      <link rel="canonical" href={canonicalUrl} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(eventSchema) }}
      />
      <Navbar />

      <article className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <Link
          to={backHref}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-ieee-blue hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>

        <div className="mb-8 aspect-[16/8] overflow-hidden rounded-[2rem] bg-slate-200 shadow-sm">
          {eventArtwork ? (
            <img
              src={eventArtwork.src}
              alt={event.title}
              className={`h-full w-full ${
                eventArtwork.fit === "contain"
                  ? "object-contain p-6"
                  : "object-cover"
              }`}
            />
          ) : (
            <EventBannerFallback
              title={event.title}
              societyName={event.society?.name}
              societySlug={event.society?.slug}
            />
          )}
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div>
            {event.society && (
              <Link
                to={`/societies/${event.society.slug}`}
                className="text-xs font-extrabold uppercase tracking-[0.18em] text-ieee-blue hover:underline"
              >
                {event.society.name}
              </Link>
            )}
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              {event.title}
            </h1>

            <div className="mt-8 grid gap-4 border-y border-slate-200 py-6 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-ieee-blue" />
                <div>
                  <p className="font-bold">{formatDate(event.date)}</p>
                  <p className="text-sm text-slate-500">
                    {formatTime(event.date)}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                {attendanceKind === "online" ? (
                  <Globe2 className="mt-0.5 h-5 w-5 text-ieee-blue" />
                ) : (
                  <MapPin className="mt-0.5 h-5 w-5 text-ieee-blue" />
                )}
                <div>
                  <p className="font-bold">
                    {event.venue ||
                      "Sahrdaya College of Engineering & Technology"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {attendanceKind === "online"
                      ? "Online session"
                      : attendanceKind === "hybrid"
                        ? "Hybrid event"
                        : "Event venue"}
                  </p>
                </div>
              </div>
            </div>

            {event.description && (
              <section
                className="prose prose-slate mt-10 max-w-none"
                dangerouslySetInnerHTML={{
                  __html: sanitizeBlogHtml(event.description),
                }}
              />
            )}
          </div>

          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
            {myRegistrationLoading ? (
              <div className="py-8 text-center text-sm font-semibold text-slate-500">Checking your registration…</div>
            ) : myRegistration?.found ? (
              myRegistration.manualReview ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-600">Your registration</p>
                  <Clock3 className="mt-5 h-9 w-9 text-amber-500" />
                  <p className="mt-3 text-2xl font-black text-slate-900">Payment under review</p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">An organizer needs to review your payment before a ticket can be issued. Please don&apos;t register or pay again.</p>
                </>
              ) : myRegistration.paymentRequired ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-ieee-blue">Your registration</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">Payment pending</p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">Your details are saved. Continue the existing payment to confirm your place.</p>
                  <Link to={`/payment/${myRegistration.registrationId}`} className="mt-6 flex w-full items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white">Continue payment</Link>
                </>
              ) : myRegistration.ticketId ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Your registration</p>
                  <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> You&apos;re registered</div>
                  <p className="mt-4 text-sm leading-6 text-slate-500">{myRegistration.eventEnded ? "This event has ended, but your ticket remains available." : "Your place is confirmed and your ticket is ready."}</p>
                  <Link to={`/ticket/${myRegistration.ticketId}`} className="mt-6 flex w-full items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white">View your ticket</Link>
                  {myRegistration.receiptAvailable && <button type="button" onClick={downloadReceipt} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 hover:border-ieee-blue hover:text-ieee-blue"><ReceiptText className="h-4 w-4" />Payment receipt</button>}
                </>
              ) : null
            ) : lifecycle === "completed" ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">Event status</p>
                <p className="mt-2 text-3xl font-black text-slate-900">Completed</p>
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Activity concluded</div>
                <p className="mt-5 text-sm leading-relaxed text-slate-500">This activity was held on {formatDate(event.date)}. Its report and outcomes are preserved here as part of the public archive.</p>
                <Link to={backHref} className="mt-6 flex w-full items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 hover:border-ieee-blue hover:text-ieee-blue">{backLabel}</Link>
              </>
            ) : lifecycle === "cancelled" ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">Event status</p>
                <p className="mt-2 text-3xl font-black text-slate-900">Cancelled</p>
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-800"><XCircle className="h-5 w-5" /> Event cancelled</div>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">Registration</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{event.price > 0 ? `₹${event.price}` : "Free"}</p>
                {event.maxCapacity > 0 && <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Users className="h-4 w-4" /> {event.registeredCount} / {event.maxCapacity} seats reserved</div>}
                {registrationAvailable ? (
                  event.externalFormUrl ? (
                    <a href={registerUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white hover:opacity-90">Register <ExternalLink className="h-4 w-4" /></a>
                  ) : (
                    <Link to={registerUrl} className="mt-6 flex w-full items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white hover:opacity-90">Register now</Link>
                  )
                ) : <div className="mt-6 rounded-2xl bg-slate-100 px-5 py-3 text-center font-bold text-slate-500">Registration closed</div>}
              </>
            )}
          </aside>
        </div>
      </article>
      <Footer />
    </main>
  );
}
