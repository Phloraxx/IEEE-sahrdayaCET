import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  ReceiptText,
  Ticket,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";
import { listMyEvents, type MyEventItem } from "@/lib/data/my-events.client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import { formatDate, formatEventTime } from "@/lib/dates";

export const meta = () => [
  { title: "My Events | IEEE Sahrdaya" },
  { name: "robots", content: "noindex,nofollow" },
];
function financialException(item: MyEventItem) {
  return item.registration.status === "cancelled" && item.registration.paymentStatus === "paid";
}

function isPublicEventRecord(item: MyEventItem) {
  return !item.event.isArchived && (item.event.status === "published" || item.event.status === "completed");
}


function needsAction(item: MyEventItem) {
  return item.registration.paymentRequired || item.registration.manualReview || financialException(item);
}

function eventLocation(item: MyEventItem) {
  if (item.event.attendanceMode === "online") return "Online";
  return item.event.venue || item.event.locationAddress || "Venue to be confirmed";
}

function attendanceLabel(item: MyEventItem) {
  const attendance = item.attendance;
  if (attendance.mode === "sessions") {
    return `${attendance.attendedSessions}/${attendance.totalSessions} sessions attended`;
  }
  return attendance.checkedIn ? "Attendance recorded" : "No attendance recorded";
}

function paymentLabel(item: MyEventItem) {
  if (item.registration.manualReview) return "Payment under review";
  if (item.registration.paymentRequired) return "Payment required";
  if (item.registration.paymentStatus === "paid") return "Paid";
  if (item.registration.paymentStatus === "refunded") return "Refunded";
  return item.registration.status === "confirmed" ? "Confirmed" : item.registration.status;
}
function PrimaryAction({ item }: { item: MyEventItem }) {
  if (item.registration.manualReview || financialException(item)) return null;
  if (item.registration.paymentRequired) {
    return <Link className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" to={`/payment/${item.registration.id}`}>Continue payment <ArrowRight className="h-4 w-4" /></Link>;
  }
  const certificate = item.certificates[0];
  if (item.privateAccess?.virtualJoinUrl) {
    return <a className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" href={item.privateAccess.virtualJoinUrl} target="_blank" rel="noopener noreferrer">Join event <ExternalLink className="h-4 w-4" /></a>;
  }
  const certificateReady = Boolean(certificate && (item.ended || item.event.isArchived || item.event.status === "completed" || item.event.status === "cancelled"));
  if (certificateReady && certificate) {
    return <Link className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" to={`/c/${certificate.verificationToken}`}>View certificate <Award className="h-4 w-4" /></Link>;
  }
  if (item.registration.ticketId) {
    return <Link className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" to={`/ticket/${item.registration.ticketId}`}>View ticket <Ticket className="h-4 w-4" /></Link>;
  }
  if (certificate) {
    return <Link className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" to={`/c/${certificate.verificationToken}`}>View certificate <Award className="h-4 w-4" /></Link>;
  }
  if (isPublicEventRecord(item)) {
    return <a className="inline-flex min-h-11 items-center gap-2 bg-[#00629B] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004f7d]" href={`/events/${item.event.slug}/calendar.ics`}>Add to calendar <CalendarPlus className="h-4 w-4" /></a>;
  }
  return null;
}

function EventArtwork({ item }: { item: MyEventItem }) {
  if (item.event.bannerUrl) {
    return <img src={item.event.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />;
  }
  return <div className="flex h-full w-full items-end bg-[#07121f] p-4 text-xs font-bold uppercase tracking-[0.18em] text-white/50">IEEE Sahrdaya</div>;
}
function EventCard({ item }: { item: MyEventItem }) {
  const issue = financialException(item);
  const cancelled = item.event.status === "cancelled" || item.registration.status === "cancelled";
  return (
    <article className="grid overflow-hidden border-t border-black/15 py-6 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6">
      {isPublicEventRecord(item) ? (
        <Link to={`/events/${item.event.slug}`} className="mb-5 aspect-[4/3] overflow-hidden bg-[#07121f] sm:mb-0"><EventArtwork item={item} /></Link>
      ) : (
        <div className="mb-5 aspect-[4/3] overflow-hidden bg-[#07121f] sm:mb-0"><EventArtwork item={item} /></div>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">{item.event.society?.name || "IEEE Sahrdaya"}</p>
            {isPublicEventRecord(item) ? (
              <Link to={`/events/${item.event.slug}`} className="mt-2 block text-2xl font-semibold leading-[1] tracking-[-0.04em] transition hover:text-[#00629B] sm:text-3xl">{item.event.title}</Link>
            ) : (
              <h3 className="mt-2 text-2xl font-semibold leading-[1] tracking-[-0.04em] sm:text-3xl">{item.event.title}</h3>
            )}
          </div>
          <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${cancelled ? "text-rose-700" : needsAction(item) ? "text-amber-700" : "text-black/40"}`}>
            {cancelled ? "Cancelled" : paymentLabel(item)}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-black/48">
          <span>{formatDate(item.event.date)} · {formatEventTime(item.event.date, item.event.timeTbc)}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{eventLocation(item)}</span>
        </div>
        {(item.ended || item.event.isArchived || item.event.status === "completed") && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-black/55">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-700" />{attendanceLabel(item)}</span>
            {item.certificates.length > 0 && <span>{item.certificates.length} certificate{item.certificates.length === 1 ? "" : "s"}</span>}
          </div>
        )}
        {item.registration.manualReview && (
          <div className="mt-4 flex gap-2 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-amber-900">
            <Clock3 className="mt-1 h-4 w-4 shrink-0" />
            <p>An organiser is reviewing this payment. Do not register or pay again.</p>
          </div>
        )}
        {issue && (
          <div className="mt-4 flex gap-2 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-amber-900">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
            <p>This registration is cancelled but still recorded as paid. An organiser needs to resolve the financial record.</p>
          </div>
        )}
        {item.privateAccess?.joinInstructions && (
          <div className="mt-4 border-l-2 border-[#00629B] pl-3 text-sm leading-6 text-black/60">
            {item.privateAccess.joinInstructions}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PrimaryAction item={item} />
          {isPublicEventRecord(item) && (
            <Link to={`/events/${item.event.slug}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-black/48 transition hover:text-[#00629B]">
              Event details <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {isPublicEventRecord(item) && (
            <a href={`/events/${item.event.slug}/calendar.ics`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-black/48 transition hover:text-[#00629B]">
              Calendar <CalendarPlus className="h-3.5 w-3.5" />
            </a>
          )}
          {item.registration.ticketId && (item.privateAccess?.virtualJoinUrl || item.certificates.length > 0) && (
            <Link to={`/ticket/${item.registration.ticketId}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-black/48 transition hover:text-[#00629B]">
              Ticket <Ticket className="h-3.5 w-3.5" />
            </Link>
          )}
          {item.certificates[0] && !(item.ended || item.event.isArchived || item.event.status === "completed" || item.event.status === "cancelled") && (
            <Link to={`/c/${item.certificates[0].verificationToken}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-black/48 transition hover:text-[#00629B]">
              Certificate <Award className="h-3.5 w-3.5" />
            </Link>
          )}
          {item.registration.receiptAvailable && (
            <button type="button" onClick={() => void downloadRegistrationReceipt(item.registration.id).catch(() => undefined)} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-black/48 transition hover:text-[#00629B]">
              Receipt <ReceiptText className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function EventSection({ title, eyebrow, items }: { title: string; eyebrow: string; items: MyEventItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-14">
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">{eyebrow}</p>
      <h2 className="mt-2 text-4xl font-semibold tracking-[-0.055em]">{title}</h2>
      <div className="mt-6">{items.map((item) => <EventCard key={`${item.event.id}-${item.registration.id}`} item={item} />)}</div>
    </section>
  );
}
export default function MyEventsPage() {
  const { user, status } = useAuth();
  const query = useQuery({
    queryKey: ["my-events", user?.id],
    queryFn: listMyEvents,
    enabled: status === "authenticated" && Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });

  const items = query.data?.items || [];
  const action = items.filter(needsAction);
  const actionIds = new Set(action.map((item) => item.registration.id));
  const upcoming = items.filter((item) => !item.ended && !item.event.isArchived && item.event.status !== "completed" && item.event.status !== "cancelled" && item.registration.status !== "cancelled" && !actionIds.has(item.registration.id));
  const past = items.filter((item) => (item.ended || item.event.isArchived || item.event.status === "completed" || item.event.status === "cancelled" || item.registration.status === "cancelled") && !actionIds.has(item.registration.id));

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar mobileAlign="right" />
      <section className="border-b border-black/10 bg-[#07121f] text-white">
        <div className="mx-auto max-w-[1200px] px-5 pb-12 pt-28 sm:px-8 lg:px-12 lg:pb-16 lg:pt-36">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#58c6ff]">Attendee record</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.065em] sm:text-7xl">Your events, in one place.</h1>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-white/50 sm:text-base">Tickets, payments, attendee access, attendance and certificates stay available after you leave an event page.</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        {status === "loading" ? (
          <p className="py-16 text-sm font-semibold text-black/45">Loading your account…</p>
        ) : status !== "authenticated" ? (
          <div className="border-y border-black/15 py-14">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Sign in required</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.055em]">Use your Sahrdaya account to open your attendee record.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-black/50">Sign in from the navigation above. Only registrations linked to your account are shown here.</p>
          </div>
        ) : query.isLoading ? (
          <p className="py-16 text-sm font-semibold text-black/45">Loading your registrations…</p>
        ) : query.isError ? (
          <div className="border-y border-rose-200 py-10 text-rose-800">
            <p className="font-semibold">Your event record could not be loaded.</p>
            <button type="button" onClick={() => void query.refetch()} className="mt-4 min-h-11 text-sm font-bold underline underline-offset-4">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="border-y border-black/15 py-14">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">No registrations yet</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Your first event will appear here.</h2>
            <Link to="/events" className="mt-7 inline-flex min-h-11 items-center gap-2 font-bold text-[#00629B]">Browse events <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <>
            <div className="grid gap-4 border-b border-black/10 pb-8 sm:grid-cols-3">
              <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Action needed</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{action.length}</p></div>
              <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Upcoming</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{upcoming.length}</p></div>
              <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Past</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{past.length}</p></div>
            </div>
            <EventSection eyebrow="Needs your attention" title="Action needed." items={action} />
            <EventSection eyebrow="What’s ahead" title="Upcoming." items={upcoming} />
            <EventSection eyebrow="Your history" title="Past events." items={past} />
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
