import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";

import { getTicket, type PublicTicketData } from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import { formatDateShort } from "@/lib/dates";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import { isPastEvent } from "@/lib/event-lifecycle";
import { logError } from "@/lib/logger";
import { downloadQR as downloadQRFile, generateQRDataUrl } from "@/lib/qr-utils";
import { getTicketStatusInfo } from "@/lib/ticketStatus";

interface PageProps {
  ticketId: string;
}

export default function TicketPage({ ticketId }: PageProps) {
  const [ticketData, setTicketData] = useState<PublicTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSaved, setQrSaved] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    let active = true;
    void getTicket(ticketId)
      .then(async (data) => {
        if (!data.found || !data.ticket) throw new Error("Ticket not found");
        if (!active) return;
        setTicketData(data);
        const qr = await generateQRDataUrl(`${window.location.origin}/ticket/${data.ticket.id || ticketId}`);
        if (active) setQrDataUrl(qr);
      })
      .catch((err: unknown) => {
        logError("ticket-page", err);
        if (active) setError(err instanceof Error ? err.message : "Failed to load ticket");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId]);

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const name = ticketData?.registration?.name || "guest";
    downloadQRFile(qrDataUrl, `ticket-${name.replace(/\s+/g, "-").toLowerCase()}.png`);
    setQrSaved(true);
    window.setTimeout(() => setQrSaved(false), 1800);
  };

  const handleReceipt = async () => {
    if (!ticketData?.registration?.id) return;
    try { await downloadRegistrationReceipt(ticketData.registration.id); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Receipt could not be downloaded"); }
  };

  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-[#f4f2ed]"><Loader2 className="h-8 w-8 animate-spin text-[#00629B]" /></div>;
  }

  if (error || !ticketData?.found || !ticketData.ticket) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f4f2ed] px-5 text-[#111315]">
        <div className="w-full max-w-lg border-y border-black/15 py-10 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-600" />
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em]">{error || "Ticket not found"}</h1>
          <p className="mt-3 text-sm leading-6 text-black/50">This ticket doesn&apos;t exist or is no longer available.</p>
          <Link to="/events" className="mt-7 inline-flex font-bold text-[#00629B]">Browse events</Link>
        </div>
      </div>
    );
  }

  const { ticket, event, registration } = ticketData;
  const isPast = event ? isPastEvent({ status: "published", date: event.date, endDate: event.endDate }) : false;
  const status = registration
    ? getTicketStatusInfo(registration.registrationStatus || registration.paymentStatus, isPast)
    : getTicketStatusInfo(ticket.registrationStatus || ticket.paymentStatus, isPast);
  const iconMap: Record<string, React.ElementType> = { CheckCircle2, Clock, AlertCircle };
  const StatusIcon = iconMap[status.iconName] || AlertCircle;
  const isPaid = ticket.paymentStatus === "paid" || registration?.paymentStatus === "paid";

  return (
    <div className="min-h-dvh bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <header className="border-b border-black/12">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
          <Link to="/" className="text-[10px] font-black uppercase tracking-[0.22em]">IEEE Sahrdaya</Link>
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">Ticket / Ready</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <Link to="/events" className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-black/42 hover:text-[#00629B]"><ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Events</Link>

        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE }}
          className="mt-8 overflow-hidden border border-black/15 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"
        >
          <section className="flex min-h-[470px] flex-col justify-between bg-[#111315] p-7 text-white sm:p-10 lg:min-h-[650px] lg:p-12">
            <div className="flex items-start justify-between gap-5">
              <div className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55"><StatusIcon className="h-4 w-4" /> {status.text}</div>
              <div className="flex gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">
                {isPaid && <span>Paid</span>}
                {isPast && <span>Past event</span>}
              </div>
            </div>

            <div className="py-10 sm:py-14">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-300">Event pass</p>
              <div className="mt-4 overflow-hidden pb-1">
                <motion.h1
                  initial={reduceMotion ? false : { y: "105%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.1 }}
                  className="max-w-3xl text-4xl font-semibold leading-[0.94] tracking-[-0.06em] sm:text-5xl lg:text-6xl"
                >{event?.title || "Event ticket"}</motion.h1>
              </div>
              <div className="relative mt-8 grid grid-cols-2 gap-6 border-t border-white/15 pt-6 text-sm sm:max-w-2xl">
                <motion.span
                  aria-hidden="true"
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.18 }}
                  className="absolute inset-x-0 -top-px h-px origin-left bg-white/45"
                />
                <div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Date</p><p className="mt-2 font-semibold">{event?.date ? formatDateShort(event.date) : "—"}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Venue</p><p className="mt-2 font-semibold leading-snug">{event?.venue || "—"}</p></div>
              </div>
            </div>

            <div className="grid gap-7 border-t border-white/15 pt-7 sm:grid-cols-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Attendee</p>
                <p className="mt-2 text-xl font-semibold">{registration?.name || "Attendee"}</p>
                {registration?.email && <p className="mt-1 text-xs text-white/45">{registration.email}</p>}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Ticket ID</p>
                <p className="mt-2 break-all font-mono text-xs font-bold text-white/80">{ticket.id}</p>
                {registration && <p className="mt-2 text-[10px] text-white/35">Registered {formatDateShort(registration.registrationDate)}</p>}
              </div>
            </div>
          </section>

          <aside className="flex flex-col items-center justify-center bg-white p-7 text-center sm:p-10 lg:p-12">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Check-in code</p>
            <div className="mt-7 border border-black/10 bg-white p-4">
              {qrDataUrl ? (
                <motion.img
                  src={qrDataUrl}
                  alt="Event ticket QR code"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.success, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.12 }}
                  className="h-56 w-56 sm:h-64 sm:w-64"
                />
              ) : <div className="grid h-56 w-56 place-items-center sm:h-64 sm:w-64"><Loader2 className="h-7 w-7 animate-spin text-black/20" /></div>}
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Show this at check-in.</h2>
            <p className="mt-2 max-w-xs text-sm leading-6 text-black/48">Keep this page available on your phone when you arrive.</p>
            <motion.button
              type="button"
              onClick={handleDownloadQR}
              disabled={!qrDataUrl}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="mt-7 inline-flex min-w-24 items-center justify-center gap-2 border-y border-[#00629B] py-3 text-sm font-bold text-[#00629B] disabled:opacity-40"
            >
              {qrSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</> : <><Download className="h-4 w-4" /> Save QR</>}
            </motion.button>
          </aside>
        </motion.article>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-5 border-b border-black/12 pb-7">
          <p className="text-xs text-black/40">One ticket, tied to your registration.</p>
          <div className="flex flex-wrap gap-5">
            {isPaid && registration && <button type="button" onClick={() => void handleReceipt()} className="inline-flex items-center gap-2 text-sm font-bold text-black/50 hover:text-[#00629B]"><ReceiptText className="h-4 w-4" /> Payment receipt</button>}
            <Link to="/events" className="text-sm font-bold text-[#00629B]">Browse events</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
