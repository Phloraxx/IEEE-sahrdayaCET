import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText, sanitizeBlogHtml } from "@/lib/blog-content";
import { formatDate, formatTime } from "@/lib/dates";
import { fetchEventBySlug, type SerializableEvent } from "@/server/public/events.server";

export async function loader({ params }: LoaderFunctionArgs): Promise<SerializableEvent> {
  if (!params.slug) throw new Response("Event not found", { status: 404 });
  const event = await fetchEventBySlug(params.slug);
  if (!event) throw new Response("Event not found", { status: 404 });
  return event;
}

export const meta = ({ data }: { data?: SerializableEvent }) => {
  if (!data) return [{ title: "Event not found | IEEE Sahrdaya" }, { name: "robots", content: "noindex" }];
  const description = blogHtmlToPlainText(data.description).slice(0, 160) ||
    `${data.title} at IEEE Sahrdaya Student Branch.`;
  const url = `${APP_URL}/events/${data.slug}`;
  return [
    { title: `${data.title} | IEEE Sahrdaya` },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: data.title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: data.bannerUrl || `${APP_URL}/web.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: data.title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: data.bannerUrl || `${APP_URL}/web.png` },
  ];
};

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export default function EventDetailPage() {
  const event = useLoaderData<typeof loader>();
  const canonicalUrl = `${APP_URL}/events/${event.slug}`;
  const registerUrl = event.externalFormUrl || `/register/${event.id}`;
  const description = blogHtmlToPlainText(event.description);
  const hasCapacity = !event.maxCapacity || event.registeredCount < event.maxCapacity;
  const registrationAvailable = event.registrationOpen && hasCapacity;
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.date,
    ...(event.endDate ? { endDate: event.endDate } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: description || undefined,
    image: event.bannerUrl ? [event.bannerUrl] : [`${APP_URL}/web.png`],
    url: canonicalUrl,
    location: {
      "@type": "Place",
      name: event.venue || "Sahrdaya College of Engineering & Technology",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Sahrdaya College of Engineering & Technology",
        addressLocality: "Kodakara",
        addressRegion: "Kerala",
        postalCode: "680684",
        addressCountry: "IN",
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.society?.name || "IEEE Sahrdaya Student Branch",
      url: event.society?.slug ? `${APP_URL}/societies/${event.society.slug}` : APP_URL,
    },
    offers: {
      "@type": "Offer",
      url: event.externalFormUrl || `${APP_URL}/register/${event.id}`,
      price: event.price,
      priceCurrency: "INR",
      availability: registrationAvailable
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
    },
  };

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-slate-800">
      <link rel="canonical" href={canonicalUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(eventSchema) }} />
      <Navbar />

      <article className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <Link to="/events" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-ieee-blue hover:underline">
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>

        <div className="mb-8 aspect-[16/8] overflow-hidden rounded-[2rem] bg-slate-200 shadow-sm">
          {event.bannerUrl ? (
            <img src={event.bannerUrl} alt={event.title} className="h-full w-full object-cover" />
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
              <Link to={`/societies/${event.society.slug}`} className="text-xs font-extrabold uppercase tracking-[0.18em] text-ieee-blue hover:underline">
                {event.society.name}
              </Link>
            )}
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">{event.title}</h1>

            <div className="mt-8 grid gap-4 border-y border-slate-200 py-6 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-ieee-blue" />
                <div><p className="font-bold">{formatDate(event.date)}</p><p className="text-sm text-slate-500">{formatTime(event.date)}</p></div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-ieee-blue" />
                <div><p className="font-bold">{event.venue || "Sahrdaya College of Engineering & Technology"}</p><p className="text-sm text-slate-500">Kodakara, Thrissur</p></div>
              </div>
            </div>

            {event.description && (
              <section className="prose prose-slate mt-10 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(event.description) }} />
            )}
          </div>

          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Registration</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{event.price > 0 ? `₹${event.price}` : "Free"}</p>
            {event.maxCapacity > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Users className="h-4 w-4" /> {event.registeredCount} / {event.maxCapacity} seats reserved
              </div>
            )}
            {registrationAvailable ? (
              event.externalFormUrl ? (
                <a href={registerUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white hover:opacity-90">
                  Register <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <Link to={registerUrl} className="mt-6 flex w-full items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3 font-bold text-white hover:opacity-90">Register now</Link>
              )
            ) : (
              <div className="mt-6 rounded-2xl bg-slate-100 px-5 py-3 text-center font-bold text-slate-500">Registration closed</div>
            )}
          </aside>
        </div>
      </article>
      <Footer />
    </main>
  );
}
