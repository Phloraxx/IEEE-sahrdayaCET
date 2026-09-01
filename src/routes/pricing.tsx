import { ArrowLeft, ArrowUpRight, CalendarDays, IndianRupee } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CanonicalLink } from "@/components/CanonicalLink";
import { APP_URL } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { fetchEvents, type SerializableEvent } from "@/server/public/events.server";

const title = "Event Pricing & Catalog";
const path = "/pricing";
const description = "Current IEEE Sahrdaya event catalog with registration pricing and links to event details.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

export async function loader() {
  const events = await fetchEvents();
  return {
    current: events.filter((event) => event.status === "published"),
    past: events.filter((event) => event.status === "completed").slice(-12).reverse(),
  };
}
function EventPriceCard({ event }: { event: SerializableEvent }) {
  const price = event.price > 0 ? `₹${event.price.toLocaleString("en-IN")}` : "Free";
  return (
    <Link to={`/events/${event.slug}`} className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-ieee-blue/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-950 group-hover:text-ieee-blue">{event.title}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-gray-500"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.date) || "Date to be announced"}</p>
          {event.society?.name && <p className="mt-1 text-xs text-gray-500">{event.society.name}</p>}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:text-ieee-blue" />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Registration fee</span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-950">{event.price > 0 && <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />}{event.price > 0 ? event.price.toLocaleString("en-IN") : price}</span>
      </div>
    </Link>
  );
}
export default function PricingPage() {
  const { current, past } = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path={path} />
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-32 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-ieee-blue">
            <ArrowLeft className="h-4 w-4" /> Back to IEEE Sahrdaya
          </Link>
          <header className="mt-8 max-w-4xl border-b border-gray-200 pb-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ieee-blue">Pricing & catalog listings</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-5xl">Event Pricing & Catalog</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
              IEEE Sahrdaya sells event-registration and participation services, not physical merchandise. Each listing shows the registration fee recorded for that event; the event detail page shows the final registration flow before payment.
            </p>
          </header>
          <section className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">Current catalog</p><h2 className="mt-2 text-2xl font-semibold text-gray-950">Published events</h2></div>
              <Link to="/events" className="text-sm font-semibold text-ieee-blue hover:underline">Browse all events</Link>
            </div>
            {current.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {current.map((event) => <EventPriceCard key={event.id} event={event} />)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-600">
                No event is currently published for registration. New listings and their prices will appear here when announced.
              </div>
            )}
          </section>
          {past.length > 0 && (
            <section className="mt-12 border-t border-gray-200 pt-10">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Recent catalog history</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-950">Completed events</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {past.map((event) => <EventPriceCard key={event.id} event={event} />)}
              </div>
            </section>
          )}
          <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600">
            <h2 className="text-lg font-semibold text-gray-950">Pricing notes</h2>
            <p className="mt-2">Prices are shown in Indian Rupees (INR). A listing marked “Free” has no registration fee. Where a coupon or approved discount applies, the payable amount is calculated before payment confirmation.</p>
            <p className="mt-2">For delivery and refund information, see the Shipping & Delivery Policy and Refund & Cancellation Policy linked in the footer.</p>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
